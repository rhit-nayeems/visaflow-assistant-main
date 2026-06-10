import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AssignReviewerInput, RevokeReviewerInput } from "./reviewer-admin.server";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseRequiredString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
};

const validateAssignReviewerInput = (input: unknown): AssignReviewerInput => {
  if (!isRecord(input)) {
    throw new Error("Reviewer assignment details are required.");
  }

  return {
    userId: parseRequiredString(input, "userId", "Reviewer"),
    schoolId: parseRequiredString(input, "schoolId", "School"),
  };
};

const validateRevokeReviewerInput = (input: unknown): RevokeReviewerInput => {
  if (!isRecord(input)) {
    throw new Error("Reviewer assignment details are required.");
  }

  return {
    assignmentId: parseRequiredString(input, "assignmentId", "Assignment"),
  };
};

export const loadReviewerAdminDataAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { loadReviewerAdminData } = await import("./reviewer-admin.server");

    return loadReviewerAdminData({
      supabase: context.supabase,
      userId: context.userId,
    });
  });

export const assignReviewerToSchoolAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateAssignReviewerInput)
  .handler(async ({ context, data }) => {
    const { assignReviewerToSchool } = await import("./reviewer-admin.server");

    return assignReviewerToSchool(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const revokeReviewerFromSchoolAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRevokeReviewerInput)
  .handler(async ({ context, data }) => {
    const { revokeReviewerFromSchool } = await import("./reviewer-admin.server");

    return revokeReviewerFromSchool(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });
