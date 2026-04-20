import {
  deriveCaseStatusFromRequirements,
  evaluateCaseRequirements,
} from "../../lib/cases/requirements.ts";
import {
  assertValidCaseStatusTransition,
  canRerunDeterministicEvaluation,
} from "../../lib/cases/status.ts";
import { getDocumentTypeLabel } from "../../lib/constants.ts";
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
  CaseWorkflowContext,
  DocumentRecord,
  ExtractedFieldRecord,
  RequirementInsert,
  TimelineEventInsert,
} from "./types.ts";
import type {
  AddCaseNoteInput,
  FinalizeCaseCreationAndEvaluateInput,
  RegisterUploadedCaseDocumentInput,
  ReevaluateCaseAfterUploadsInput,
  SaveCaseDraftInput,
} from "./validation.ts";

const FINALIZE_CASE_REQUIREMENT_EVALUATION_RPC = "finalize_case_requirement_evaluation";

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
  await loadOwnedCase(context, input.caseId);

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

  return {
    documentId: registeredDocument.id,
    documentType: registeredDocument.document_type,
    versionNumber: registeredDocument.version_number,
    createdNew: registeredDocument.created_new,
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
