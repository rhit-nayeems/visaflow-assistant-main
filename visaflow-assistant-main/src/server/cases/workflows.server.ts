import {
  deriveCaseStatusFromRequirements,
  evaluateCaseRequirements,
  getLatestDocumentsByType,
} from "../../lib/cases/requirements.ts";
import {
  STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES,
  canRetryDocumentExtraction,
  hasUnresolvedDocumentExtraction,
} from "../../lib/cases/document-extraction-state.ts";
import {
  assertValidCaseStatusTransition,
  canRerunDeterministicEvaluation,
} from "../../lib/cases/status.ts";
import { getDocumentTypeLabel } from "../../lib/constants.ts";
import { extractDocumentWithLocalStub } from "./document-extraction.ts";
import { findOwnedCase, findOwnedCaseNote, loadOwnedCase } from "./authz.server.ts";
import {
  writeCaseTimelineEventBestEffort,
  writeStatusChangeHistoryBestEffort,
} from "./history.server.ts";
import { normalizeCaseWorkflowDatabaseError } from "./database-errors.ts";
import { registerCaseDocumentRecord } from "./document-registration.ts";
import type {
  CaseInsert,
  CaseRecord,
  CaseStatus,
  CaseUpdate,
  DocumentExtractionStatus,
  CaseWorkflowContext,
  DocumentRecord,
  DocumentUpdate,
  ExtractedFieldRecord,
  RequirementInsert,
  TimelineEventInsert,
} from "./types.ts";
import type {
  AddCaseNoteInput,
  ApproveCaseInput,
  DenyCaseInput,
  FinalizeCaseCreationAndEvaluateInput,
  RegisterUploadedCaseDocumentInput,
  ReevaluateCaseAfterUploadsInput,
  RetryCaseDocumentExtractionInput,
  RequestCaseChangesInput,
  SaveCaseDraftInput,
  SubmitCaseForReviewInput,
} from "./validation.ts";

const FINALIZE_CASE_REQUIREMENT_EVALUATION_RPC = "finalize_case_requirement_evaluation";
const REVIEWER_CASE_DECISION_RPC = "apply_reviewer_case_decision";
type ReviewerDecisionStatus = Extract<CaseStatus, "approved" | "denied" | "change_pending">;

interface ReviewerCaseDecisionRecord {
  case_id: string;
  previous_status: "submitted";
  next_status: ReviewerDecisionStatus;
}

interface DocumentExtractionLifecycleResult {
  extractedFieldCount: number;
  extractionError: string | null;
  extractionStatus: DocumentExtractionStatus;
  reevaluationRequirementCount: number | null;
  reevaluationStatus: CaseStatus | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isReviewerCaseDecisionRecord = (value: unknown): value is ReviewerCaseDecisionRecord =>
  isRecord(value) &&
  typeof value.case_id === "string" &&
  value.previous_status === "submitted" &&
  (value.next_status === "approved" ||
    value.next_status === "denied" ||
    value.next_status === "change_pending");

const buildDraftMutation = (input: SaveCaseDraftInput): CaseUpdate => ({
  school_template_id: input.schoolTemplateId,
  employer_name: input.employerName,
  role_title: input.roleTitle,
  work_location: input.workLocation,
  start_date: input.startDate,
  end_date: input.endDate,
  case_summary: input.caseSummary,
});

const buildDraftInsert = (context: CaseWorkflowContext, input: SaveCaseDraftInput): CaseInsert => ({
  ...(input.draftId ? { id: input.draftId } : {}),
  user_id: context.userId,
  ...buildDraftMutation(input),
  status: "draft",
});

const persistDraftMutation = async (
  context: CaseWorkflowContext,
  caseId: string,
  input: SaveCaseDraftInput,
) => {
  const { error } = await context.supabase
    .from("cases")
    .update(buildDraftMutation(input))
    .eq("id", caseId);

  if (error) {
    throw new Error(error.message);
  }
};

const persistCaseStatus = async (
  context: CaseWorkflowContext,
  caseId: string,
  nextStatus: CaseStatus,
  options: {
    ownerScoped?: boolean;
    operationLabel?: string;
    fallbackMessage?: string;
  } = {},
) => {
  let query = context.supabase.from("cases").update({ status: nextStatus }).eq("id", caseId);

  if (options.ownerScoped ?? true) {
    query = query.eq("user_id", context.userId);
  }

  const { error } = await query;

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: options.operationLabel ?? "Case update",
      fallbackMessage: options.fallbackMessage ?? "Unable to update this case.",
    });
  }
};

