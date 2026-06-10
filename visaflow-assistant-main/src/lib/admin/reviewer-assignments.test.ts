import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupAssignmentsBySchool,
  reviewerDisplayName,
  type ReviewerAssignment,
} from "./reviewer-assignments.ts";

const assignment = (overrides: Partial<ReviewerAssignment>): ReviewerAssignment => ({
  assignmentId: "a1",
  userId: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.edu",
  schoolId: "s1",
  schoolName: "Beta University",
  createdAt: "2026-06-10T00:00:00.000Z",
  ...overrides,
});

test("reviewerDisplayName prefers name, then email, then user id", () => {
  assert.equal(reviewerDisplayName({ fullName: "Ada", email: "a@x.edu", userId: "u" }), "Ada");
  assert.equal(reviewerDisplayName({ fullName: "  ", email: "a@x.edu", userId: "u" }), "a@x.edu");
  assert.equal(reviewerDisplayName({ fullName: null, email: null, userId: "u-123" }), "u-123");
});

test("groupAssignmentsBySchool groups by school and sorts schools and reviewers", () => {
  const groups = groupAssignmentsBySchool([
    assignment({ assignmentId: "a1", schoolId: "s2", schoolName: "Zeta College", fullName: "Zoe" }),
    assignment({
      assignmentId: "a2",
      schoolId: "s1",
      schoolName: "Alpha University",
      fullName: "Mia",
    }),
    assignment({
      assignmentId: "a3",
      schoolId: "s1",
      schoolName: "Alpha University",
      fullName: "Ada",
    }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.schoolName),
    ["Alpha University", "Zeta College"],
  );
  // Reviewers within Alpha University are sorted by display name (Ada before Mia).
  assert.deepEqual(
    groups[0].reviewers.map((reviewer) => reviewer.fullName),
    ["Ada", "Mia"],
  );
  assert.equal(groups[1].reviewers.length, 1);
});

test("groupAssignmentsBySchool returns an empty list for no assignments", () => {
  assert.deepEqual(groupAssignmentsBySchool([]), []);
});
