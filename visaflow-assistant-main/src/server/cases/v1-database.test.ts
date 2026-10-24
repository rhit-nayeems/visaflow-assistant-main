import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { updateCaseDetails, updateCaseDraft } from "./workflows.server.ts";
import type { CaseRecord, CaseWorkflowContext } from "./types.ts";

// Real Postgres, isolated in memory. Auth/Storage bootstrap tables stand in for
// Supabase services; all application SQL, triggers, RPCs, and RLS run unchanged.
let db: PGlite;
const owner = randomUUID();
const other = randomUUID();
const readyRequirements = [
  {
    requirement_key: "employer",
    label: "Employer provided",
    severity: "blocker",
    status: "met",
    explanation: "Employer name is present.",
    source: "template:case_field",
  },
];
const missingRequirements = [
  { ...readyRequirements[0], status: "not_met", explanation: "Add an employer name." },
];
const details = {
  employer_name: "Acme",
  role_title: "Intern",
  work_location: "Remote",
  start_date: "2099-06-01",
  end_date: "2099-08-01",
  case_summary: null,
};

before(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID $$;
    CREATE TABLE storage.buckets(id TEXT PRIMARY KEY, name TEXT, public BOOLEAN);
    CREATE TABLE storage.objects(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE SQL AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
  `);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    try {
      await db.exec(await readFile(new URL(name, migrations), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${name} failed`, { cause: error });
    }
  }
  await db.query<Record<string, unknown>>(
    "INSERT INTO auth.users(id,email) VALUES ($1,'owner@example.test'),($2,'other@example.test')",
    [owner, other],
  );
});
after(async () => {
  await db?.close();
});

async function login(user = owner) {
  await db.exec("RESET ROLE");
  await db.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub', $1, false)", [
    user,
  ]);
  await db.exec("SET ROLE authenticated");
}

async function fixture(status = "approved") {
  await db.exec("RESET ROLE");
  const id = randomUUID();
  // Fixtures start at a lifecycle state; updates still use the real workflow guard.
  await db.query<Record<string, unknown>>(
    `INSERT INTO public.cases(id,user_id,status,employer_name,role_title,work_location,start_date,end_date)
    VALUES ($1,$2,$3::public.case_status,'Acme','Intern','Remote','2099-06-01','2099-08-01')`,
    [id, owner, status],
  );
  await db.query<Record<string, unknown>>(
    `INSERT INTO public.case_requirements(case_id,requirement_key,label,severity,status,explanation,source)
    VALUES ($1,'employer','Employer provided','blocker','met','Employer name is present.','template:case_field')`,
    [id],
  );
  await login();
  const version = (
    await db.query<{ version: string }>(
      "SELECT updated_at::TEXT AS version FROM cases WHERE id=$1",
      [id],
    )
  ).rows[0].version;
  return { id, version };
}

async function edit(
  id: string,
  version: string,
  changes = {},
  status = "change_pending",
  requirements = readyRequirements,
) {
  return db.query<Record<string, unknown>>(
    "SELECT public.update_case_details($1,$2::timestamptz,$3::jsonb,$4::public.case_status,$5::jsonb)",
    [id, version, JSON.stringify({ ...details, ...changes }), status, JSON.stringify(requirements)],
  );
}

test("all migrations apply and the default CPT template and signup records exist", async () => {
  await login();
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "SELECT * FROM schools WHERE name='VisaFlow Demo University'",
      )
    ).rows.length,
    1,
  );
  assert.ok(
    (await db.query<Record<string, unknown>>("SELECT * FROM school_templates WHERE is_active")).rows
      .length > 0,
  );
  assert.equal(
    (await db.query<Record<string, unknown>>("SELECT * FROM profiles WHERE user_id=$1", [owner]))
      .rows.length,
    1,
  );
  assert.equal(
    (
      await db.query<Record<string, unknown>>("SELECT role FROM user_roles WHERE user_id=$1", [
        owner,
      ])
    ).rows[0].role,
    "student",
  );
});

for (const [field, value] of Object.entries({
  employer_name: "Updated Employer",
  work_location: "Boston",
  start_date: "2099-06-02",
  end_date: "2099-08-02",
})) {
  test(`approved ${field} edits force change_pending and write field and status history`, async () => {
    const { id, version } = await fixture();
    await edit(id, version, { [field]: value });
    assert.equal(
      (await db.query<Record<string, unknown>>("SELECT status FROM cases WHERE id=$1", [id]))
        .rows[0].status,
      "change_pending",
    );
    const audit = (
      await db.query<Record<string, unknown>>("SELECT * FROM audit_logs WHERE case_id=$1", [id])
    ).rows;
    assert.ok(audit.some((entry) => entry.field_name === field && entry.new_value === value));
    assert.ok(audit.some((entry) => entry.action_type === "approval_revalidation"));
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "SELECT * FROM case_timeline_events WHERE case_id=$1",
          [id],
        )
      ).rows.length,
      2,
    );
  });
}

test("direct Data API employment updates also invalidate approval", async () => {
  const { id } = await fixture();
  await db.query<Record<string, unknown>>(
    "UPDATE cases SET employer_name='Changed directly' WHERE id=$1",
    [id],
  );
  assert.equal(
    (await db.query<Record<string, unknown>>("SELECT status FROM cases WHERE id=$1", [id])).rows[0]
      .status,
    "change_pending",
  );
});

test("non-sensitive changes and unchanged saves preserve approval", async () => {
  const { id, version } = await fixture();
  await edit(id, version, { case_summary: "New note" }, "approved");
  assert.equal(
    (await db.query<Record<string, unknown>>("SELECT status FROM cases WHERE id=$1", [id])).rows[0]
      .status,
    "approved",
  );
  const unchanged = await fixture();
  await edit(unchanged.id, unchanged.version, {}, "approved");
  assert.equal(
    (
      await db.query<Record<string, unknown>>("SELECT * FROM audit_logs WHERE case_id=$1", [
        unchanged.id,
      ])
    ).rows.length,
    0,
  );
});

test("stale edits and edits by another student are rejected without mutation", async () => {
  const { id, version } = await fixture();
  await assert.rejects(
    edit(id, "2000-01-01T00:00:00Z", { employer_name: "Stale" }),
    /Reload the case/,
  );
  await login(other);
  await assert.rejects(edit(id, version, { employer_name: "Intruder" }), /do not have access/);
  await login();
  assert.equal(
    (await db.query<Record<string, unknown>>("SELECT employer_name FROM cases WHERE id=$1", [id]))
      .rows[0].employer_name,
    "Acme",
  );
});

test("failed history writes roll back the edit and approval change", async () => {
  const { id, version } = await fixture();
  await db.exec("RESET ROLE; REVOKE INSERT ON audit_logs FROM authenticated;");
  await login();
  await assert.rejects(edit(id, version, { employer_name: "Must roll back" }), /permission denied/);
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "SELECT employer_name,status FROM cases WHERE id=$1",
        [id],
      )
    ).rows[0].status,
    "approved",
  );
  assert.equal(
    (await db.query<Record<string, unknown>>("SELECT employer_name FROM cases WHERE id=$1", [id]))
      .rows[0].employer_name,
    "Acme",
  );
  await db.exec("RESET ROLE; GRANT INSERT ON audit_logs TO authenticated;");
});

test("case edits reevaluate missing fields and remove stale readiness", async () => {
  const { id, version } = await fixture("ready_for_submission");
  await edit(id, version, { employer_name: null }, "blocked", missingRequirements);
  assert.equal(
    (await db.query<Record<string, unknown>>("SELECT status FROM cases WHERE id=$1", [id])).rows[0]
      .status,
    "blocked",
  );
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "SELECT status FROM case_requirements WHERE case_id=$1",
        [id],
      )
    ).rows[0].status,
    "not_met",
  );
});

