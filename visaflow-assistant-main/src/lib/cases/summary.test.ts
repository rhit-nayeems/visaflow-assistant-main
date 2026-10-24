import assert from "node:assert/strict";
import test from "node:test";
import { caseFixture, requirementFixture } from "./test-fixtures.ts";
import { daysUntilCaseStart, isUpcomingCaseDeadline, summarizeDashboardCases } from "./summary.ts";

const today = new Date(2026, 9, 8, 15, 30);
test("deadline windows include today and 14 days, exclude past and finished cases", () => {
  assert.equal(daysUntilCaseStart("2026-10-08", today), 0);
  for (const [date, expected] of [
    ["2026-10-07", false],
    ["2026-10-08", true],
    ["2026-10-22", true],
    ["2026-10-23", false],
  ] as const)
    assert.equal(isUpcomingCaseDeadline(caseFixture({ start_date: date }), today), expected);
  for (const status of ["approved", "denied", "completed"] as const)
    assert.equal(
      isUpcomingCaseDeadline(caseFixture({ status, start_date: "2026-10-09" }), today),
      false,
    );
  assert.equal(daysUntilCaseStart(null, today), null);
});
test("dashboard ready counts exclude submitted, approved, and pending review states", () => {
  const cases = (
    [
      "ready_for_submission",
      "submitted",
      "approved",
      "change_pending",
      "completed",
      "denied",
    ] as const
  ).map((status, index) => caseFixture({ id: `case-${index}`, status }));
  const requirements = cases.map((item) => requirementFixture({ case_id: item.id }));
  const summary = summarizeDashboardCases(cases, requirements, today);
  assert.equal(summary.activeCases.length, 4);
  assert.deepEqual(
    summary.readyCases.map((item) => item.status),
    ["ready_for_submission"],
  );
  assert.equal(summary.blockedCases.length, 0);
});
test("dashboard reports unresolved blockers and never treats unevaluated cases as ready", () => {
  const cases = [
    caseFixture({ status: "ready_for_submission" }),
    caseFixture({ id: "case-2", status: "blocked" }),
  ];
  const summary = summarizeDashboardCases(cases, [requirementFixture({ status: "pending" })]);
  assert.equal(summary.readyCases.length, 0);
  assert.equal(summary.blockedCases.length, 2);
});
