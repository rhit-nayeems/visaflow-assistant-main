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

const REVIEWABLE_CASE_SELECT = `${CASE_WORKFLOW_CASE_SELECT}, school_templates!inner(school_id)`;
const REVIEWABLE_CASE_STATUSES = [
  "submitted",
  "approved",
  "denied",
  "change_pending",
  "completed",
] as const;
const SCHOOL_ADMIN_ROLE = "school_admin";

interface ReviewableCaseRow extends CaseRecord {
  school_templates: {
    school_id: string;
  } | null;
}

const withoutSchoolTemplateRelation = ({
  school_templates: _schoolTemplate,
  ...caseRecord
}: ReviewableCaseRow): CaseRecord => caseRecord;

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

export const loadReviewerSchoolIds = async (context: CaseWorkflowContext): Promise<string[]> => {
  await assertSchoolAdminReviewer(context);

  const { data, error } = await context.supabase
    .from("reviewer_school_assignments")
    .select("school_id")
    .eq("user_id", context.userId);

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(new Set((data ?? []).map(({ school_id }) => school_id)));
};

export const findReviewableCase = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<CaseRecord | null> => {
  const reviewerSchoolIds = await loadReviewerSchoolIds(context);

  if (reviewerSchoolIds.length === 0) {
    return null;
  }

  const { data, error } = await context.supabase
    .from("cases")
    .select(REVIEWABLE_CASE_SELECT)
    .eq("id", caseId)
    .in("school_templates.school_id", reviewerSchoolIds)
    .in("status", REVIEWABLE_CASE_STATUSES)
    .maybeSingle();

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Case review access",
      fallbackMessage: "Unable to load this case for review.",
    });
  }

  return data ? withoutSchoolTemplateRelation(data as unknown as ReviewableCaseRow) : null;
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
