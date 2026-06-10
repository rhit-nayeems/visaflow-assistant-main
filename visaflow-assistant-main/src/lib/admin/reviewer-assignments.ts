/**
 * Shared shapes and pure helpers for reviewer-assignment administration. The server maps the
 * snake_case RPC rows into these camelCase types; the admin UI renders them. Kept free of any
 * Supabase/React imports so the grouping/labeling logic stays unit-testable.
 */

export interface ReviewerAssignment {
  assignmentId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  schoolId: string;
  schoolName: string;
  createdAt: string;
}

export interface AssignableReviewer {
  userId: string;
  fullName: string | null;
  email: string | null;
}

export interface AssignableSchool {
  id: string;
  name: string;
}

export interface ReviewerAssignmentGroup {
  schoolId: string;
  schoolName: string;
  reviewers: ReviewerAssignment[];
}

/** Best available human label for a reviewer: name, then email, then the raw user id. */
export function reviewerDisplayName(reviewer: {
  fullName: string | null;
  email: string | null;
  userId: string;
}): string {
  return reviewer.fullName?.trim() || reviewer.email?.trim() || reviewer.userId;
}

/**
 * Group a flat assignment list by school, sorting schools by name and reviewers within each
 * school by their display label. Pure and unit-tested.
 */
export function groupAssignmentsBySchool(
  assignments: ReviewerAssignment[],
): ReviewerAssignmentGroup[] {
  const groupsBySchool = new Map<string, ReviewerAssignmentGroup>();

  for (const assignment of assignments) {
    let group = groupsBySchool.get(assignment.schoolId);
    if (!group) {
      group = {
        schoolId: assignment.schoolId,
        schoolName: assignment.schoolName,
        reviewers: [],
      };
      groupsBySchool.set(assignment.schoolId, group);
    }
    group.reviewers.push(assignment);
  }

  const groups = Array.from(groupsBySchool.values());
  groups.sort((left, right) => left.schoolName.localeCompare(right.schoolName));
  for (const group of groups) {
    group.reviewers.sort((left, right) =>
      reviewerDisplayName(left).localeCompare(reviewerDisplayName(right)),
    );
  }

  return groups;
}
