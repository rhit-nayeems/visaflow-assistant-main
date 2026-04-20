import assert from "node:assert/strict";
import test from "node:test";
import { extractDocumentWithLocalStub } from "./document-extraction.ts";

test("local stub extraction normalizes supported text-pattern fields", async () => {
  const documentText = `
    Employer Name: Acme Corp
    Job Title: Software Engineer Intern
    Job Duties: Build product features and support releases
    Work Location: Remote
    Start Date: 06/01/2099
  `;

  const result = await extractDocumentWithLocalStub({
    documentType: "offer_letter",
    fileBuffer: new TextEncoder().encode(documentText).buffer,
    fileName: "offer-letter.txt",
  });

  assert.equal(result.status, "succeeded");
  if (result.status !== "succeeded") {
    return;
  }

  assert.deepEqual(result.extractedFields, [
    {
      confidenceScore: 0.35,
      fieldName: "job_duties",
      fieldValue: "Build product features and support releases",
    },
    {
      confidenceScore: 0.35,
      fieldName: "employer_name",
      fieldValue: "Acme Corp",
    },
    {
      confidenceScore: 0.35,
      fieldName: "role_title",
      fieldValue: "Software Engineer Intern",
    },
    {
      confidenceScore: 0.35,
      fieldName: "work_location",
      fieldValue: "Remote",
    },
    {
      confidenceScore: 0.35,
      fieldName: "start_date",
      fieldValue: "2099-06-01",
    },
  ]);
});

test("local stub extraction fails clearly when the file does not contain supported text", async () => {
  const result = await extractDocumentWithLocalStub({
    documentType: "offer_letter",
    fileBuffer: new Uint8Array([0, 159, 255, 0, 12, 4, 0, 255, 0, 1]).buffer,
    fileName: "offer-letter.png",
  });

  assert.equal(result.status, "failed");
  if (result.status !== "failed") {
    return;
  }

  assert.match(result.errorMessage, /does not have a production OCR/i);
});
