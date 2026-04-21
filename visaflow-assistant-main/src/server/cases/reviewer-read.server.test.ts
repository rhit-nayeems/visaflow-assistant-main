import assert from "node:assert/strict";
import test from "node:test";
import { listReviewerCases, loadReviewerCaseDetail } from "./reviewer-read.server.ts";
import type {
  AuditLogRecord,
  CaseRecord,
  CaseWorkflowContext,
  DocumentRecord,
  RequirementRecord,
  TimelineEventRecord,
} from "./types.ts";

const buildCaseRecord = (
  status: CaseRecord["status"],
  overrides: Partial<CaseRecord> = {},
): CaseRecord => ({
  id: overrides.id ?? "case-123",
  user_id: overrides.user_id ?? "user-123",
  school_template_id: overrides.school_template_id ?? "template-123",
  employer_name: overrides.employer_name ?? "Acme Corp",
  role_title: overrides.role_title ?? "Software Engineer Intern",
  work_location: overrides.work_location ?? "Remote",
  start_date: overrides.start_date ?? "2099-06-01",
  end_date: overrides.end_date ?? "2099-09-01",
  case_summary: overrides.case_summary ?? null,
  needs_document_reevaluation: overrides.needs_document_reevaluation ?? false,
  process_type: overrides.process_type ?? "cpt",
  risk_level: overrides.risk_level ?? null,
  status,
  created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
  updated_at: overrides.updated_at ?? "2026-04-20T00:00:00.000Z",
});

const buildDocumentRecord = (
  caseId: string,
  overrides: Partial<DocumentRecord> = {},
): DocumentRecord => ({
  id: overrides.id ?? `${caseId}-document`,
  case_id: overrides.case_id ?? caseId,
  file_name: overrides.file_name ?? "offer.pdf",
  file_path: overrides.file_path ?? `user-123/${caseId}/upload-1/offer.pdf`,
  document_type: overrides.document_type ?? "offer_letter",
  extraction_completed_at: overrides.extraction_completed_at ?? null,
  extraction_error: overrides.extraction_error ?? null,
  extraction_started_at: overrides.extraction_started_at ?? null,
  extraction_status: overrides.extraction_status ?? "succeeded",
  version_number: overrides.version_number ?? 1,
  upload_registration_id: overrides.upload_registration_id ?? `${caseId}-upload`,
  upload_status: overrides.upload_status ?? "uploaded",
  created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
});

const buildRequirementRecord = (
  caseId: string,
  overrides: Partial<RequirementRecord> = {},
): RequirementRecord => ({
  id: overrides.id ?? `${caseId}-requirement`,
  case_id: overrides.case_id ?? caseId,
  requirement_key: overrides.requirement_key ?? "offer_letter_uploaded",
  label: overrides.label ?? "Offer letter uploaded",
  severity: overrides.severity ?? "blocker",
  status: overrides.status ?? "met",
  explanation: overrides.explanation ?? null,
  source: overrides.source ?? "system",
  created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
  updated_at: overrides.updated_at ?? "2026-04-20T00:00:00.000Z",
});

const buildTimelineEvent = (
  caseId: string,
  overrides: Partial<TimelineEventRecord> = {},
): TimelineEventRecord => ({
  id: overrides.id ?? `${caseId}-timeline`,
  case_id: overrides.case_id ?? caseId,
  event_type: overrides.event_type ?? "case_submitted",
  title: overrides.title ?? "Case submitted",
  description: overrides.description ?? null,
  metadata_json: overrides.metadata_json ?? null,
  created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
});

const buildAuditLog = (
  caseId: string,
  overrides: Partial<AuditLogRecord> = {},
): AuditLogRecord => ({
  id: overrides.id ?? `${caseId}-audit`,
  case_id: overrides.case_id ?? caseId,
  actor_id: overrides.actor_id ?? "reviewer-123",
  action_type: overrides.action_type ?? "review_approved",
  field_name: overrides.field_name ?? "status",
  old_value: overrides.old_value ?? "submitted",
  new_value: overrides.new_value ?? "approved",
  reason: overrides.reason ?? "Reviewer approved the submitted case.",
  created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
});

interface ScopedCaseFixture {
  record: CaseRecord;
  schoolId: string;
}

type QueryResult = {
  data: unknown[];
  error: Error | null;
};

