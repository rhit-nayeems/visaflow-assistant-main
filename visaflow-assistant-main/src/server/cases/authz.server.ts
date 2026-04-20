import { normalizeCaseWorkflowDatabaseError } from "./database-errors.ts";
import type { CaseNoteRecord, CaseRecord, CaseWorkflowContext } from "./types.ts";

const CASE_WORKFLOW_CASE_SELECT = [
  "id",
  "user_id",
  "school_template_id",
  "process_type",
  "status",
  "needs_document_reevaluation",
  "employer_name",
  "role_title",
  "work_location",
  "start_date",
  "end_date",
  "case_summary",
  "risk_level",
  "created_at",
  "updated_at",
].join(", ");

const SCHOOL_ADMIN_ROLE = "school_admin";

export const findOwnedCase = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<CaseRecord | null> => {
  const { data, error } = await context.supabase
    .from("cases")
    .select(CASE_WORKFLOW_CASE_SELECT)
    .eq("id", caseId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Case access",
      fallbackMessage: "Unable to load this case.",
    });
  }

  return data as CaseRecord | null;
};

export const loadOwnedCase = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<CaseRecord> => {
  const data = await findOwnedCase(context, caseId);

  if (!data) {
    throw new Error("Case not found or you do not have access.");
  }

  return data;
};

export const assertSchoolAdminReviewer = async (context: CaseWorkflowContext) => {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", SCHOOL_ADMIN_ROLE)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Reviewer access requires the school_admin role.");
  }
};

export const findReviewableCase = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<CaseRecord | null> => {
  await assertSchoolAdminReviewer(context);

  const { data, error } = await context.supabase
    .from("cases")
    .select(CASE_WORKFLOW_CASE_SELECT)
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Case review access",
      fallbackMessage: "Unable to load this case for review.",
    });
  }

  return data as CaseRecord | null;
};

export const loadReviewableCase = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<CaseRecord> => {
  const data = await findReviewableCase(context, caseId);

  if (!data) {
    throw new Error("Case not found or you do not have reviewer access.");
  }

  return data;
};

export const findOwnedCaseNote = async (
  context: CaseWorkflowContext,
  caseId: string,
  noteId: string,
): Promise<CaseNoteRecord | null> => {
  const { data, error } = await context.supabase
    .from("case_notes")
    .select("*")
    .eq("id", noteId)
    .eq("case_id", caseId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
