import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentUploadTimelineEvent, runDeterministicCaseEvaluation } from "./workflows.server.ts";
import type { CaseRecord, DocumentRecord, ExtractedFieldRecord } from "./types";

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
  upload_registration_id: overrides.upload_registration_id ?? `upload-${documentType}-${versionNumber}`,
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