const assertActiveSchoolSelection = async (
  context: CaseWorkflowContext,
  input: SaveCaseDraftInput,
) => {
  const { data: school, error: schoolError } = await context.supabase
    .from("schools")
    .select("id")
    .eq("id", input.schoolId)
    .eq("active", true)
    .single();

  if (schoolError || !school) {
    throw new Error("Select an active school before continuing.");
  }

  if (!input.schoolTemplateId) {
    return;
  }

  const { data: template, error: templateError } = await context.supabase
    .from("school_templates")
    .select("id")
    .eq("id", input.schoolTemplateId)
    .eq("school_id", input.schoolId)
    .eq("is_active", true)
    .single();

  if (templateError || !template) {
    throw new Error("Select a valid active CPT template for this school.");
  }
};

const loadTemplateConfig = async (
  context: CaseWorkflowContext,
  schoolTemplateId: string | null,
): Promise<unknown> => {
  if (!schoolTemplateId) {
    return null;
  }

  const { data, error } = await context.supabase
    .from("school_templates")
    .select("config_json")
    .eq("id", schoolTemplateId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data?.config_json ?? null;
};

const loadCaseDocuments = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<DocumentRecord[]> => {
  const { data, error } = await context.supabase
    .from("documents")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

const loadExtractedFields = async (
  context: CaseWorkflowContext,
  documents: DocumentRecord[],
): Promise<ExtractedFieldRecord[]> => {
  const documentIds = documents.map((document) => document.id);

  if (documentIds.length === 0) {
    return [];
  }

  const { data, error } = await context.supabase
    .from("extracted_fields")
    .select("*")
    .in("document_id", documentIds);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

const loadOwnedCaseDocument = async (
  context: CaseWorkflowContext,
  caseId: string,
  documentId: string,
): Promise<DocumentRecord> => {
  const { data, error } = await context.supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("case_id", caseId)
    .maybeSingle();

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Document access",
      fallbackMessage: "Unable to load this case document.",
    });
  }

  if (!data) {
    throw new Error("Document not found or you do not have access.");
  }

  return data as DocumentRecord;
};

const updateDocumentRecord = async (
  context: CaseWorkflowContext,
  caseId: string,
  documentId: string,
  values: DocumentUpdate,
) => {
  const { error } = await context.supabase
    .from("documents")
    .update(values)
    .eq("id", documentId)
    .eq("case_id", caseId);

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Document extraction",
      fallbackMessage: "Unable to update this case document.",
    });
  }
};

const replaceDocumentExtractedFields = async (
  context: CaseWorkflowContext,
  documentId: string,
  extractedFields: Array<{
    confidence_score: number | null;
    field_name: string;
    field_value: string;
  }>,
) => {
  const { error: deleteError } = await context.supabase
    .from("extracted_fields")
    .delete()
    .eq("document_id", documentId);

  if (deleteError) {
    throw normalizeCaseWorkflowDatabaseError(deleteError, {
      operationLabel: "Document extraction",
      fallbackMessage: "Unable to refresh extracted document fields.",
    });
  }

  if (extractedFields.length === 0) {
    return;
  }

  const { error: insertError } = await context.supabase.from("extracted_fields").insert(
    extractedFields.map((field) => ({
      document_id: documentId,
      field_name: field.field_name,
      field_value: field.field_value,
      confidence_score: field.confidence_score,
      manually_corrected: false,
    })),
  );

  if (insertError) {
    throw normalizeCaseWorkflowDatabaseError(insertError, {
      operationLabel: "Document extraction",
      fallbackMessage: "Unable to store extracted document fields.",
    });
  }
};

const downloadCaseDocumentBuffer = async (
  context: CaseWorkflowContext,
  document: Pick<DocumentRecord, "file_path">,
) => {
  const { data, error } = await context.supabase.storage
    .from("case-documents")
    .download(document.file_path);

  if (error || !data) {
    throw new Error(
      error?.message ??
        "Unable to download the uploaded document for local extraction in this build.",
    );
  }

  return data.arrayBuffer();
};

