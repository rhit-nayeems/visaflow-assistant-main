import type { Tables } from "../../integrations/supabase/types.ts";
import { assertValidCaseStatusTransition, shouldMoveToChangePending } from "./status.ts";
import { deriveCaseStatusFromRequirements, evaluateCaseRequirements } from "./requirements.ts";

type Case = Tables<"cases">;
export type CaseDetails = Pick<
  Case,
  "employer_name" | "role_title" | "work_location" | "start_date" | "end_date" | "case_summary"
>;

export const canEditCaseDetails = (status: Case["status"]) =>
  !["submitted", "denied", "completed"].includes(status);

export const planCaseDetailsUpdate = (input: {
  caseData: Case;
  details: CaseDetails;
  documents: Tables<"documents">[];
  extractedFields: Tables<"extracted_fields">[];
  templateConfig: unknown;
}) => {
  if (!canEditCaseDetails(input.caseData.status)) {
    throw new Error("Case details cannot be edited while submitted, denied, or completed.");
  }
  const requirements = evaluateCaseRequirements({
    ...input,
    caseData: { ...input.caseData, ...input.details },
  });
  const needsReapproval = shouldMoveToChangePending(input.caseData, input.details);
  const status =
    needsReapproval || input.caseData.status === "change_pending"
      ? "change_pending"
      : input.caseData.status === "approved"
        ? "approved"
        : deriveCaseStatusFromRequirements(requirements);
  assertValidCaseStatusTransition(input.caseData.status, status);
  return { status, requirements, needsReapproval };
};
