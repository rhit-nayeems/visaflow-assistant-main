import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentUploadTimelineEvent,
  runDeterministicCaseEvaluation,
  submitCaseForReview,
} from "./workflows.server.ts";
import type {
  AuditLogInsert,
  CaseRecord,
  CaseWorkflowContext,
  DocumentRecord,
  ExtractedFieldRecord,
  TimelineEventInsert,
} from "./types";

const buildCaseRecord = (status: CaseRecord["status"]): CaseRecord => ({
  id: "case-123",
  user_id: "user-123",
  school_template_id: null,
  employer_name: "Acme Corp",
  role_title: "Software Engineer Intern",
  work_location: "Remote",
  start_date: "2099-06-01",
  end_date: "2099-09-01",
  case_summary: null,
  process_type: "cpt",
  risk_level: null,
  status,
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-20T00:00:00.000Z",
});

const buildDocumentRecord = (
  documentType: string,
  versionNumber: number,
  overrides: Partial<DocumentRecord> = {},
): DocumentRecord => ({
  id: overrides.id ?? `${documentType}-${versionNumber}`,
  case_id: overrides.case_id ?? "case-123",
  file_name: overrides.file_name ?? `${documentType}.pdf`,
  file_path: overrides.file_path ?? `user-123/case-123/upload-${versionNumber}/${documentType}.pdf`,
  document_type: overrides.document_type ?? documentType,
  version_number: overrides.version_number ?? versionNumber,
  upload_registration_id:
    overrides.upload_registration_id ?? `upload-${documentType}-${versionNumber}`,
  upload_status: overrides.upload_status ?? "uploaded",
  created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
});

const buildExtractedFieldRecord = (
  documentId: string,
  fieldName: string,
  fieldValue: string,
): ExtractedFieldRecord => ({
  id: `${documentId}-${fieldName}`,
  document_id: documentId,
  field_name: fieldName,
  field_value: fieldValue,
  confidence_score: 0.98,
  manually_corrected: false,
  created_at: "2026-04-20T00:00:00.000Z",
});