const buildDocumentExtractionTimelineEvent = ({
  caseId,
  documentType,
  errorMessage,
  extractedFieldCount,
  status,
  versionNumber,
}: {
  caseId: string;
  documentType: string;
  errorMessage: string | null;
  extractedFieldCount: number;
  status: Extract<DocumentExtractionStatus, "succeeded" | "failed">;
  versionNumber: number;
}): TimelineEventInsert => {
  const documentLabel = getDocumentTypeLabel(documentType);

  if (status === "failed") {
    return {
      case_id: caseId,
      event_type: "document_extraction_failed",
      title: `${documentLabel} extraction failed`,
      description: errorMessage ?? "Document extraction failed.",
    };
  }

  const fieldSummary =
    extractedFieldCount > 0
      ? `Stored ${extractedFieldCount} normalized extracted field${extractedFieldCount === 1 ? "" : "s"} for version ${versionNumber}.`
      : `Local extraction ran for version ${versionNumber}, but no supported fields were recognized.`;

  return {
    case_id: caseId,
    event_type: "document_extracted",
    title: `${documentLabel} extracted`,
    description: fieldSummary,
  };
};

const updateExistingCaseNote = async (
  context: CaseWorkflowContext,
  caseId: string,
  noteId: string,
  content: string,
) => {
  const { error } = await context.supabase
    .from("case_notes")
    .update({ content })
    .eq("id", noteId)
    .eq("case_id", caseId)
    .eq("user_id", context.userId);

  if (error) {
    throw new Error(error.message);
  }
};

const persistRequirementEvaluation = async (
  context: CaseWorkflowContext,
  caseId: string,
  nextStatus: ReturnType<typeof deriveCaseStatusFromRequirements>,
  requirements: RequirementInsert[],
) => {
  const requirementPayload = requirements.map(
    ({ requirement_key, label, severity, status, explanation, source }) => ({
      requirement_key,
      label,
      severity,
      status,
      explanation,
      source,
    }),
  );

  const { error } = await context.supabase.rpc(FINALIZE_CASE_REQUIREMENT_EVALUATION_RPC, {
    p_case_id: caseId,
    p_next_status: nextStatus,
    p_requirements: requirementPayload,
  });

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Case finalization",
      fallbackMessage: "Unable to finalize this case.",
    });
  }
};

const loadCaseEvaluationState = async (context: CaseWorkflowContext, caseId: string) => {
  const caseData = await loadOwnedCase(context, caseId);
  const [templateConfig, documents] = await Promise.all([
    loadTemplateConfig(context, caseData.school_template_id),
    loadCaseDocuments(context, caseId),
  ]);
  const extractedFields = await loadExtractedFields(context, documents);

  return {
    caseData,
    templateConfig,
    documents,
    extractedFields,
  };
};

const formatCaseStatusLabel = (status: CaseStatus) => status.replace(/_/g, " ");

const assertCaseCanBeSubmittedForReview = ({
  status,
  needsDocumentReevaluation,
}: {
  status: CaseStatus;
  needsDocumentReevaluation: boolean;
}) => {
  if (status !== "ready_for_submission" && status !== "change_pending") {
    throw new Error(
      "Only cases that are ready for submission or awaiting requested changes can be submitted for review.",
    );
  }

  if (needsDocumentReevaluation) {
    throw new Error(
      "Re-run evaluation after recent document uploads before submitting this case for review.",
    );
  }
};

const assertLatestDocumentExtractionsResolvedForSubmission = async (
  context: CaseWorkflowContext,
  caseId: string,
) => {
  const unresolvedLatestDocuments = getLatestDocumentsByType(
    await loadCaseDocuments(context, caseId),
  ).filter((document) => hasUnresolvedDocumentExtraction(document.extraction_status));

  if (unresolvedLatestDocuments.length > 0) {
    throw new Error(
      "Wait for document extraction to finish, or retry any failed or stale extraction, before submitting this case for review.",
    );
  }
};

const assertDocumentExtractionRetryAllowed = (document: DocumentRecord) => {
  if (canRetryDocumentExtraction(document)) {
    return;
  }

  if (document.extraction_status === "processing") {
    throw new Error(
      `Document extraction is still running for this version. Retry becomes available after ${STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES} minutes if processing stays stuck.`,
    );
  }

  if (document.extraction_status === "succeeded") {
    throw new Error("Document extraction already succeeded for this version.");
  }

  throw new Error("Document extraction cannot be retried for this version.");
};

