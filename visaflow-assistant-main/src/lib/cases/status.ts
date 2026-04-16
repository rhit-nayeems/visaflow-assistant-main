import type { Tables } from "@/integrations/supabase/types";

type CaseRecord = Tables<"cases">;
type CaseStatus = Tables<"cases">["status"];

type ApprovalSensitiveField = "employer_name" | "work_location" | "start_date" | "end_date";

export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  draft: ["missing_documents", "blocked", "ready_for_submission"],
  missing_documents: ["blocked", "ready_for_submission", "submitted"],
  in_progress: ["blocked", "missing_documents", "ready_for_submission", "submitted"],
  blocked: ["missing_documents", "ready_for_submission", "submitted"],
  ready_for_submission: ["submitted", "blocked", "missing_documents"],
  submitted: ["approved", "denied", "change_pending"],
  approved: ["change_pending", "completed"],
  denied: [],
  change_pending: ["submitted", "approved", "denied"],
  completed: [],
};

const APPROVAL_SENSITIVE_FIELDS: ApprovalSensitiveField[] = [
  "employer_name",
  "work_location",
  "start_date",
  "end_date",
];

export const canTransitionCaseStatus = (currentStatus: CaseStatus, nextStatus: CaseStatus) => {
  if (currentStatus === nextStatus) {
    return true;
  }

  return CASE_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
};

export const assertValidCaseStatusTransition = (
  currentStatus: CaseStatus,
  nextStatus: CaseStatus,
): CaseStatus => {
  if (!canTransitionCaseStatus(currentStatus, nextStatus)) {
    throw new Error(`Invalid case status transition: ${currentStatus} -> ${nextStatus}`);
  }

  return nextStatus;
};

export const getApprovalSensitiveFieldChanges = (
  previousCase: Pick<CaseRecord, ApprovalSensitiveField | "status">,
  nextValues: Partial<Pick<CaseRecord, ApprovalSensitiveField>>,
): ApprovalSensitiveField[] =>
  APPROVAL_SENSITIVE_FIELDS.filter((field) => {
    if (!(field in nextValues)) {
      return false;
    }

    return previousCase[field] !== nextValues[field];
  });

export const shouldMoveToChangePending = (
  previousCase: Pick<CaseRecord, ApprovalSensitiveField | "status">,
  nextValues: Partial<Pick<CaseRecord, ApprovalSensitiveField>>,
) =>
  previousCase.status === "approved" &&
  getApprovalSensitiveFieldChanges(previousCase, nextValues).length > 0;
