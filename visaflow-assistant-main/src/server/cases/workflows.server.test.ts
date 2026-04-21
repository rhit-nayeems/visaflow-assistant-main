import assert from "node:assert/strict";
import test from "node:test";
import { STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES } from "../../lib/cases/document-extraction-state.ts";
import {
  approveCase,
  buildDocumentUploadTimelineEvent,
  denyCase,
  reevaluateCaseAfterUploads,
  registerUploadedCaseDocument,
  retryCaseDocumentExtraction,
  requestCaseChanges,
  runDeterministicCaseEvaluation,
  saveManualExtractedFields,
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
const APPLY_MANUAL_EXTRACTED_FIELD_REVIEW_RPC = "apply_manual_extracted_field_review";
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
  extraction_completed_at: overrides.extraction_completed_at ?? null,
  extraction_error: overrides.extraction_error ?? null,
  extraction_started_at: overrides.extraction_started_at ?? null,
  extraction_status: overrides.extraction_status ?? "succeeded",
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
  overrides: Partial<ExtractedFieldRecord> = {},
): ExtractedFieldRecord => ({
  id: overrides.id ?? `${documentId}-${fieldName}`,
  document_id: overrides.document_id ?? documentId,
  field_name: overrides.field_name ?? fieldName,
  field_value: overrides.field_value !== undefined ? overrides.field_value : fieldValue,
  confidence_score: overrides.confidence_score !== undefined ? overrides.confidence_score : 0.98,
  manually_corrected: overrides.manually_corrected ?? false,
  created_at: overrides.created_at ?? "2026-04-20T00:00:00.000Z",
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
  options: {
    caseOverrides?: Partial<CaseRecord>;
    documents?: DocumentRecord[];
    templateConfig?: unknown;
  } = {},
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
  const caseRecord = buildCaseRecord(status, {
    ...options.caseOverrides,
    school_template_id:
      options.templateConfig === undefined
        ? options.caseOverrides?.school_template_id
        : (options.caseOverrides?.school_template_id ?? "template-123"),
  });
  const documents = [...(options.documents ?? [])];

  const supabase = {
    from(table: string) {
      if (table === "cases") {
        return createCasesTable();
      }

      if (table === "documents") {
        return createDocumentsTable();
      }

      if (table === "school_templates") {
        return createSchoolTemplatesTable();
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
        const matchingDocuments = documents.filter((document) =>
          Object.entries(filters).every(([filterColumn, filterValue]) => {
            return String(document[filterColumn as keyof DocumentRecord]) === filterValue;
          }),
        );

        const sortedDocuments = [...matchingDocuments].sort((left, right) => {
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

  function createSchoolTemplatesTable() {
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
      async single() {
        const matchesTemplate =
          caseRecord.school_template_id !== null && filters.id === caseRecord.school_template_id;

        return {
          data: matchesTemplate ? { config_json: options.templateConfig ?? null } : null,
          error: matchesTemplate ? null : new Error("Template not found."),
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

const buildStatefulWorkflowHarness = (
  options: {
    manualReviewRpcError?: string;
  } = {},
): {
  caseRecord: CaseRecord;
  documents: DocumentRecord[];
  extractedFields: ExtractedFieldRecord[];
  auditEntries: AuditLogInsert[];
  caseUpdates: Array<Partial<CaseRecord>>;
  timelineEvents: TimelineEventInsert[];
  createContext: () => CaseWorkflowContext;
  setStoredDocument: (filePath: string, content: string | Uint8Array | Error) => void;
} => {
  const { documents, extractedFields } = buildReadyCaseDocuments();
  const caseRecord = buildCaseRecord("ready_for_submission");
  const timelineEvents: TimelineEventInsert[] = [];
  const auditEntries: AuditLogInsert[] = [];
  const caseUpdates: Array<Partial<CaseRecord>> = [];
  const storedDocuments = new Map<string, string | Uint8Array | Error>();
  let nextDocumentNumber = documents.length + 1;
  let nextDocumentCreatedAtSecond = 10;
  let nextExtractedFieldNumber = extractedFields.length + 1;
  const manualReviewRpcError = options.manualReviewRpcError ?? null;

  for (const document of documents) {
    storedDocuments.set(
      document.file_path,
      "Job Duties: Build product features and support product releases",
    );
  }

  const setStoredDocument = (filePath: string, content: string | Uint8Array | Error) => {
    storedDocuments.set(filePath, content);
  };

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
              const nextDocument = buildDocumentRecord(documentType, nextVersionNumber, {
                case_id: String(args.p_case_id),
                created_at: createdAt,
                extraction_status: "pending",
                file_name: String(args.p_file_name),
                file_path: String(args.p_file_path),
                id: documentId,
                upload_registration_id: uploadRegistrationId,
              });

              nextDocumentNumber += 1;
              nextDocumentCreatedAtSecond += 1;
              documents.push(nextDocument);

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

        if (fn === APPLY_MANUAL_EXTRACTED_FIELD_REVIEW_RPC) {
          if (manualReviewRpcError) {
            return {
              error: new Error(manualReviewRpcError),
            };
          }

          const fieldChanges = Array.isArray(args.p_field_changes)
            ? (args.p_field_changes as Array<Record<string, unknown>>)
            : null;

          if (!fieldChanges || fieldChanges.length === 0) {
            return {
              error: new Error("At least one extracted field edit is required."),
            };
          }

          const draftDocuments = documents.map((document) => ({ ...document }));
          const draftExtractedFields = extractedFields.map((field) => ({ ...field }));
          let draftNextExtractedFieldNumber = nextExtractedFieldNumber;
          const touchedDocumentIds = new Set<string>();
          const reviewedAt = String(args.p_reviewed_at);

          for (const fieldChange of fieldChanges) {
            const documentId = String(fieldChange.document_id);
            const fieldName = String(fieldChange.field_name);
            const existingFieldId =
              typeof fieldChange.existing_field_id === "string"
                ? fieldChange.existing_field_id
                : null;
            const nextValue =
              typeof fieldChange.field_value === "string" ? fieldChange.field_value : null;
            const draftDocument = draftDocuments.find((document) => document.id === documentId);

            if (!draftDocument) {
              return {
                error: new Error("Document not found or you do not have access."),
              };
            }

            const newerDocumentExists = draftDocuments.some(
              (document) =>
                document.case_id === draftDocument.case_id &&
                document.document_type === draftDocument.document_type &&
                document.version_number > draftDocument.version_number,
            );

            if (newerDocumentExists) {
              return {
                error: new Error(
                  "Only blocker-level extracted fields from the latest relevant document versions can be edited.",
                ),
              };
            }

            if (existingFieldId) {
              const draftField = draftExtractedFields.find(
                (field) => field.id === existingFieldId && field.document_id === documentId,
              );

              if (!draftField) {
                return {
                  error: new Error("Unable to save the reviewed extracted field."),
                };
              }

              Object.assign(draftField, {
                confidence_score: null,
                field_value: nextValue,
                manually_corrected: true,
              });
            } else {
              draftExtractedFields.push(
                buildExtractedFieldRecord(documentId, fieldName, nextValue ?? "", {
                  confidence_score: null,
                  created_at: "2026-04-20T00:05:00.000Z",
                  field_value: nextValue,
                  id: `extracted-${draftNextExtractedFieldNumber}`,
                  manually_corrected: true,
                }),
              );
              draftNextExtractedFieldNumber += 1;
            }

            touchedDocumentIds.add(documentId);
          }

          for (const draftDocument of draftDocuments) {
            if (
              !touchedDocumentIds.has(draftDocument.id) ||
              (draftDocument.extraction_status === "succeeded" &&
                draftDocument.extraction_error === null)
            ) {
              continue;
            }

            Object.assign(draftDocument, {
              extraction_completed_at: reviewedAt,
              extraction_error: null,
              extraction_started_at: draftDocument.extraction_started_at ?? reviewedAt,
              extraction_status: "succeeded",
            });
          }

          documents.splice(0, documents.length, ...draftDocuments);
          extractedFields.splice(0, extractedFields.length, ...draftExtractedFields);
          nextExtractedFieldNumber = draftNextExtractedFieldNumber;
          caseRecord.status = args.p_next_status as CaseRecord["status"];
          caseRecord.needs_document_reevaluation = Boolean(args.p_needs_document_reevaluation);

          return { error: null };
        }

        if (fn === FINALIZE_CASE_REQUIREMENT_EVALUATION_RPC) {
          caseRecord.status = args.p_next_status as CaseRecord["status"];
          caseRecord.needs_document_reevaluation = false;
          return { error: null };
        }

        throw new Error(`Unexpected RPC call: ${fn}`);
      },
      storage: {
        from(bucket: string) {
          if (bucket !== "case-documents") {
            throw new Error(`Unexpected storage bucket: ${bucket}`);
          }

          return {
            async download(filePath: string) {
              if (!storedDocuments.has(filePath)) {
                return {
                  data: null,
                  error: new Error(`No stored test document found for ${filePath}.`),
                };
              }

              const storedDocument = storedDocuments.get(filePath)!;
              if (storedDocument instanceof Error) {
                return {
                  data: null,
                  error: storedDocument,
                };
              }

              const bytes =
                typeof storedDocument === "string"
                  ? new TextEncoder().encode(storedDocument)
                  : storedDocument;

              return {
                data: {
                  async arrayBuffer() {
                    return bytes.buffer.slice(
                      bytes.byteOffset,
                      bytes.byteOffset + bytes.byteLength,
                    );
                  },
                },
                error: null,
              };
            },
          };
        },
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
    let mode: "select" | "update" | null = null;
    let filters: Record<string, string> = {};
    let mutation: Partial<DocumentRecord> | null = null;

    const findMatchingDocuments = () =>
      documents.filter((document) =>
        Object.entries(filters).every(([filterColumn, filterValue]) => {
          return String(document[filterColumn as keyof DocumentRecord]) === filterValue;
        }),
      );

    return {
      select() {
        mode = "select";
        filters = {};
        mutation = null;
        return this;
      },
      update(values: Partial<DocumentRecord>) {
        mode = "update";
        filters = {};
        mutation = values;
        return this;
      },
      eq(column: string, value: string) {
        filters[column] = value;

        if (mode === "update" && filters.id && filters.case_id) {
          const matchingDocuments = findMatchingDocuments();

          if (matchingDocuments.length > 0 && mutation) {
            for (const document of matchingDocuments) {
              Object.assign(document, mutation);
            }
          }

          return Promise.resolve({
            error:
              matchingDocuments.length > 0
                ? null
                : new Error("Document not found or you do not have access."),
          });
        }

        return this;
      },
      async maybeSingle() {
        const [matchingDocument] = findMatchingDocuments();

        return {
          data: matchingDocument ?? null,
          error: null,
        };
      },
      async order(column: string, options?: { ascending?: boolean }) {
        const sortedDocuments = [...findMatchingDocuments()].sort((left, right) => {
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
    let mode: "select" | "delete" | "update" | null = null;
    let filters: Record<string, string> = {};
    let mutation: Partial<
      Pick<ExtractedFieldRecord, "confidence_score" | "field_value" | "manually_corrected">
    > | null = null;

    return {
      select() {
        mode = "select";
        filters = {};
        mutation = null;
        return this;
      },
      delete() {
        mode = "delete";
        filters = {};
        mutation = null;
        return this;
      },
      update(
        values: Partial<
          Pick<ExtractedFieldRecord, "confidence_score" | "field_value" | "manually_corrected">
        >,
      ) {
        mode = "update";
        filters = {};
        mutation = values;
        return this;
      },
      eq(column: string, value: string) {
        filters[column] = value;

        if (mode === "delete" && filters.document_id) {
          for (let index = extractedFields.length - 1; index >= 0; index -= 1) {
            if (extractedFields[index]?.document_id === filters.document_id) {
              extractedFields.splice(index, 1);
            }
          }

          return Promise.resolve({ error: null });
        }

        if (mode === "update" && filters.id && filters.document_id) {
          const matchingField = extractedFields.find(
            (field) => field.id === filters.id && field.document_id === filters.document_id,
          );

          if (matchingField && mutation) {
            Object.assign(matchingField, mutation);
          }

          return Promise.resolve({
            error:
              matchingField !== undefined
                ? null
                : new Error("Unable to save the reviewed extracted field."),
          });
        }

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
      async insert(
        values: Array<{
          confidence_score?: number | null;
          document_id: string;
          field_name: string;
          field_value?: string | null;
          manually_corrected?: boolean;
        }>,
      ) {
        for (const value of values) {
          extractedFields.push({
            confidence_score: value.confidence_score ?? null,
            created_at: "2026-04-20T00:05:00.000Z",
            document_id: value.document_id,
            field_name: value.field_name,
            field_value: value.field_value ?? null,
            id: `extracted-${nextExtractedFieldNumber}`,
            manually_corrected: value.manually_corrected ?? false,
          });
          nextExtractedFieldNumber += 1;
        }

        return { error: null };
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
    setStoredDocument,
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

test("deterministic evaluation ignores stale extracted fields from superseded document versions", () => {
  const latestOfferLetter = buildDocumentRecord("offer_letter", 2, { id: "offer-2" });
  const documents = [
    buildDocumentRecord("offer_letter", 1, { id: "offer-1" }),
    latestOfferLetter,
    buildDocumentRecord("advisor_approval", 1, { id: "advisor-1" }),
    buildDocumentRecord("course_registration", 1, { id: "course-1" }),
  ];
  const extractedFields = [
    buildExtractedFieldRecord("offer-1", "job_duties", "Old duties from the superseded version", {
      manually_corrected: true,
    }),
  ];

  const result = runDeterministicCaseEvaluation({
    caseData: buildCaseRecord("ready_for_submission"),
    documents,
    extractedFields,
    templateConfig: null,
  });

  assert.equal(result.nextStatus, "blocked");
  assert.equal(
    result.evaluatedRequirements.find(
      (requirement) => requirement.requirement_key === "job_duties_available",
    )?.status,
    "not_met",
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

test("submission repairs a stale reevaluation flag when no relevant latest documents remain unresolved", async () => {
  const workflow = buildWorkflowContextForSubmission("ready_for_submission", {
    caseOverrides: {
      needs_document_reevaluation: true,
    },
    documents: [
      buildDocumentRecord("offer_letter", 1, {
        extraction_status: "succeeded",
      }),
    ],
  });

  const result = await submitCaseForReview(workflow.context, {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(result.status, "submitted");
  assert.equal(workflow.caseRecord.status, "submitted");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);
  assert.deepEqual(workflow.caseUpdates, [
    { needs_document_reevaluation: false },
    { status: "submitted" },
  ]);
});

test("submission keeps the reevaluation flag when a relevant latest document is still unresolved", async () => {
  const workflow = buildWorkflowContextForSubmission("ready_for_submission", {
    caseOverrides: {
      needs_document_reevaluation: true,
    },
    documents: [
      buildDocumentRecord("offer_letter", 1, {
        extraction_status: "failed",
      }),
    ],
  });

  await assert.rejects(
    () =>
      submitCaseForReview(workflow.context, {
        caseId: workflow.caseRecord.id,
      }),
    /Wait for document extraction to finish, or retry any failed or stale extraction, before submitting this case for review\./,
  );

  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);
  assert.equal(workflow.caseUpdates.length, 0);
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

test("submission rejects unresolved latest extraction on a relevant default document even when the reevaluation flag is false", async () => {
  const workflow = buildWorkflowContextForSubmission("ready_for_submission", {
    documents: [
      buildDocumentRecord("offer_letter", 1, {
        extraction_status: "pending",
      }),
    ],
  });

  await assert.rejects(
    () =>
      submitCaseForReview(workflow.context, {
        caseId: workflow.caseRecord.id,
      }),
    /Wait for document extraction to finish, or retry any failed or stale extraction, before submitting this case for review\./,
  );

  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(workflow.caseUpdates.length, 0);
  assert.equal(workflow.timelineEvents.length, 0);
  assert.equal(workflow.auditEntries.length, 0);
});

test("submission rejects unresolved latest extraction when an extracted-field requirement makes the document relevant", async () => {
  const workflow = buildWorkflowContextForSubmission("ready_for_submission", {
    templateConfig: {
      requirements: [
        {
          key: "offer_letter_uploaded",
          label: "Offer letter uploaded",
          severity: "blocker",
          type: "document",
          documentType: "offer_letter",
        },
        {
          key: "sevis_id_available",
          label: "SEVIS ID available",
          severity: "blocker",
          type: "extracted_field",
          documentType: "i20",
          extractedFieldName: "sevis_id",
        },
      ],
    },
    documents: [
      buildDocumentRecord("offer_letter", 1, {
        extraction_status: "succeeded",
      }),
      buildDocumentRecord("i20", 1, {
        extraction_started_at: "2026-04-20T00:00:00.000Z",
        extraction_status: "processing",
      }),
    ],
  });

  await assert.rejects(
    () =>
      submitCaseForReview(workflow.context, {
        caseId: workflow.caseRecord.id,
      }),
    /Wait for document extraction to finish, or retry any failed or stale extraction, before submitting this case for review\./,
  );

  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(workflow.caseUpdates.length, 0);
  assert.equal(workflow.timelineEvents.length, 0);
  assert.equal(workflow.auditEntries.length, 0);
});

test("submission ignores unresolved latest extraction on an optional uploadable document that is not required by the active template", async () => {
  const workflow = buildWorkflowContextForSubmission("ready_for_submission", {
    templateConfig: {
      requirements: [
        {
          key: "offer_letter_uploaded",
          label: "Offer letter uploaded",
          severity: "blocker",
          type: "document",
          documentType: "offer_letter",
        },
        {
          key: "job_duties_available",
          label: "Job duties available",
          severity: "blocker",
          type: "extracted_field",
          documentType: "offer_letter",
          extractedFieldName: "job_duties",
        },
      ],
    },
    documents: [
      buildDocumentRecord("offer_letter", 1, {
        extraction_status: "succeeded",
      }),
      buildDocumentRecord("other", 1, {
        extraction_status: "failed",
      }),
    ],
  });

  const result = await submitCaseForReview(workflow.context, {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(result.status, "submitted");
  assert.equal(workflow.caseRecord.status, "submitted");
  assert.deepEqual(workflow.caseUpdates, [{ status: "submitted" }]);
  assert.equal(workflow.timelineEvents.length, 1);
  assert.equal(workflow.auditEntries.length, 1);
});

test("document upload automatically extracts and re-evaluates the case on success", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, "Job Duties: Build product features and support releases");

  const uploadResult = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  assert.equal(uploadResult.createdNew, true);
  assert.equal(uploadResult.versionNumber, 2);
  assert.equal(uploadResult.extractionStatus, "succeeded");
  assert.equal(uploadResult.reevaluationStatus, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);
  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_status,
    "succeeded",
  );
  assert.equal(
    workflow.extractedFields.some(
      (field) =>
        field.document_id === uploadResult.documentId &&
        field.field_name === "job_duties" &&
        field.field_value === "Build product features and support releases",
    ),
    true,
  );

  const submissionResult = await submitCaseForReview(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(submissionResult.status, "submitted");
  assert.equal(workflow.caseRecord.status, "submitted");
});

test("uploading an optional document that fails extraction does not poison submission via the reevaluation flag", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-other-1/other-supporting-doc.pdf`;

  workflow.setStoredDocument(filePath, new Uint8Array([0, 159, 255, 0, 12, 4, 0, 255]));

  const uploadResult = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "other",
    fileName: "other-supporting-doc.pdf",
    filePath,
    uploadRegistrationId: "upload-other-1",
  });

  assert.equal(uploadResult.createdNew, true);
  assert.equal(uploadResult.extractionStatus, "failed");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);
  assert.equal(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_status,
    "failed",
  );

  const submissionResult = await submitCaseForReview(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(submissionResult.status, "submitted");
  assert.equal(workflow.caseRecord.status, "submitted");
});

test("failed extraction keeps submission blocked until retry succeeds", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, new Uint8Array([0, 159, 255, 0, 12, 4, 0, 255]));

  const firstAttempt = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  assert.equal(firstAttempt.createdNew, true);
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);
  assert.equal(firstAttempt.extractionStatus, "failed");
  assert.match(firstAttempt.extractionError ?? "", /production OCR/i);

  await assert.rejects(
    () =>
      submitCaseForReview(workflow.createContext(), {
        caseId: workflow.caseRecord.id,
      }),
    /Wait for document extraction to finish, or retry any failed or stale extraction, before submitting this case for review\./,
  );

  workflow.setStoredDocument(filePath, "Job Duties: Build product features and support releases");

  const retryResult = await retryCaseDocumentExtraction(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentId: firstAttempt.documentId,
  });

  assert.equal(retryResult.extractionStatus, "succeeded");
  assert.equal(retryResult.reevaluationStatus, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);
  assert.equal(
    workflow.documents.find((document) => document.id === firstAttempt.documentId)
      ?.extraction_status,
    "succeeded",
  );
});

test("manual reevaluation preserves the case flag when the latest relevant document extraction is still unresolved", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, new Uint8Array([0, 159, 255, 0, 12, 4, 0, 255]));

  await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  const reevaluationResult = await reevaluateCaseAfterUploads(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
  });

  assert.equal(reevaluationResult.status, "blocked");
  assert.equal(workflow.caseRecord.status, "blocked");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);
});

test("manual extracted-field save resolves a failed latest document version through reevaluation", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, new Uint8Array([0, 159, 255, 0, 12, 4, 0, 255]));

  const uploadResult = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  const saveResult = await saveManualExtractedFields(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    fields: [
      {
        documentId: uploadResult.documentId,
        fieldName: "job_duties",
        fieldValue: "Build product features and support releases manually",
      },
    ],
  });

  assert.equal(saveResult.status, "ready_for_submission");
  assert.equal(saveResult.updatedFieldCount, 1);
  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);
  assert.equal(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_status,
    "succeeded",
  );
  assert.equal(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_error,
    null,
  );
  assert.deepEqual(
    workflow.extractedFields.find(
      (field) => field.document_id === uploadResult.documentId && field.field_name === "job_duties",
    ),
    buildExtractedFieldRecord(
      uploadResult.documentId,
      "job_duties",
      "Build product features and support releases manually",
      {
        confidence_score: null,
        created_at: "2026-04-20T00:05:00.000Z",
        id: "extracted-2",
        manually_corrected: true,
      },
    ),
  );
  assert.equal(
    workflow.timelineEvents.some((event) => event.event_type === "extracted_fields_reviewed"),
    true,
  );
  assert.equal(
    workflow.auditEntries.some(
      (entry) =>
        entry.action_type === "extracted_field_reviewed" &&
        entry.field_name === "offer_letter.job_duties" &&
        entry.old_value === null &&
        entry.new_value === "Build product features and support releases manually",
    ),
    true,
  );
});

test("manual extracted-field save validates the full request before mutating primary state", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, new Uint8Array([0, 159, 255, 0, 12, 4, 0, 255]));

  const uploadResult = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  await assert.rejects(
    () =>
      saveManualExtractedFields(workflow.createContext(), {
        caseId: workflow.caseRecord.id,
        fields: [
          {
            documentId: uploadResult.documentId,
            fieldName: "job_duties",
            fieldValue: "Build product features and support releases manually",
          },
          {
            documentId: "offer-1",
            fieldName: "job_duties",
            fieldValue: "Superseded version edit",
          },
        ],
      }),
    /Only blocker-level extracted fields from the latest relevant document versions can be edited\./,
  );

  assert.equal(
    workflow.extractedFields.some(
      (field) => field.document_id === uploadResult.documentId && field.field_name === "job_duties",
    ),
    false,
  );
  assert.equal(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_status,
    "failed",
  );
  assert.match(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_error ?? "",
    /production OCR/i,
  );
  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);
  assert.equal(
    workflow.timelineEvents.some((event) => event.event_type === "extracted_fields_reviewed"),
    false,
  );
  assert.equal(
    workflow.auditEntries.some((entry) => entry.action_type === "extracted_field_reviewed"),
    false,
  );
});

test("manual extracted-field save rolls back primary state when reevaluation persistence fails", async () => {
  const workflow = buildStatefulWorkflowHarness({
    manualReviewRpcError: "Manual extracted-field reevaluation failed.",
  });
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, new Uint8Array([0, 159, 255, 0, 12, 4, 0, 255]));

  const uploadResult = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  await assert.rejects(
    () =>
      saveManualExtractedFields(workflow.createContext(), {
        caseId: workflow.caseRecord.id,
        fields: [
          {
            documentId: uploadResult.documentId,
            fieldName: "job_duties",
            fieldValue: "Build product features and support releases manually",
          },
        ],
      }),
    /Manual extracted-field reevaluation failed\./,
  );

  assert.equal(
    workflow.extractedFields.some(
      (field) => field.document_id === uploadResult.documentId && field.field_name === "job_duties",
    ),
    false,
  );
  assert.equal(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_status,
    "failed",
  );
  assert.match(
    workflow.documents.find((document) => document.id === uploadResult.documentId)
      ?.extraction_error ?? "",
    /production OCR/i,
  );
  assert.equal(workflow.caseRecord.status, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, true);
  assert.equal(
    workflow.timelineEvents.some((event) => event.event_type === "extracted_fields_reviewed"),
    false,
  );
  assert.equal(
    workflow.auditEntries.some((entry) => entry.action_type === "extracted_field_reviewed"),
    false,
  );
});

test("manual extracted-field save rejects superseded document versions", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, "Job Duties: Build product features and support releases");

  await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  await assert.rejects(
    () =>
      saveManualExtractedFields(workflow.createContext(), {
        caseId: workflow.caseRecord.id,
        fields: [
          {
            documentId: "offer-1",
            fieldName: "job_duties",
            fieldValue: "Superseded version edit",
          },
        ],
      }),
    /Only blocker-level extracted fields from the latest relevant document versions can be edited\./,
  );

  assert.equal(
    workflow.extractedFields.find(
      (field) => field.document_id === "offer-1" && field.field_name === "job_duties",
    )?.field_value,
    "Build product features",
  );
});

test("retry rejects fresh processing extraction before it becomes stale", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const processingDocument = workflow.documents[0]!;

  processingDocument.extraction_status = "processing";
  processingDocument.extraction_started_at = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  workflow.caseRecord.needs_document_reevaluation = true;

  await assert.rejects(
    () =>
      retryCaseDocumentExtraction(workflow.createContext(), {
        caseId: workflow.caseRecord.id,
        documentId: processingDocument.id,
      }),
    new RegExp(
      `Retry becomes available after ${STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES} minutes if processing stays stuck\\.`,
    ),
  );

  assert.equal(processingDocument.extraction_status, "processing");
  assert.equal(workflow.documents.length, 3);
});

test("stale processing extraction can be retried without creating a duplicate document row", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const processingDocument = workflow.documents[0]!;

  workflow.caseRecord.needs_document_reevaluation = true;
  processingDocument.extraction_status = "processing";
  processingDocument.extraction_started_at = new Date(
    Date.now() - (STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES + 1) * 60 * 1000,
  ).toISOString();
  workflow.setStoredDocument(
    processingDocument.file_path,
    "Job Duties: Build product features and support releases",
  );

  const retryResult = await retryCaseDocumentExtraction(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentId: processingDocument.id,
  });

  assert.equal(retryResult.documentId, processingDocument.id);
  assert.equal(retryResult.extractionStatus, "succeeded");
  assert.equal(retryResult.reevaluationStatus, "ready_for_submission");
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);
  assert.equal(workflow.documents.length, 3);
  assert.equal(
    workflow.documents.find((document) => document.id === processingDocument.id)?.extraction_status,
    "succeeded",
  );
});

test("retrying the same upload registration does not create a duplicate document or rerun extraction", async () => {
  const workflow = buildStatefulWorkflowHarness();
  const filePath = `${workflow.caseRecord.user_id}/${workflow.caseRecord.id}/upload-offer-letter-2/offer-letter-v2.pdf`;

  workflow.setStoredDocument(filePath, "Job Duties: Build product features and support releases");

  const firstAttempt = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });
  const secondAttempt = await registerUploadedCaseDocument(workflow.createContext(), {
    caseId: workflow.caseRecord.id,
    documentType: "offer_letter",
    fileName: "offer-letter-v2.pdf",
    filePath,
    uploadRegistrationId: "upload-offer-letter-2",
  });

  assert.equal(firstAttempt.createdNew, true);
  assert.equal(secondAttempt.createdNew, false);
  assert.equal(secondAttempt.extractionStatus, "succeeded");
  assert.equal(
    workflow.documents.filter((document) => document.document_type === "offer_letter").length,
    2,
  );
  assert.equal(
    workflow.extractedFields.filter((field) => field.document_id === firstAttempt.documentId)
      .length,
    1,
  );
  assert.equal(workflow.caseRecord.needs_document_reevaluation, false);
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