const persistReviewerCaseDecision = async (
  context: CaseWorkflowContext,
  caseId: string,
  nextStatus: ReviewerDecisionStatus,
  reviewerComment: string | null,
) => {
  const { data, error } = await context.supabase
    .rpc(REVIEWER_CASE_DECISION_RPC, {
      p_case_id: caseId,
      p_next_status: nextStatus,
      p_reviewer_comment: reviewerComment,
    })
    .single();

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Case review",
      fallbackMessage: "Unable to update this case.",
    });
  }

  if (
    !isReviewerCaseDecisionRecord(data) ||
    data.case_id !== caseId ||
    data.next_status !== nextStatus
  ) {
    throw new Error("Case review returned an unexpected response.");
  }

  return data;
};

export const buildDocumentUploadTimelineEvent = ({
  caseId,
  documentType,
  fileName,
  versionNumber,
}: {
  caseId: string;
  documentType: string;
  fileName: string;
  versionNumber: number;
}): TimelineEventInsert => {
  const documentLabel = getDocumentTypeLabel(documentType);
  const isReupload = versionNumber > 1;

  return {
    case_id: caseId,
    event_type: "document_uploaded",
    title: `${documentLabel} ${isReupload ? "re-uploaded" : "uploaded"}`,
    description: isReupload ? `${fileName} saved as version ${versionNumber}.` : fileName,
  };
};

export const runDeterministicCaseEvaluation = ({
  caseData,
  documents,
  extractedFields,
  templateConfig,
}: {
  caseData: CaseRecord;
  documents: DocumentRecord[];
  extractedFields: ExtractedFieldRecord[];
  templateConfig: unknown;
}) => {
  const evaluatedRequirements = evaluateCaseRequirements({
    caseData,
    documents,
    extractedFields,
    templateConfig,
  });

  const nextStatus = assertValidCaseStatusTransition(
    caseData.status,
    deriveCaseStatusFromRequirements(evaluatedRequirements),
  );

  return {
    evaluatedRequirements,
    nextStatus,
  };
};

const logSameStatusEvaluation = async (
  context: CaseWorkflowContext,
  caseId: string,
  status: CaseStatus,
) => {
  await writeCaseTimelineEventBestEffort(context, {
    case_id: caseId,
    event_type: "case_evaluated",
    title: "Requirements re-evaluated",
    description: `Deterministic evaluation completed. Status remains ${formatCaseStatusLabel(status)}.`,
  });
};

const failDocumentExtraction = async (
  context: CaseWorkflowContext,
  caseData: CaseRecord,
  document: DocumentRecord,
  errorMessage: string,
): Promise<DocumentExtractionLifecycleResult> => {
  await updateDocumentRecord(context, caseData.id, document.id, {
    extraction_completed_at: new Date().toISOString(),
    extraction_error: errorMessage,
    extraction_status: "failed",
  });

  await writeCaseTimelineEventBestEffort(
    context,
    buildDocumentExtractionTimelineEvent({
      caseId: caseData.id,
      documentType: document.document_type,
      errorMessage,
      extractedFieldCount: 0,
      status: "failed",
      versionNumber: document.version_number,
    }),
  );

  return {
    extractedFieldCount: 0,
    extractionError: errorMessage,
    extractionStatus: "failed",
    reevaluationRequirementCount: null,
    reevaluationStatus: null,
  };
};

