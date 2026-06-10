import type { CaseWorkflowContext } from "../cases/types.ts";
import type {
  AssignableReviewer,
  AssignableSchool,
  ReviewerAssignment,
} from "../../lib/admin/reviewer-assignments.ts";

const PLATFORM_ADMIN_ROLE = "platform_admin";

export interface ReviewerAdminData {
  assignments: ReviewerAssignment[];
  reviewers: AssignableReviewer[];
  schools: AssignableSchool[];
}

export interface AssignReviewerInput {
  userId: string;
  schoolId: string;
}

export interface RevokeReviewerInput {
  assignmentId: string;
}

/**
 * Defense-in-depth: the management RPCs each re-check platform_admin via auth.uid(), but we assert
 * here too so the server functions fail with a clear message instead of returning empty data.
 */
export const assertPlatformAdmin = async (context: CaseWorkflowContext): Promise<void> => {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", PLATFORM_ADMIN_ROLE)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Reviewer administration requires the platform_admin role.");
  }
};

export const loadReviewerAdminData = async (
  context: CaseWorkflowContext,
): Promise<ReviewerAdminData> => {
  await assertPlatformAdmin(context);

  const [assignmentsRes, reviewersRes, schoolsRes] = await Promise.all([
    context.supabase.rpc("list_reviewer_assignments"),
    context.supabase.rpc("list_assignable_reviewers"),
    context.supabase.rpc("list_assignable_schools"),
  ]);

  const readError = assignmentsRes.error ?? reviewersRes.error ?? schoolsRes.error;
  if (readError) {
    throw new Error(readError.message);
  }

  return {
    assignments: (assignmentsRes.data ?? []).map((row) => ({
      assignmentId: row.assignment_id,
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      schoolId: row.school_id,
      schoolName: row.school_name,
      createdAt: row.created_at,
    })),
    reviewers: (reviewersRes.data ?? []).map((row) => ({
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
    })),
    schools: (schoolsRes.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
    })),
  };
};

export const assignReviewerToSchool = async (
  context: CaseWorkflowContext,
  input: AssignReviewerInput,
): Promise<void> => {
  await assertPlatformAdmin(context);

  const { error } = await context.supabase.rpc("assign_reviewer_to_school", {
    p_user_id: input.userId,
    p_school_id: input.schoolId,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const revokeReviewerFromSchool = async (
  context: CaseWorkflowContext,
  input: RevokeReviewerInput,
): Promise<void> => {
  await assertPlatformAdmin(context);

  const { error } = await context.supabase.rpc("revoke_reviewer_from_school", {
    p_assignment_id: input.assignmentId,
  });

  if (error) {
    throw new Error(error.message);
  }
};