const createReviewerReadContext = ({
  assignedSchoolIds,
  auditLogs = [],
  cases,
  documents = [],
  requirements = [],
  reviewerHasSchoolAdminRole = true,
  reviewerUserId = "reviewer-123",
  timeline = [],
}: {
  assignedSchoolIds: string[];
  auditLogs?: AuditLogRecord[];
  cases: ScopedCaseFixture[];
  documents?: DocumentRecord[];
  requirements?: RequirementRecord[];
  reviewerHasSchoolAdminRole?: boolean;
  reviewerUserId?: string;
  timeline?: TimelineEventRecord[];
}): CaseWorkflowContext => {
  const resolveRows = (
    table: string,
    eqFilters: Array<[string, unknown]>,
    inFilters: Array<[string, unknown[]]>,
    orderBy: { column: string; ascending: boolean } | null,
  ): unknown[] => {
    let rows: unknown[] = [];

    if (table === "user_roles") {
      rows = reviewerHasSchoolAdminRole ? [{ role: "school_admin", user_id: reviewerUserId }] : [];
    }

    if (table === "reviewer_school_assignments") {
      rows = assignedSchoolIds.map((school_id) => ({
        school_id,
        user_id: reviewerUserId,
      }));
    }

    if (table === "cases") {
      rows = cases.map(({ record, schoolId }) => ({
        ...record,
        school_templates: {
          school_id: schoolId,
        },
      }));
    }

    if (table === "documents") {
      rows = documents;
    }

    if (table === "case_requirements") {
      rows = requirements;
    }

    if (table === "case_timeline_events") {
      rows = timeline;
    }

    if (table === "audit_logs") {
      rows = auditLogs;
    }

    const readValue = (row: unknown, column: string): unknown => {
      const record = row as Record<string, unknown>;

      if (column === "school_templates.school_id") {
        return (record.school_templates as { school_id?: string } | null)?.school_id;
      }

      return record[column];
    };

    rows = rows.filter((row) =>
      eqFilters.every(([column, value]) => readValue(row, column) === value),
    );
    rows = rows.filter((row) =>
      inFilters.every(([column, values]) => values.includes(readValue(row, column))),
    );

    if (orderBy) {
      rows = [...rows].sort((left, right) => {
        const leftValue = String(readValue(left, orderBy.column) ?? "");
        const rightValue = String(readValue(right, orderBy.column) ?? "");

        if (leftValue === rightValue) {
          return 0;
        }

        return leftValue < rightValue === orderBy.ascending ? -1 : 1;
      });
    }

    return rows;
  };

  const supabase = {
    from(table: string) {
      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      let orderBy: { column: string; ascending: boolean } | null = null;

      const buildResult = (): QueryResult => ({
        data: resolveRows(table, eqFilters, inFilters, orderBy),
        error: null,
      });

      const query = {
        select(_columns: string) {
          return query;
        },
        eq(column: string, value: unknown) {
          eqFilters.push([column, value]);
          return query;
        },
        in(column: string, values: readonly unknown[]) {
          inFilters.push([column, [...values]]);
          return query;
        },
        order(column: string, options: { ascending?: boolean } = {}) {
          orderBy = {
            column,
            ascending: options.ascending ?? true,
          };
          return query;
        },
        maybeSingle() {
          const result = buildResult();

          return Promise.resolve({
            data: result.data[0] ?? null,
            error: result.error,
          });
        },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(buildResult()).then(onfulfilled, onrejected);
        },
      };

      return query;
    },
  } as unknown as CaseWorkflowContext["supabase"];

  return {
    supabase,
    userId: reviewerUserId,
  };
};

test("reviewer assigned to school A only sees school A submitted cases in the queue", async () => {
  const schoolACase = buildCaseRecord("submitted", {
    id: "case-a",
    employer_name: "School A Employer",
    school_template_id: "template-a",
    updated_at: "2026-04-20T02:00:00.000Z",
  });
  const schoolBCase = buildCaseRecord("submitted", {
    id: "case-b",
    employer_name: "School B Employer",
    school_template_id: "template-b",
    updated_at: "2026-04-20T03:00:00.000Z",
  });
  const approvedSchoolACase = buildCaseRecord("approved", {
    id: "case-a-approved",
    school_template_id: "template-a",
  });
  const context = createReviewerReadContext({
    assignedSchoolIds: ["school-a"],
    cases: [
      { record: schoolACase, schoolId: "school-a" },
      { record: schoolBCase, schoolId: "school-b" },
      { record: approvedSchoolACase, schoolId: "school-a" },
    ],
  });

  const queue = await listReviewerCases(context);

  assert.deepEqual(
    queue.map((caseRecord) => caseRecord.id),
    ["case-a"],
  );
});

test("reviewer detail returns scoped read-side data for assigned school cases", async () => {
  const schoolACase = buildCaseRecord("submitted", {
    id: "case-a",
    school_template_id: "template-a",
  });
  const schoolBCase = buildCaseRecord("submitted", {
    id: "case-b",
    school_template_id: "template-b",
  });
  const context = createReviewerReadContext({
    assignedSchoolIds: ["school-a"],
    auditLogs: [buildAuditLog("case-a"), buildAuditLog("case-b")],
    cases: [
      { record: schoolACase, schoolId: "school-a" },
      { record: schoolBCase, schoolId: "school-b" },
    ],
    documents: [buildDocumentRecord("case-a"), buildDocumentRecord("case-b")],
    requirements: [buildRequirementRecord("case-a"), buildRequirementRecord("case-b")],
    timeline: [buildTimelineEvent("case-a"), buildTimelineEvent("case-b")],
  });

  const scopedDetail = await loadReviewerCaseDetail(context, "case-a");
  const scopedOutDetail = await loadReviewerCaseDetail(context, "case-b");

  assert.equal(scopedDetail?.caseData.id, "case-a");
  assert.deepEqual(
    scopedDetail?.documents.map((document) => document.case_id),
    ["case-a"],
  );
  assert.deepEqual(
    scopedDetail?.requirements.map((requirement) => requirement.case_id),
    ["case-a"],
  );
  assert.deepEqual(
    scopedDetail?.timeline.map((event) => event.case_id),
    ["case-a"],
  );
  assert.deepEqual(
    scopedDetail?.auditLogs.map((log) => log.case_id),
    ["case-a"],
  );
  assert.equal(scopedOutDetail, null);
});