test("submission and readiness reject blockers; terminal and submitted details reject edits", async () => {
  const { id } = await fixture("change_pending");
  await db.query<Record<string, unknown>>(
    "UPDATE case_requirements SET status='not_met' WHERE case_id=$1",
    [id],
  );
  for (const status of ["ready_for_submission", "submitted"]) {
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "UPDATE cases SET status=$2::public.case_status WHERE id=$1",
        [id, status],
      ),
      /Resolve all blocker/,
    );
  }
  for (const status of ["submitted", "denied", "completed"]) {
    const locked = await fixture(status);
    await assert.rejects(
      edit(locked.id, locked.version, { employer_name: "Changed" }),
      /cannot be edited/,
    );
  }
});

test("invalid dates and mismatched status roll back primary data and history", async () => {
  const { id, version } = await fixture();
  await assert.rejects(edit(id, version, { end_date: "2099-01-01" }), /End date/);
  await assert.rejects(
    edit(id, version, { employer_name: "Changed" }, "approved"),
    /does not match/,
  );
  assert.equal(
    (await db.query<Record<string, unknown>>("SELECT * FROM audit_logs WHERE case_id=$1", [id]))
      .rows.length,
    0,
  );
});

// A read-only PostgREST-shaped transport over the test database lets the actual
// server workflow run its ownership checks and evaluator before the actual RPC.
function workflowContext(): CaseWorkflowContext {
  const client = {
    from(table: string) {
      assert.match(table, /^[a-z_]+$/);
      const filters: string[] = [];
      const values: unknown[] = [];
      const builder = {
        select() {
          return builder;
        },
        eq(field: string, value: unknown) {
          assert.match(field, /^[a-z_]+$/);
          values.push(value);
          filters.push(`${field}=$${values.length}`);
          return builder;
        },
        in(field: string, items: unknown[]) {
          assert.match(field, /^[a-z_]+$/);
          const placeholders = items.map((item) => {
            values.push(item);
            return `$${values.length}`;
          });
          filters.push(`${field} IN (${placeholders.join(",")})`);
          return builder;
        },
        order() {
          return builder;
        },
        async single() {
          const result = await execute();
          return { data: result.data[0] ?? null, error: result.error };
        },
        async maybeSingle() {
          return builder.single();
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return execute().then(resolve, reject);
        },
      };
      async function execute() {
        const result = await db.query<{ row: Record<string, unknown> }>(
          `SELECT to_jsonb(t) AS row FROM public.${table} t${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""}`,
          values,
        );
        return { data: result.rows.map((item) => item.row), error: null };
      }
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "update_case_details");
      try {
        await db.query(
          "SELECT public.update_case_details($1,$2::timestamptz,$3::jsonb,$4::public.case_status,$5::jsonb)",
          [
            args.p_case_id,
            args.p_expected_updated_at,
            JSON.stringify(args.p_details),
            args.p_next_status,
            JSON.stringify(args.p_requirements),
          ],
        );
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
  };
  return { userId: owner, supabase: client as unknown as CaseWorkflowContext["supabase"] };
}

test("the real server edit workflow evaluates requirements and commits approval revalidation through Postgres", async () => {
  const { id } = await fixture();
  const snapshot = (
    await db.query<{ row: CaseRecord }>("SELECT to_jsonb(cases) AS row FROM cases WHERE id=$1", [
      id,
    ])
  ).rows[0].row;
  const result = await updateCaseDetails(workflowContext(), {
    caseId: id,
    expectedUpdatedAt: snapshot.updated_at,
    employerName: "New employer",
    roleTitle: "Intern",
    workLocation: "Remote",
    startDate: "2099-06-01",
    endDate: "2099-08-01",
    caseSummary: null,
  });
  assert.equal(result.needsReapproval, true);
  assert.equal(result.status, "change_pending");
  assert.ok(
    (
      await db.query(
        "SELECT * FROM case_requirements WHERE case_id=$1 AND severity='blocker' AND status='not_met'",
        [id],
      )
    ).rows.length > 0,
  );
  await assert.rejects(
    updateCaseDraft(workflowContext(), {
      caseId: id,
      schoolId: randomUUID(),
      schoolTemplateId: null,
      employerName: "Bypass",
      roleTitle: null,
      workLocation: null,
      startDate: null,
      endDate: null,
      caseSummary: null,
    }),
    /Only draft/,
  );
});