const buildWorkflowContextForSubmission = (status: CaseRecord["status"]): {
  context: CaseWorkflowContext;
  caseRecord: CaseRecord;
  auditEntries: AuditLogInsert[];
  caseUpdates: Array<Partial<CaseRecord>>;
  timelineEvents: TimelineEventInsert[];
} => {
  const timelineEvents: TimelineEventInsert[] = [];
  const auditEntries: AuditLogInsert[] = [];
  const caseUpdates: Array<Partial<CaseRecord>> = [];
  const caseRecord = buildCaseRecord(status);

  const supabase = {
    from(table: string) {
      if (table === "cases") {
        return createCasesTable();
      }

      if (table === "case_timeline_events") {
        return {
          async insert(event: TimelineEventInsert) {
            timelineEvents.push(event);
            return { error: null };
          },
        };
      }

      if (table === "audit_logs") {
        return {
          async insert(entry: AuditLogInsert) {
            auditEntries.push(entry);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table access: ${table}`);
    },
  } as unknown as CaseWorkflowContext["supabase"];

  function createCasesTable() {
    let mode: "select" | "update" | null = null;
    let filters: Record<string, string> = {};
    let mutation: Partial<CaseRecord> | null = null;

    return {
      select() {
        mode = "select";
        filters = {};
        return this;
      },
      update(values: Partial<CaseRecord>) {
        mode = "update";
        filters = {};
        mutation = values;
        caseUpdates.push(values);
        return this;
      },
      eq(column: string, value: string) {
        filters[column] = value;

        if (mode === "update" && filters.id && filters.user_id) {
          const matchesOwner =
            caseRecord.id === filters.id && caseRecord.user_id === filters.user_id;

          if (matchesOwner && mutation) {
            Object.assign(caseRecord, mutation);
          }

          return Promise.resolve({
            error: matchesOwner ? null : new Error("Case not found or you do not have access."),
          });
        }

        return this;
      },
      async maybeSingle() {
        const matchesOwner =
          caseRecord.id === filters.id && caseRecord.user_id === filters.user_id;

        return {
          data: matchesOwner ? caseRecord : null,
          error: null,
        };
      },
    };
  }

  return {
    context: {
      supabase,
      userId: caseRecord.user_id,
    },
    caseRecord,
    auditEntries,
    caseUpdates,
    timelineEvents,
  };
};

test("document upload timeline entries distinguish uploads from re-uploads", () => {
  const initialUpload = buildDocumentUploadTimelineEvent({
    caseId: "case-123",
    documentType: "offer_letter",
    fileName: "offer-letter.pdf",
    versionNumber: 1,
  });
  const reupload = buildDocumentUploadTimelineEvent({
    caseId: "case-123",
    documentType: "offer_letter",
    fileName: "offer-letter-v3.pdf",
    versionNumber: 3,
  });

  assert.equal(initialUpload.title, "Offer Letter uploaded");
  assert.equal(initialUpload.description, "offer-letter.pdf");
  assert.equal(reupload.title, "Offer Letter re-uploaded");
  assert.equal(reupload.description, "offer-letter-v3.pdf saved as version 3.");
});

test("deterministic evaluation can move a case from missing documents to ready after uploads", () => {
  const offerLetter = buildDocumentRecord("offer_letter", 1, { id: "offer-1" });
  const documents = [
    offerLetter,
    buildDocumentRecord("advisor_approval", 1),
    buildDocumentRecord("course_registration", 1),
  ];
  const extractedFields = [
    buildExtractedFieldRecord(offerLetter.id, "job_duties", "Build product features"),
  ];

  const result = runDeterministicCaseEvaluation({
    caseData: buildCaseRecord("missing_documents"),
    documents,
    extractedFields,
    templateConfig: null,
  });

  assert.equal(result.nextStatus, "ready_for_submission");
  assert.equal(
    result.evaluatedRequirements
      .filter((requirement) => requirement.severity === "blocker")
      .every((requirement) => requirement.status === "met" || requirement.status === "waived"),
    true,
  );
});

test("deterministic evaluation rejects transitions from post-submission statuses", () => {
  assert.throws(
    () =>
      runDeterministicCaseEvaluation({
        caseData: buildCaseRecord("approved"),
        documents: [],
        extractedFields: [],
        templateConfig: null,
      }),
    /Invalid case status transition: approved -> missing_documents/,
  );
});

test("submission moves a ready case into submitted and records history", async () => {
  const workflow = buildWorkflowContextForSubmission("ready_for_submission");

  const result = await submitCaseForReview(workflow.context, {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(result.caseId, workflow.caseRecord.id);
  assert.equal(result.status, "submitted");
  assert.equal(workflow.caseRecord.status, "submitted");
  assert.deepEqual(workflow.caseUpdates, [{ status: "submitted" }]);
  assert.equal(workflow.timelineEvents.length, 1);
  assert.deepEqual(workflow.timelineEvents[0], {
    case_id: workflow.caseRecord.id,
    event_type: "status_changed",
    title: "Status changed to submitted",
    description: "Case submitted for review.",
  });
  assert.equal(workflow.auditEntries.length, 1);
  assert.deepEqual(workflow.auditEntries[0], {
    case_id: workflow.caseRecord.id,
    actor_id: workflow.context.userId,
    action_type: "status_changed",
    field_name: "status",
    old_value: "ready_for_submission",
    new_value: "submitted",
    reason:
      "Student submitted the case for review after deterministic evaluation marked it ready for submission.",
  });
});

test("submission rejects cases that are not ready for submission", async () => {
  for (const status of ["draft", "missing_documents", "submitted"] as const) {
    const workflow = buildWorkflowContextForSubmission(status);

    await assert.rejects(
      () =>
        submitCaseForReview(workflow.context, {
          caseId: workflow.caseRecord.id,
        }),
      /Only cases that are ready for submission can be submitted for review\./,
    );

    assert.equal(workflow.caseRecord.status, status);
    assert.equal(workflow.caseUpdates.length, 0);
    assert.equal(workflow.timelineEvents.length, 0);
    assert.equal(workflow.auditEntries.length, 0);
  }
});
