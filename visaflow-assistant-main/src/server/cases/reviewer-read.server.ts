import { findReviewableCase, loadReviewerSchoolIds } from "./authz.server.ts";
import { normalizeCaseWorkflowDatabaseError } from "./database-errors.ts";
import type {
  AuditLogRecord,
  CaseRecord,
  CaseWorkflowContext,
  DocumentRecord,
  RequirementRecord,
  TimelineEventRecord,
} from "./types.ts";

const REVIEWER_QUEUE_CASE_SELECT = [
  "id",
  "user_id",
  "employer_name",
  "role_title",
  "work_location",
  "start_date",
  "updated_at",
  "status",
  "school_templates!inner(school_id)",
].join(", ");

type ReviewerQueueCaseBase = Pick<
  CaseRecord,
  | "id"
  | "user_id"
  | "employer_name"
  | "role_title"
  | "work_location"
  | "start_date"
  | "updated_at"
  | "status"
>;

interface ScopedQueueCaseRow extends ReviewerQueueCaseBase {
  school_templates: {
    school_id: string;
  } | null;
}

export type ReviewerQueueCase = ReviewerQueueCaseBase;

export interface ReviewerCaseDetail {
  auditLogs: AuditLogRecord[];
  caseData: CaseRecord;
  documents: DocumentRecord[];
  requirements: RequirementRecord[];
  timeline: TimelineEventRecord[];
}

const stripSchoolTemplateRelation = ({
  school_templates: _schoolTemplate,
  ...caseRecord
}: ScopedQueueCaseRow): ReviewerQueueCase => caseRecord;

export const listReviewerCases = async (
  context: CaseWorkflowContext,
): Promise<ReviewerQueueCase[]> => {
  const reviewerSchoolIds = await loadReviewerSchoolIds(context);

  if (reviewerSchoolIds.length === 0) {
    return [];
  }

  const { data, error } = await context.supabase
    .from("cases")
    .select(REVIEWER_QUEUE_CASE_SELECT)
    .eq("status", "submitted")
    .in("school_templates.school_id", reviewerSchoolIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Review queue",
      fallbackMessage: "Unable to load the review queue.",
    });
  }

  return ((data ?? []) as unknown as ScopedQueueCaseRow[]).map(stripSchoolTemplateRelation);
};

export const loadReviewerCaseDetail = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<ReviewerCaseDetail | null> => {
  const caseData = await findReviewableCase(context, caseId);

  if (!caseData) {
    return null;
  }

  const [documentsRes, requirementsRes, timelineRes, auditRes] = await Promise.all([
    context.supabase
      .from("documents")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    context.supabase.from("case_requirements").select("*").eq("case_id", caseId).order("severity"),
    context.supabase
      .from("case_timeline_events")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("audit_logs")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
  ]);

  const readError =
    documentsRes.error ?? requirementsRes.error ?? timelineRes.error ?? auditRes.error;

  if (readError) {
    throw normalizeCaseWorkflowDatabaseError(readError, {
      operationLabel: "Review case detail",
      fallbackMessage: "Unable to load this case for review.",
    });
  }

  return {
    auditLogs: (auditRes.data ?? []) as AuditLogRecord[],
    caseData,
    documents: (documentsRes.data ?? []) as DocumentRecord[],
    requirements: (requirementsRes.data ?? []) as RequirementRecord[],
    timeline: (timelineRes.data ?? []) as TimelineEventRecord[],
  };
};
