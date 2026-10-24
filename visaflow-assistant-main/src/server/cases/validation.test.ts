import assert from "node:assert/strict";
import test from "node:test";
import { validateSaveCaseDraftInput, validateUpdateCaseDetailsInput } from "./validation.ts";

const details = {
  caseId: "case-1",
  expectedUpdatedAt: "2026-10-08T00:00:00Z",
  schoolId: "school-1",
  employerName: " Acme ",
  startDate: "2026-10-08",
  endDate: "2026-10-09",
};
test("case edits normalize text and allow missing fields to become explicit blockers", () => {
  const result = validateUpdateCaseDetailsInput({ ...details, workLocation: "   " });
  assert.equal(result.employerName, "Acme");
  assert.equal(result.workLocation, null);
});
test("create and edit validators reject impossible dates and reversed ranges", () => {
  for (const validate of [validateSaveCaseDraftInput, validateUpdateCaseDetailsInput]) {
    for (const startDate of ["2026-02-30", "2026-13-01", "2026-1-01", "bad date"])
      assert.throws(() => validate({ ...details, startDate }), /valid date/);
    assert.throws(() => validate({ ...details, endDate: "2026-10-07" }), /End date/);
    assert.doesNotThrow(() =>
      validate({ ...details, startDate: "2028-02-29", endDate: "2028-03-01" }),
    );
  }
});
test("edits require a case version and valid typed values", () => {
  assert.throws(
    () => validateUpdateCaseDetailsInput({ ...details, expectedUpdatedAt: "invalid" }),
    /timestamp/,
  );
  assert.throws(
    () => validateUpdateCaseDetailsInput({ ...details, employerName: 123 }),
    /must be a string/,
  );
});