const extractCaseDocumentAndMaybeReevaluate = async (
  context: CaseWorkflowContext,
  caseData: CaseRecord,
  document: DocumentRecord,
): Promise<DocumentExtractionLifecycleResult> => {
  await updateDocumentRecord(context, caseData.id, document.id, {
    extraction_completed_at: null,
    extraction_error: null,
    extraction_started_at: new Date().toISOString(),
    extraction_status: "processing",
  });

  let extractedFieldCount = 0;

  try {
    const fileBuffer = await downloadCaseDocumentBuffer(context, document);
    const extractionResult = await extractDocumentWithLocalStub({
      documentType: document.document_type,
      fileBuffer,
      fileName: document.file_name,
    });

    if (extractionResult.status === "failed") {
      return failDocumentExtraction(context, caseData, document, extractionResult.errorMessage);
    }

    extractedFieldCount = extractionResult.extractedFields.length;

    await replaceDocumentExtractedFields(
      context,
      document.id,
      extractionResult.extractedFields.map((field) => ({
        confidence_score: field.confidenceScore,
        field_name: field.fieldName,
        field_value: field.fieldValue,
      })),
    );

    await updateDocumentRecord(context, caseData.id, document.id, {
      extraction_completed_at: new Date().toISOString(),
      extraction_error: null,
      extraction_status: "succeeded",
    });

    await writeCaseTimelineEventBestEffort(
      context,
      buildDocumentExtractionTimelineEvent({
        caseId: caseData.id,
        documentType: document.document_type,
        errorMessage: null,
        extractedFieldCount,
        status: "succeeded",
        versionNumber: document.version_number,
      }),
    );
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error.message : "Document extraction failed unexpectedly.";

    return failDocumentExtraction(context, caseData, document, normalizedError);
  }

  if (!canRerunDeterministicEvaluation(caseData.status)) {
    return {
      extractedFieldCount,
      extractionError: null,
      extractionStatus: "succeeded",
      reevaluationRequirementCount: null,
      reevaluationStatus: null,
    };
  }

  const reevaluationResult = await reevaluateCaseAfterUploads(context, {
    caseId: caseData.id,
  });

  return {
    extractedFieldCount,
    extractionError: null,
    extractionStatus: "succeeded",
    reevaluationRequirementCount: reevaluationResult.requirementCount,
    reevaluationStatus: reevaluationResult.status,
  };
};

const transitionSubmittedCaseByReviewer = async (
  context: CaseWorkflowContext,
  input: { caseId: string; reviewerComment: string | null },
  config: {
    nextStatus: ReviewerDecisionStatus;
  },
) => {
  const decision = await persistReviewerCaseDecision(
    context,
    input.caseId,
    config.nextStatus,
    input.reviewerComment,
  );

  return {
    caseId: input.caseId,
    status: decision.next_status,
  };
};

export const createCaseDraft = async (context: CaseWorkflowContext, input: SaveCaseDraftInput) => {
  await assertActiveSchoolSelection(context, input);

  if (input.draftId) {
    const existingDraft = await findOwnedCase(context, input.draftId);

    if (existingDraft) {
      if (existingDraft.status === "draft") {
        await persistDraftMutation(context, existingDraft.id, input);
      }

      return { caseId: existingDraft.id };
    }
  }

  const { data, error } = await context.supabase
    .from("cases")
    .insert(buildDraftInsert(context, input))
    .select("id")
    .single();

  if (error || !data) {
    if (input.draftId) {
      const existingDraft = await findOwnedCase(context, input.draftId);

      if (existingDraft) {
        if (existingDraft.status === "draft") {
          await persistDraftMutation(context, existingDraft.id, input);
        }

        return { caseId: existingDraft.id };
      }
    }

    throw new Error(error?.message ?? "Unable to create a case draft.");
  }

  await writeCaseTimelineEventBestEffort(context, {
    case_id: data.id,
    event_type: "case_created",
    title: "Case created",
    description: "CPT case draft created",
  });

  return { caseId: data.id };
};

export const updateCaseDraft = async (
  context: CaseWorkflowContext,
  input: SaveCaseDraftInput & { caseId: string },
) => {
  await loadOwnedCase(context, input.caseId);
  await assertActiveSchoolSelection(context, input);
  await persistDraftMutation(context, input.caseId, input);

  return { caseId: input.caseId };
};

export const saveCaseDraft = async (context: CaseWorkflowContext, input: SaveCaseDraftInput) => {
  if (input.caseId) {
    return updateCaseDraft(context, { ...input, caseId: input.caseId });
  }

  return createCaseDraft(context, input);
};

