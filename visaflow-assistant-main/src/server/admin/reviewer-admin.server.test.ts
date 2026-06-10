import assert from "node:assert/strict";
import test from "node:test";
import {
  assignReviewerToSchool,
  loadReviewerAdminData,
  revokeReviewerFromSchool,
} from "./reviewer-admin.server.ts";
import type { CaseWorkflowContext } from "../cases/types.ts";

interface RpcCall {
  name: string;
  args: Record<string, unknown> | undefined;
}

type RpcResponses = Record<string, { data: unknown; error: Error | null }>;

const createAdminContext = ({
  isPlatformAdmin = true,
  rpcResponses = {},
  rpcCalls,
  userId = "admin-1",
}: {
  isPlatformAdmin?: boolean;
  rpcResponses?: RpcResponses;
  rpcCalls?: RpcCall[];
  userId?: string;
}): CaseWorkflowContext => {
  const supabase = {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle() {
          const data =
            table === "user_roles" && isPlatformAdmin
              ? { role: "platform_admin", user_id: userId }
              : null;
          return Promise.resolve({ data, error: null });
        },
      };
      return query;
    },
    rpc(name: string, args?: Record<string, unknown>) {
      rpcCalls?.push({ name, args });
      const response = rpcResponses[name] ?? { data: null, error: null };
      return Promise.resolve(response);
    },
  } as unknown as CaseWorkflowContext["supabase"];

  return { supabase, userId };
};

test("loadReviewerAdminData rejects callers without the platform_admin role", async () => {
  const context = createAdminContext({ isPlatformAdmin: false });

  await assert.rejects(() => loadReviewerAdminData(context), /platform_admin role/);
});

test("loadReviewerAdminData maps snake_case RPC rows into camelCase shapes", async () => {
  const context = createAdminContext({
    rpcResponses: {
      list_reviewer_assignments: {
        data: [
          {
            assignment_id: "asg-1",
            user_id: "user-1",
            full_name: "Ada Lovelace",
            email: "ada@example.edu",
            school_id: "school-1",
            school_name: "Alpha University",
            created_at: "2026-06-10T00:00:00.000Z",
          },
        ],
        error: null,
      },
      list_assignable_reviewers: {
        data: [{ user_id: "user-1", full_name: "Ada Lovelace", email: "ada@example.edu" }],
        error: null,
      },
      list_assignable_schools: {
        data: [{ id: "school-1", name: "Alpha University" }],
        error: null,
      },
    },
  });

  const result = await loadReviewerAdminData(context);

  assert.deepEqual(result.assignments, [
    {
      assignmentId: "asg-1",
      userId: "user-1",
      fullName: "Ada Lovelace",
      email: "ada@example.edu",
      schoolId: "school-1",
      schoolName: "Alpha University",
      createdAt: "2026-06-10T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(result.reviewers, [
    { userId: "user-1", fullName: "Ada Lovelace", email: "ada@example.edu" },
  ]);
  assert.deepEqual(result.schools, [{ id: "school-1", name: "Alpha University" }]);
});

test("loadReviewerAdminData surfaces an RPC error", async () => {
  const context = createAdminContext({
    rpcResponses: {
      list_reviewer_assignments: { data: null, error: new Error("boom") },
    },
  });

  await assert.rejects(() => loadReviewerAdminData(context), /boom/);
});

test("assignReviewerToSchool forwards the reviewer and school to the RPC", async () => {
  const rpcCalls: RpcCall[] = [];
  const context = createAdminContext({ rpcCalls });

  await assignReviewerToSchool(context, { userId: "user-9", schoolId: "school-9" });

  assert.deepEqual(rpcCalls, [
    { name: "assign_reviewer_to_school", args: { p_user_id: "user-9", p_school_id: "school-9" } },
  ]);
});

test("assignReviewerToSchool rejects non-platform-admins before calling the RPC", async () => {
  const rpcCalls: RpcCall[] = [];
  const context = createAdminContext({ isPlatformAdmin: false, rpcCalls });

  await assert.rejects(
    () => assignReviewerToSchool(context, { userId: "user-9", schoolId: "school-9" }),
    /platform_admin role/,
  );
  assert.equal(rpcCalls.length, 0);
});

test("assignReviewerToSchool surfaces an RPC error", async () => {
  const context = createAdminContext({
    rpcResponses: {
      assign_reviewer_to_school: {
        data: null,
        error: new Error("Only users with the school_admin role can be assigned as reviewers."),
      },
    },
  });

  await assert.rejects(
    () => assignReviewerToSchool(context, { userId: "user-9", schoolId: "school-9" }),
    /school_admin role/,
  );
});

test("revokeReviewerFromSchool forwards the assignment id to the RPC", async () => {
  const rpcCalls: RpcCall[] = [];
  const context = createAdminContext({ rpcCalls });

  await revokeReviewerFromSchool(context, { assignmentId: "asg-7" });

  assert.deepEqual(rpcCalls, [
    { name: "revoke_reviewer_from_school", args: { p_assignment_id: "asg-7" } },
  ]);
});
