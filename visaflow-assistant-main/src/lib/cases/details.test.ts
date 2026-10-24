import assert from "node:assert/strict";
import test from "node:test";
import { caseFixture, requirementFixture } from "./test-fixtures.ts";
import { planCaseDetailsUpdate } from "./details.ts";
import { canTransitionCaseStatus } from "./status.ts";
import {
  evaluateCaseRequirements,
  getCaseNextRecommendedAction,
  summarizeRequirementRows,
} from "./requirements.ts";

const templateConfig = {
  requirements: [
    { key: "employer", label: "Employer provided", type: "case_field", field: "employer_name" },
  ],
};
const plan = (caseData = caseFixture(), changes = {}) =>
  planCaseDetailsUpdate({
    caseData,
    details: {
      employer_name: caseData.employer_name,
      role_title: caseData.role_title,
      work_location: caseData.work_location,
      start_date: caseData.start_date,
      end_date: caseData.end_date,
      case_summary: caseData.case_summary,
      ...changes,
    },
    documents: [],
    extractedFields: [],
    templateConfig,
  });

for (const [field, value] of Object.entries({
  employer_name: "New company",
  work_location: "Boston",
  start_date: "2099-06-02",
  end_date: "2099-09-01",
})) {
  test(`changing approved ${field} requires reapproval`, () => {
    const result = plan(caseFixture({ status: "approved" }), { [field]: value });
    assert.equal(result.status, "change_pending");
    assert.equal(result.needsReapproval, true);
  });
}
test("unchanged and non-sensitive approved edits preserve status", () => {
  const approved = caseFixture({ status: "approved" });
  assert.equal(plan(approved).status, "approved");
  assert.equal(
    plan(approved, { case_summary: "Note", role_title: "Updated title" }).status,
    "approved",
  );
});
test("ordinary edits reevaluate blockers; pending edits preserve the review cycle", () => {
  assert.equal(plan(caseFixture({ status: "blocked" })).status, "ready_for_submission");
  const missing = plan(caseFixture({ status: "ready_for_submission" }), { employer_name: null });
  assert.equal(missing.status, "blocked");
  assert.ok(missing.requirements.every((item) => item.explanation));
  assert.equal(plan(caseFixture({ status: "change_pending" })).status, "change_pending");
});
test("submitted and terminal cases cannot be edited or transition backwards", () => {
  for (const status of ["submitted", "completed", "denied"] as const)
    assert.throws(() => plan(caseFixture({ status })), /cannot be edited/);
  assert.equal(canTransitionCaseStatus("completed", "draft"), false);
  assert.equal(canTransitionCaseStatus("approved", "ready_for_submission"), false);
});
test("warnings do not block readiness; missing, pending, and waived requirements stay distinct", () => {
  const warning = requirementFixture({ severity: "warning", status: "not_met" });
  const summary = summarizeRequirementRows([requirementFixture(), warning]);
  assert.equal(summary.readyForSubmission, true);
  assert.equal(summary.warningCount, 1);
  assert.equal(
    summarizeRequirementRows([requirementFixture({ status: "pending" })]).readyForSubmission,
    false,
  );
  assert.equal(
    summarizeRequirementRows([requirementFixture({ status: "waived" })]).readyForSubmission,
    true,
  );
  assert.equal(summarizeRequirementRows([]).readyForSubmission, false);
});
test("next-action guidance follows the case lifecycle even when requirements are met", () => {
  const summary = summarizeRequirementRows([requirementFixture()]);
  assert.match(getCaseNextRecommendedAction("submitted", summary), /Wait for review/);
  assert.match(getCaseNextRecommendedAction("approved", summary), /reapproval/);
  assert.match(getCaseNextRecommendedAction("change_pending", summary), /resubmit/);
});

test("the default template blocks missing offer-letter fields independently of filled case details", () => {
  const requirements = evaluateCaseRequirements({
    caseData: caseFixture(),
    documents: [],
    extractedFields: [],
    templateConfig: null,
  });
  for (const field of ["employer_name", "role_title", "start_date", "end_date"]) {
    const requirement = requirements.find(
      (item) => item.requirement_key === `offer_letter_${field}`,
    );
    assert.equal(requirement?.severity, "blocker");
    assert.equal(requirement?.status, "not_met");
    assert.ok(requirement?.explanation);
  }
});
