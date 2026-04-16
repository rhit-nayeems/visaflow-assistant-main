// Case status configuration
export const CASE_STATUSES = {
  draft: { label: "Draft", color: "secondary" as const },
  missing_documents: { label: "Missing Documents", color: "warning" as const },
  in_progress: { label: "In Progress", color: "info" as const },
  blocked: { label: "Blocked", color: "destructive" as const },
  ready_for_submission: { label: "Ready for Submission", color: "success" as const },
  submitted: { label: "Submitted", color: "primary" as const },
  approved: { label: "Approved", color: "success" as const },
  denied: { label: "Denied", color: "destructive" as const },
  change_pending: { label: "Change Pending", color: "warning" as const },
  completed: { label: "Completed", color: "success" as const },
} as const;

export type CaseStatusKey = keyof typeof CASE_STATUSES;

export const REQUIREMENT_SEVERITIES = {
  blocker: { label: "Blocker", color: "destructive" as const },
  warning: { label: "Warning", color: "warning" as const },
  info: { label: "Info", color: "info" as const },
} as const;

export const REQUIREMENT_STATUSES = {
  pending: { label: "Pending", color: "secondary" as const },
  met: { label: "Met", color: "success" as const },
  not_met: { label: "Not Met", color: "destructive" as const },
  waived: { label: "Waived", color: "secondary" as const },
} as const;

export const DOCUMENT_TYPES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "i20", label: "I-20 Form" },
  { value: "advisor_approval", label: "Advisor Approval" },
  { value: "course_registration", label: "Course Registration" },
  { value: "other", label: "Other" },
] as const;

export const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
