import {
  deriveCaseStatusFromRequirements,
  evaluateCaseRequirements,
} from "@/lib/cases/requirements";
import { assertValidCaseStatusTransition } from "@/lib/cases/status";
import { findOwnedCase, findOwnedCaseNote, loadOwnedCase } from "./authz.server";
import {
  writeCaseTimelineEventBestEffort,
  writeStatusChangeHistoryBestEffort,
} from "./history.server";
import type {
  CaseInsert,
  CaseWorkflowContext,
  CaseUpdate,
  DocumentInsert,
  DocumentRecord,
  ExtractedFieldRecord,
  RequirementInsert,
} from "./types";
import type {
  AddCaseNoteInput,
  FinalizeCaseCreationAndEvaluateInput,
  RegisterUploadedCaseDocumentInput,
  SaveCaseDraftInput,
} from "./validation";

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

const buildDraftInsert = (
  context: CaseWorkflowContext,
  input: SaveCaseDraftInput,
): CaseInsert => ({
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

const findExistingDocumentByUploadRegistrationId = async (
  context: CaseWorkflowContext,
  caseId: string,
  uploadRegistrationId: string,
): Promise<Pick<DocumentRecord, "id"> | null> => {
  const { data, error } = await context.supabase
    .from("documents")
    .select("id")
    .eq("case_id", caseId)
    .eq("upload_registration_id", uploadRegistrationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const loadNextDocumentVersionNumber = async (
  context: CaseWorkflowContext,
  caseId: string,
  documentType: string,
): Promise<number> => {
  const { data, error } = await context.supabase
    .from("documents")
    .select("version_number")
    .eq("case_id", caseId)
    .eq("document_type", documentType)
    .order("version_number", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0]?.version_number ?? 0) + 1;
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
    throw new Error(error.message);
  }
};

export const createCaseDraft = async (
  context: CaseWorkflowContext,
  input: SaveCaseDraftInput,
) => {
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

export const saveCaseDraft = async (
  context: CaseWorkflowContext,
  input: SaveCaseDraftInput,
) => {
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

  const existingDocument = await findExistingDocumentByUploadRegistrationId(
    context,
    input.caseId,
    input.uploadRegistrationId,
  );

  if (existingDocument) {
    return { documentId: existingDocument.id };
  }

  const versionNumber = await loadNextDocumentVersionNumber(
    context,
    input.caseId,
    input.documentType,
  );

  const documentInsert: DocumentInsert = {
    case_id: input.caseId,
    file_name: input.fileName,
    file_path: input.filePath,
    document_type: input.documentType,
    upload_registration_id: input.uploadRegistrationId,
    upload_status: "uploaded",
    version_number: versionNumber,
  };

  const { data, error } = await context.supabase
    .from("documents")
    .insert(documentInsert)
    .select("id")
    .single();

  if (error || !data) {
    const duplicateDocument = await findExistingDocumentByUploadRegistrationId(
      context,
      input.caseId,
      input.uploadRegistrationId,
    );

    if (duplicateDocument) {
      return { documentId: duplicateDocument.id };
    }

    throw new Error(error?.message ?? "Unable to register the uploaded document.");
  }

  await writeCaseTimelineEventBestEffort(context, {
    case_id: input.caseId,
    event_type: "document_uploaded",
    title: "Offer letter uploaded",
    description: input.fileName,
  });

  return { documentId: data.id };
};

export const finalizeCaseCreationAndEvaluate = async (
  context: CaseWorkflowContext,
  input: FinalizeCaseCreationAndEvaluateInput,
) => {
  const caseData = await loadOwnedCase(context, input.caseId);

  const [templateConfig, documents] = await Promise.all([
    loadTemplateConfig(context, caseData.school_template_id),
    loadCaseDocuments(context, input.caseId),
  ]);
  const extractedFields = await loadExtractedFields(context, documents);

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

export const addCaseNote = async (
  context: CaseWorkflowContext,
  input: AddCaseNoteInput,
) => {
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

