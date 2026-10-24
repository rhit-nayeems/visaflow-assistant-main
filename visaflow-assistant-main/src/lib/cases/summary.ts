import type { Tables } from "../../integrations/supabase/types.ts";
import { summarizeRequirementRows } from "./requirements.ts";

export const daysUntilCaseStart = (startDate: string | null, now = new Date()) => {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Number.isFinite(start.getTime())
    ? Math.round((start.getTime() - today.getTime()) / 86400000)
    : null;
};

export const isUpcomingCaseDeadline = (
  caseData: Pick<Tables<"cases">, "status" | "start_date">,
  now = new Date(),
) => {
  if (["approved", "denied", "completed"].includes(caseData.status)) return false;
  const days = daysUntilCaseStart(caseData.start_date, now);
  return days !== null && days >= 0 && days <= 14;
};

export const summarizeDashboardCases = (
  cases: Tables<"cases">[],
  requirements: Tables<"case_requirements">[],
  now = new Date(),
) => {
  const activeCases = cases.filter((item) => !["completed", "denied"].includes(item.status));
  const actionable = activeCases.filter((item) => !["submitted", "approved"].includes(item.status));
  const summaries = new Map(
    cases.map((item) => [
      item.id,
      summarizeRequirementRows(
        requirements.filter((requirement) => requirement.case_id === item.id),
      ),
    ]),
  );
  const blockedCases = actionable.filter((item) => {
    const summary = summaries.get(item.id)!;
    return summary.hasEvaluatedRequirements
      ? summary.blockerCount > 0
      : ["blocked", "missing_documents"].includes(item.status);
  });
  const readyCases = actionable.filter(
    (item) => item.status === "ready_for_submission" && summaries.get(item.id)!.readyForSubmission,
  );
  return {
    activeCases,
    blockedCases,
    readyCases,
    upcomingDeadlines: cases.filter((item) => isUpcomingCaseDeadline(item, now)),
  };
};