export const registerUploadedCaseDocument = async (
  context: CaseWorkflowContext,
  input: RegisterUploadedCaseDocumentInput,
) => {
  const caseData = await loadOwnedCase(context, input.caseId);

  const caseStoragePrefix = `${context.userId}/${input.caseId}/${input.uploadRegistrationId}/`;

  if (!input.filePath.startsWith(caseStoragePrefix)) {
    throw new Error("Uploaded files must stay inside the current case folder.");
  }

  const registeredDocument = await registerCaseDocumentRecord(context.supabase, {
    caseId: input.caseId,
    documentType: input.documentType,
    fileName: input.fileName,
    filePath: input.filePath,
    uploadRegistrationId: input.uploadRegistrationId,
  });

  if (registeredDocument.created_new) {
    await writeCaseTimelineEventBestEffort(
      context,
      buildDocumentUploadTimelineEvent({
        caseId: input.caseId,
        documentType: registeredDocument.document_type,
        fileName: registeredDocument.file_name,
        versionNumber: registeredDocument.version_number,
      }),
    );
  }

  const extractionLifecycle = registeredDocument.created_new
    ? await extractCaseDocumentAndMaybeReevaluate(context, caseData, {
        case_id: registeredDocument.case_id,
        created_at: registeredDocument.created_at,
        document_type: registeredDocument.document_type,
        extraction_completed_at: registeredDocument.extraction_completed_at,
        extraction_error: registeredDocument.extraction_error,
        extraction_started_at: registeredDocument.extraction_started_at,
        extraction_status: registeredDocument.extraction_status as DocumentExtractionStatus,
        file_name: registeredDocument.file_name,
        file_path: registeredDocument.file_path,
        id: registeredDocument.id,
        upload_registration_id: registeredDocument.upload_registration_id,
        upload_status: registeredDocument.upload_status,
        version_number: registeredDocument.version_number,
      })
    : {
        extractedFieldCount: 0,
        extractionError: registeredDocument.extraction_error,
        extractionStatus: registeredDocument.extraction_status as DocumentExtractionStatus,
        reevaluationRequirementCount: null,
        reevaluationStatus: null,
      };

  return {
    extractedFieldCount: extractionLifecycle.extractedFieldCount,
    extractionError: extractionLifecycle.extractionError,
    extractionStatus: extractionLifecycle.extractionStatus,
    documentId: registeredDocument.id,
    documentType: registeredDocument.document_type,
    versionNumber: registeredDocument.version_number,
    createdNew: registeredDocument.created_new,
    reevaluationRequirementCount: extractionLifecycle.reevaluationRequirementCount,
    reevaluationStatus: extractionLifecycle.reevaluationStatus,
  };
};

export const finalizeCaseCreationAndEvaluate = async (
  context: CaseWorkflowContext,
  input: FinalizeCaseCreationAndEvaluateInput,
) => {
  const { caseData, templateConfig, documents, extractedFields } = await loadCaseEvaluationState(
    context,
    input.caseId,
  );

  const { evaluatedRequirements, nextStatus } = runDeterministicCaseEvaluation({
    caseData,
    documents,
    extractedFields,
    templateConfig,
  });

  await persistRequirementEvaluation(context, input.caseId, nextStatus, evaluatedRequirements);

  if (caseData.status !== nextStatus) {
    await writeStatusChangeHistoryBestEffort(context, {
      caseId: input.caseId,
      previousStatus: caseData.status,
      nextStatus,
      description: "Initial requirement evaluation completed.",
      reason: "Initial deterministic CPT requirement evaluation completed.",
    });
  }

  return {
    caseId: input.caseId,
    status: nextStatus,
  };
};

export const reevaluateCaseAfterUploads = async (
  context: CaseWorkflowContext,
  input: ReevaluateCaseAfterUploadsInput,
) => {
  const { caseData, templateConfig, documents, extractedFields } = await loadCaseEvaluationState(
    context,
    input.caseId,
  );

  if (!canRerunDeterministicEvaluation(caseData.status)) {
    throw new Error("This case cannot be re-evaluated from its current status.");
  }

  const { evaluatedRequirements, nextStatus } = runDeterministicCaseEvaluation({
    caseData,
    documents,
    extractedFields,
    templateConfig,
  });

  await persistRequirementEvaluation(context, input.caseId, nextStatus, evaluatedRequirements);

  if (caseData.status !== nextStatus) {
    await writeStatusChangeHistoryBestEffort(context, {
      caseId: input.caseId,
      previousStatus: caseData.status,
      nextStatus,
      description: "Requirements re-evaluated after document uploads.",
      reason:
        "Deterministic CPT requirement evaluation re-ran after new or updated documents were uploaded.",
    });
  } else {
    await logSameStatusEvaluation(context, input.caseId, nextStatus);
  }

  return {
    caseId: input.caseId,
    status: nextStatus,
    requirementCount: evaluatedRequirements.length,
  };
};

