import assert from "node:assert/strict";
import test from "node:test";
import {
  approveCase,
  buildDocumentUploadTimelineEvent,
  denyCase,
  reevaluateCaseAfterUploads,
  registerUploadedCaseDocument,
  requestCaseChanges,
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

const FINALIZE_CASE_REQUIREMENT_EVALUATION_RPC = "finalize_case_requirement_evaluation";
const REGISTER_CASE_DOCUMENT_RPC = "register_case_document";
const REVIEWER_CASE_DECISION_RPC = "apply_reviewer_case_decision";

const buildCaseRecord = (
  status: CaseRecord["status"],
  overrides: Partial<CaseRecord> = {},
): CaseRecord => ({
  id: overrides.id ?? "case-123",
  user_id: overrides.user_id ?? "user-123",
  school_template_id: overrides.school_template_id ?? null,
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
  created_at: overrides.created_at ?? `2026-04-20T00:00:0${versionNumber}.000Z`,
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

const buildReadyCaseDocuments = (): {
  documents: DocumentRecord[];
  extractedFields: ExtractedFieldRecord[];
} => {
  const offerLetter = buildDocumentRecord("offer_letter", 1, { id: "offer-1" });
  const documents = [
    offerLetter,
    buildDocumentRecord("advisor_approval", 1, { id: "advisor-1" }),
    buildDocumentRecord("course_registration", 1, { id: "course-1" }),
  ];

  return {
    documents,
    extractedFields: [
      buildExtractedFieldRecord(offerLetter.id, "job_duties", "Build product features"),
    ],
  };
};

const buildReviewerDecisionHistory = ({
  caseId,
  reviewerComment,
  reviewerUserId,
  nextStatus,
}: {
  caseId: string;
  reviewerComment: string | null;
  reviewerUserId: string;
  nextStatus: Extract<CaseRecord["status"], "approved" | "denied" | "change_pending">;
}): {
  auditEntry: AuditLogInsert;
  timelineEvent: TimelineEventInsert;
} => {
  const normalizedComment =
    typeof reviewerComment === "string" && reviewerComment.trim().length > 0
      ? reviewerComment.trim()
      : null;

  if (nextStatus === "approved") {
    return {
      timelineEvent: {
        case_id: caseId,
        event_type: "status_changed",
        title: "Case approved",
        description: normalizedComment
          ? `School review approved this case. Reviewer note: ${normalizedComment}`
          : "School review approved this case.",
      },
      auditEntry: {
        case_id: caseId,
        actor_id: reviewerUserId,
        action_type: "review_approved",
        field_name: "status",
        old_value: "submitted",
        new_value: "approved",
        reason: normalizedComment
          ? `Reviewer approved the submitted case. Comment: ${normalizedComment}`
          : "Reviewer approved the submitted case.",
      },
    };
  }

  if (nextStatus === "denied") {
    return {
      timelineEvent: {
        case_id: caseId,
        event_type: "status_changed",
        title: "Case denied",
        description: `School review denied this case. Reviewer note: ${normalizedComment}`,
      },
      auditEntry: {
        case_id: caseId,
        actor_id: reviewerUserId,
        action_type: "review_denied",
        field_name: "status",
        old_value: "submitted",
        new_value: "denied",
        reason: `Reviewer denied the submitted case. Comment: ${normalizedComment}`,
      },
    };
  }

  return {
    timelineEvent: {
      case_id: caseId,
      event_type: "status_changed",
      title: "Changes requested",
      description:
        "School review requested changes before approval. Reviewer note: " + normalizedComment,
    },
    auditEntry: {
      case_id: caseId,
      actor_id: reviewerUserId,
      action_type: "review_changes_requested",
      field_name: "status",
      old_value: "submitted",
      new_value: "change_pending",
      reason: "Reviewer requested changes on the submitted case. Comment: " + normalizedComment,
    },
  };
};

const buildWorkflowContextForSubmission = (
  status: CaseRecord["status"],
  overrides: Partial<CaseRecord> = {},
): {
  context: CaseWorkflowContext;
  caseRecord: CaseRecord;
  auditEntries: AuditLogInsert[];
  caseUpdates: Array<Partial<CaseRecord>>;
  timelineEvents: TimelineEventInsert[];
} => {
  const timelineEvents: TimelineEventInsert[] = [];
  const auditEntries: AuditLogInsert[] = [];
  const caseUpdates: Array<Partial<CaseRecord>> = [];
  const caseRecord = buildCaseRecord(status, overrides);

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
        const matchesOwner = caseRecord.id === filters.id && caseRecord.user_id === filters.user_id;

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

const buildReviewerWorkflowContext = (
  status: CaseRecord["status"],
  options: {
    reviewerHasSchoolAdminRole?: boolean;
    reviewerUserId?: string;
    caseOverrides?: Partial<CaseRecord>;
    staleReviewerDecisionStatus?: Extract<
      CaseRecord["status"],
      "approved" | "denied" | "change_pending"
    >;
  } = {},
): {
  context: CaseWorkflowContext;
  caseRecord: CaseRecord;
  auditEntries: AuditLogInsert[];
  caseUpdates: Array<Partial<CaseRecord>>;
  reviewerDecisionCalls: Array<{
    p_case_id: string;
    p_next_status: string;
    p_reviewer_comment: string | null;
  }>;
  timelineEvents: TimelineEventInsert[];
  reviewerUserId: string;
} => {
  const reviewerUserId = options.reviewerUserId ?? "reviewer-123";
  const reviewerHasSchoolAdminRole = options.reviewerHasSchoolAdminRole ?? true;
  const staleReviewerDecisionStatus = options.staleReviewerDecisionStatus ?? null;
  const caseRecord = buildCaseRecord(status, options.caseOverrides);
  const timelineEvents: TimelineEventInsert[] = [];
  const auditEntries: AuditLogInsert[] = [];
  const caseUpdates: Array<Partial<CaseRecord>> = [];
  const reviewerDecisionCalls: Array<{
    p_case_id: string;
    p_next_status: string;
    p_reviewer_comment: string | null;
  }> = [];

  const supabase = {
    from(table: string) {
      throw new Error(`Unexpected table access: ${table}`);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== REVIEWER_CASE_DECISION_RPC) {
        throw new Error(`Unexpected RPC call: ${fn}`);
      }

      reviewerDecisionCalls.push({
        p_case_id: String(args.p_case_id),
        p_next_status: String(args.p_next_status),
        p_reviewer_comment:
          typeof args.p_reviewer_comment === "string" ? args.p_reviewer_comment : null,
      });

      return {
        async single() {
          if (!reviewerHasSchoolAdminRole) {
            return {
              data: null,
              error: new Error("Reviewer access requires the school_admin role."),
            };
          }

          if (staleReviewerDecisionStatus) {
            caseRecord.status = staleReviewerDecisionStatus;

            return {
              data: null,
              error: new Error("Only submitted cases can be reviewed."),
            };
          }

          if (caseRecord.id !== args.p_case_id || caseRecord.status !== "submitted") {
            return {
              data: null,
              error: new Error("Only submitted cases can be reviewed."),
            };
          }

          const nextStatus = args.p_next_status as Extract<
            CaseRecord["status"],
            "approved" | "denied" | "change_pending"
          >;
          const reviewerComment =
            typeof args.p_reviewer_comment === "string" ? args.p_reviewer_comment : null;

          if (
            (nextStatus === "denied" || nextStatus === "change_pending") &&
            reviewerComment === null
          ) {
            return {
              data: null,
              error: new Error("Reviewer comment is required."),
            };
          }

          caseRecord.status = nextStatus;

          const history = buildReviewerDecisionHistory({
            caseId: caseRecord.id,
            reviewerComment,
            reviewerUserId,
            nextStatus,
          });
          timelineEvents.push(history.timelineEvent);
          auditEntries.push(history.auditEntry);

          return {
            data: {
              case_id: caseRecord.id,
              previous_status: "submitted",
              next_status: caseRecord.status,
            },
            error: null,
          };
        },
      };
    },
  } as unknown as CaseWorkflowContext["supabase"];

  return {
    context: {
      supabase,
      userId: reviewerUserId,
    },
    caseRecord,
    auditEntries,
    caseUpdates,
    reviewerDecisionCalls,
    timelineEvents,
    reviewerUserId,
  };
};

const buildStatefulWorkflowHarness = (): {
  caseRecord: CaseRecord;
  documents: DocumentRecord[];
  extractedFields: ExtractedFieldRecord[];
  auditEntries: AuditLogInsert[];
  caseUpdates: Array<Partial<CaseRecord>>;
  timelineEvents: TimelineEventInsert[];
  createContext: () => CaseWorkflowContext;
} => {
  const { documents, extractedFields } = buildReadyCaseDocuments();
  const caseRecord = buildCaseRecord("ready_for_submission");
  const timelineEvents: TimelineEventInsert[] = [];
  const auditEntries: AuditLogInsert[] = [];
  const caseUpdates: Array<Partial<CaseRecord>> = [];
  let nextDocumentNumber = documents.length + 1;
  let nextDocumentCreatedAtSecond = 10;

  const createContext = (): CaseWorkflowContext => {
    const supabase = {
      from(table: string) {
        if (table === "cases") {
          return createCasesTable();
        }

        if (table === "documents") {
          return createDocumentsTable();
        }

        if (table === "extracted_fields") {
          return createExtractedFieldsTable();
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
      rpc(fn: string, args: Record<string, unknown>) {
        if (fn === REGISTER_CASE_DOCUMENT_RPC) {
          return {
            async single() {
              const uploadRegistrationId = String(args.p_upload_registration_id);
              const existingDocument = documents.find(
                (document) => document.upload_registration_id === uploadRegistrationId,
              );

              if (existingDocument) {
                return {
                  data: {
                    ...existingDocument,
                    created_new: false,
                  },
                  error: null,
                };
              }

              const documentType = String(args.p_document_type);
              const nextVersionNumber =
                documents
                  .filter((document) => document.document_type === documentType)
                  .reduce(
                    (latestVersion, document) => Math.max(latestVersion, document.version_number),
                    0,
                  ) + 1;
              const documentId = `doc-${nextDocumentNumber}`;
              const createdAt = `2026-04-20T00:00:${nextDocumentCreatedAtSecond}.000Z`;
              const nextDocument: DocumentRecord = {
                id: documentId,
                case_id: String(args.p_case_id),
                file_name: String(args.p_file_name),
                file_path: String(args.p_file_path),
                document_type: documentType,
                version_number: nextVersionNumber,
                upload_status: "uploaded",
                upload_registration_id: uploadRegistrationId,
                created_at: createdAt,
              };

              nextDocumentNumber += 1;
              nextDocumentCreatedAtSecond += 1;
              documents.push(nextDocument);
              caseRecord.needs_document_reevaluation = true;

              return {
                data: {
                  ...nextDocument,
                  created_new: true,
                },
                error: null,
              };
            },
          };
        }

        if (fn === FINALIZE_CASE_REQUIREMENT_EVALUATION_RPC) {
          caseRecord.status = args.p_next_status as CaseRecord["status"];
          caseRecord.needs_document_reevaluation = false;
          return { error: null };
        }

        throw new Error(`Unexpected RPC call: ${fn}`);
      },
    } as unknown as CaseWorkflowContext["supabase"];

    return {
      supabase,
      userId: caseRecord.user_id,
    };
  };

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
        const matchesOwner = caseRecord.id === filters.id && caseRecord.user_id === filters.user_id;

        return {
          data: matchesOwner ? caseRecord : null,
          error: null,
        };
      },
    };
  }

  function createDocumentsTable() {
    let filters: Record<string, string> = {};

    return {
      select() {
        filters = {};
        return this;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return this;
      },
      async order(column: string, options?: { ascending?: boolean }) {
        const filteredDocuments = documents.filter((document) =>
          Object.entries(filters).every(([filterColumn, filterValue]) => {
            return String(document[filterColumn as keyof DocumentRecord]) === filterValue;
          }),
        );
        const sortedDocuments = [...filteredDocuments].sort((left, right) => {
          const leftValue = String(left[column as keyof DocumentRecord]);
          const rightValue = String(right[column as keyof DocumentRecord]);

          return options?.ascending === false
            ? rightValue.localeCompare(leftValue)
            : leftValue.localeCompare(rightValue);
        });

        return {
          data: sortedDocuments,
          error: null,
        };
      },
    };
  }

  function createExtractedFieldsTable() {
    return {
      select() {
        return this;
      },
      async in(column: string, values: string[]) {
        if (column !== "document_id") {
          throw new Error(`Unexpected extracted_fields filter: ${column}`);
        }

        return {
          data: extractedFields.filter((field) => values.includes(field.document_id)),
          error: null,
        };
      },
    };
  }

  return {
    caseRecord,
    documents,
    extractedFields,
    auditEntries,
    caseUpdates,
    timelineEvents,
    createContext,
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
  const { documents, extractedFields } = buildReadyCaseDocuments();

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

test("deterministic evaluation can move a change-pending case back to ready after updates", () => {
  const { documents, extractedFields } = buildReadyCaseDocuments();

  const result = runDeterministicCaseEvaluation({
    caseData: buildCaseRecord("change_pending"),
    documents,
    extractedFields,
    templateConfig: null,
  });

  assert.equal(result.nextStatus, "ready_for_submission");
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

test("submission allows a change-pending case to be resubmitted for review", async () => {
  const workflow = buildWorkflowContextForSubmission("change_pending");

  const result = await submitCaseForReview(workflow.context, {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(result.status, "submitted");
  assert.equal(workflow.caseRecord.status, "submitted");
  assert.deepEqual(workflow.caseUpdates, [{ status: "submitted" }]);
  assert.equal(
    workflow.timelineEvents[0]?.description,
    "Case resubmitted for review after requested changes.",
  );
  assert.equal(
    workflow.auditEntries[0]?.reason,
    "Student resubmitted the case for review after requested changes.",
  );
});

test("submission rejects cases that are not eligible for review handoff", async () => {
  for (const status of ["draft", "missing_documents", "submitted", "approved"] as const) {
    const workflow = buildWorkflowContextForSubmission(status);

    await assert.rejects(
      () =>
        submitCaseForReview(workflow.context, {
          caseId: workflow.caseRecord.id,
        }),
      /Only cases that are ready for submission or awaiting requested changes can be submitted for review\./,
    );

    assert.equal(workflow.caseRecord.status, status);
    assert.equal(workflow.caseUpdates.length, 0);
    assert.equal(workflow.timelineEvents.length, 0);
    assert.equal(workflow.auditEntries.length, 0);
  }
});

test("document re-upload keeps submit blocked across a reload-equivalent server round-trip until reevaluation succeeds", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const uploadResult = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath: `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  assert.equal(uploadResult.createdNew, true);
  assert.equal(uploadResult.versionNumber, 2);
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);
  assert.equal(workflow.caseRecord.status, "ready_for_submission");

  await assert.rejects(
    () =>
      submitCaseForReview(workflow.createContext(), {
        caseId: workflow.caseRecord.id,
      }),
    /Re-run evaluation after recent document uploads before submitting this case for review\./,
  );

  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);

  const reevaluationResult = await reevaluateCaseAfterUploads(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(reevaluationResult.status, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);

  const submissionResult = await submitCaseForReview(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(submissionResult.status, "submitted");
  assert.equal(workflow.caseRecord.status, "submitted");
});

test("retrying the same upload registration does not create a duplicate document or re-toggle submission eligibility", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const firstAttempt = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath: `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`,
    uploadRegistrationId: "upload-offer-letter-2",
  });
  const secondAttempt = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath: `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  assert.equal(firstAttempt.createdNew, true);
  assert.equal(secondAttempt.createdNew, false);
  assert.equal(
    workflow.documents.filter((document) => document.document_type === "offer_letter").length,
    2,
  );
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);
});

test("review approval moves a submitted case to approved and records reviewer history", async () => {
  const workflow = buildReviewerWorkflowContext("submitted");

  const result = await approveCase(workflow.context, {
    caseId: workflow.caseRecord.id,
    reviewerComment: "All CPT requirements are satisfied.",
  });

  assert.equal(result.status, "approved");
  assert.equal(workflow.caseRecord.status, "approved");
  assert.deepEqual(workflow.reviewerDecisionCalls, [
    {
      p_case_id: workflow.caseRecord.id,
      p_next_status: "approved",
      p_reviewer_comment: "All CPT requirements are satisfied.",
    },
  ]);
  assert.deepEqual(workflow.caseUpdates, []);
  assert.deepEqual(workflow.timelineEvents[0], {
    case_id: workflow.caseRecord.id,
    event_type: "status_changed",
    title: "Case approved",
    description:
      "School review approved this case. Reviewer note: All CPT requirements are satisfied.",
  });
  assert.deepEqual(workflow.auditEntries[0], {
    case_id: workflow.caseRecord.id,
    actor_id: workflow.reviewerUserId,
    action_type: "review_approved",
    field_name: "status",
    old_value: "submitted",
    new_value: "approved",
    reason: "Reviewer approved the submitted case. Comment: All CPT requirements are satisfied.",
  });
});

test("review denial moves a submitted case to denied", async () => {
  const workflow = buildReviewerWorkflowContext("submitted");

  const result = await denyCase(workflow.context, {
    caseId: workflow.caseRecord.id,
    reviewerComment: "The offer details do not match school policy.",
  });

  assert.equal(result.status, "denied");
  assert.equal(workflow.caseRecord.status, "denied");
  assert.deepEqual(workflow.reviewerDecisionCalls, [
    {
      p_case_id: workflow.caseRecord.id,
      p_next_status: "denied",
      p_reviewer_comment: "The offer details do not match school policy.",
    },
  ]);
  assert.equal(workflow.timelineEvents[0]?.title, "Case denied");
  assert.equal(workflow.auditEntries[0]?.action_type, "review_denied");
});

test("requesting changes moves a submitted case to change pending", async () => {
  const workflow = buildReviewerWorkflowContext("submitted");

  const result = await requestCaseChanges(workflow.context, {
    caseId: workflow.caseRecord.id,
    reviewerComment: "Please upload an updated advisor approval and clarify the work location.",
  });

  assert.equal(result.status, "change_pending");
  assert.equal(workflow.caseRecord.status, "change_pending");
  assert.deepEqual(workflow.reviewerDecisionCalls, [
    {
      p_case_id: workflow.caseRecord.id,
      p_next_status: "change_pending",
      p_reviewer_comment:
        "Please upload an updated advisor approval and clarify the work location.",
    },
  ]);
  assert.equal(workflow.timelineEvents[0]?.title, "Changes requested");
  assert.equal(workflow.auditEntries[0]?.action_type, "review_changes_requested");
});

test("reviewer decisions reject callers without the school_admin role", async () => {
  const workflow = buildReviewerWorkflowContext("submitted", {
    reviewerHasSchoolAdminRole: false,
  });

  await assert.rejects(
    () =>
      approveCase(workflow.context, {
        caseId: workflow.caseRecord.id,
        reviewerComment: null,
      }),
    /Reviewer access requires the school_admin role\./,
  );

  assert.equal(workflow.caseRecord.status, "submitted");
  assert.equal(workflow.caseUpdates.length, 0);
  assert.deepEqual(workflow.reviewerDecisionCalls, [
    {
      p_case_id: workflow.caseRecord.id,
      p_next_status: "approved",
      p_reviewer_comment: null,
    },
  ]);
  assert.equal(workflow.timelineEvents.length, 0);
  assert.equal(workflow.auditEntries.length, 0);
});

test("reviewer decisions reject cases that are no longer submitted", async () => {
  const workflow = buildReviewerWorkflowContext("change_pending");

  await assert.rejects(
    () =>
      requestCaseChanges(workflow.context, {
        caseId: workflow.caseRecord.id,
        reviewerComment: "Still waiting on updated documents.",
      }),
    /Only submitted cases can be reviewed\./,
  );

  assert.equal(workflow.caseRecord.status, "change_pending");
  assert.equal(workflow.caseUpdates.length, 0);
  assert.deepEqual(workflow.reviewerDecisionCalls, [
    {
      p_case_id: workflow.caseRecord.id,
      p_next_status: "change_pending",
      p_reviewer_comment: "Still waiting on updated documents.",
    },
  ]);
  assert.equal(workflow.timelineEvents.length, 0);
  assert.equal(workflow.auditEntries.length, 0);
});

test("stale reviewer decisions fail cleanly without overwriting the current status", async () => {
  const workflow = buildReviewerWorkflowContext("submitted", {
    staleReviewerDecisionStatus: "approved",
  });

  await assert.rejects(
    () =>
      denyCase(workflow.context, {
        caseId: workflow.caseRecord.id,
        reviewerComment: "Late denial attempt after another reviewer approved the case.",
      }),
    /Only submitted cases can be reviewed\./,
  );

  assert.equal(workflow.caseRecord.status, "approved");
  assert.deepEqual(workflow.reviewerDecisionCalls, [
    {
      p_case_id: workflow.caseRecord.id,
      p_next_status: "denied",
      p_reviewer_comment: "Late denial attempt after another reviewer approved the case.",
    },
  ]);
  assert.equal(workflow.caseUpdates.length, 0);
  assert.equal(workflow.timelineEvents.length, 0);
  assert.equal(workflow.auditEntries.length, 0);
});

test("review approval can omit a comment while preserving canonical DB-owned history", async () => {
  const workflow = buildReviewerWorkflowContext("submitted");

  const result = await approveCase(workflow.context, {
    caseId: workflow.caseRecord.id,
    reviewerComment: null,
  });

  assert.equal(result.status, "approved");
  assert.deepEqual(workflow.reviewerDecisionCalls, [
    {
      p_case_id: workflow.caseRecord.id,
      p_next_status: "approved",
      p_reviewer_comment: null,
    },
  ]);
  assert.deepEqual(workflow.timelineEvents[0], {
    case_id: workflow.caseRecord.id,
    event_type: "status_changed",
    title: "Case approved",
    description: "School review approved this case.",
  });
  assert.deepEqual(workflow.auditEntries[0], {
    case_id: workflow.caseRecord.id,
    actor_id: workflow.reviewerUserId,
    action_type: "review_approved",
    field_name: "status",
    old_value: "submitted",
    new_value: "approved",
    reason: "Reviewer approved the submitted case.",
  });
});