export const retryCaseDocumentExtraction = async (
  context: CaseWorkflowContext,
  input: RetryCaseDocumentExtractionInput,
) => {
  const caseData = await loadOwnedCase(context, input.caseId);
  const document = await loadOwnedCaseDocument(context, input.caseId, input.documentId);
  assertDocumentExtractionRetryAllowed(document);
  const extractionLifecycle = await extractCaseDocumentAndMaybeReevaluate(
    context,
    caseData,
    document,
  );

  return {
    caseId: input.caseId,
    documentId: document.id,
    documentType: document.document_type,
    extractedFieldCount: extractionLifecycle.extractedFieldCount,
    extractionError: extractionLifecycle.extractionError,
    extractionStatus: extractionLifecycle.extractionStatus,
    reevaluationRequirementCount: extractionLifecycle.reevaluationRequirementCount,
    reevaluationStatus: extractionLifecycle.reevaluationStatus,
    versionNumber: document.version_number,
  };
};

export const submitCaseForReview = async (
  context: CaseWorkflowContext,
  input: SubmitCaseForReviewInput,
) => {
  const caseData = await loadOwnedCase(context, input.caseId);
  const previousStatus = caseData.status;

  assertCaseCanBeSubmittedForReview({
    status: previousStatus,
    needsDocumentReevaluation: caseData.needs_document_reevaluation,
  });

  await assertLatestDocumentExtractionsResolvedForSubmission(context, input.caseId);

  const nextStatus = assertValidCaseStatusTransition(previousStatus, "submitted");

  await persistCaseStatus(context, input.caseId, nextStatus);

  await writeStatusChangeHistoryBestEffort(context, {
    caseId: input.caseId,
    previousStatus,
    nextStatus,
    description:
      previousStatus === "change_pending"
        ? "Case resubmitted for review after requested changes."
        : "Case submitted for review.",
    reason:
      previousStatus === "change_pending"
        ? "Student resubmitted the case for review after requested changes."
        : "Student submitted the case for review after deterministic evaluation marked it ready for submission.",
  });

  return {
    caseId: input.caseId,
    status: nextStatus,
  };
};

export const approveCase = async (context: CaseWorkflowContext, input: ApproveCaseInput) =>
  transitionSubmittedCaseByReviewer(context, input, {
    nextStatus: "approved",
  });

export const denyCase = async (context: CaseWorkflowContext, input: DenyCaseInput) =>
  transitionSubmittedCaseByReviewer(context, input, {
    nextStatus: "denied",
  });

export const requestCaseChanges = async (
  context: CaseWorkflowContext,
  input: RequestCaseChangesInput,
) =>
  transitionSubmittedCaseByReviewer(context, input, {
    nextStatus: "change_pending",
  });

export const addCaseNote = async (context: CaseWorkflowContext, input: AddCaseNoteInput) => {
  await loadOwnedCase(context, input.caseId);

  if (input.noteId) {
    const existingNote = await findOwnedCaseNote(context, input.caseId, input.noteId);

    if (existingNote) {
      if (existingNote.content !== input.content) {
        await updateExistingCaseNote(context, input.caseId, existingNote.id, input.content);
      }

      return { noteId: existingNote.id };
    }
  }

  const { data, error } = await context.supabase
    .from("case_notes")
    .insert({
      ...(input.noteId ? { id: input.noteId } : {}),
      case_id: input.caseId,
      user_id: context.userId,
      content: input.content,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (input.noteId) {
      const existingNote = await findOwnedCaseNote(context, input.caseId, input.noteId);

      if (existingNote) {
        if (existingNote.content !== input.content) {
          await updateExistingCaseNote(context, input.caseId, existingNote.id, input.content);
        }

        return { noteId: existingNote.id };
      }
    }

    throw new Error(error?.message ?? "Unable to add this note.");
  }

  await writeCaseTimelineEventBestEffort(context, {
    case_id: input.caseId,
    event_type: "note_added",
    title: "Note added",
    description: input.content.slice(0, 100),
  });

  return { noteId: data.id };
};
