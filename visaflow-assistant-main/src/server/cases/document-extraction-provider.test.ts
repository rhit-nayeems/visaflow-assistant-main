import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildExtractionContent,
  CLAUDE_DOCUMENT_EXTRACTOR_ID,
  detectExtractionMedia,
  localStubProvider,
  mapClaudeFieldsToExtracted,
  selectDocumentExtractionProvider,
} from "./document-extraction-provider.ts";
import { LOCAL_CASE_DOCUMENT_EXTRACTOR_ID } from "./document-extraction.ts";
import { MAX_FILE_SIZE } from "../../lib/constants.ts";

test("mapClaudeFieldsToExtracted keeps supported, non-empty string fields and trims whitespace", () => {
  const fields = mapClaudeFieldsToExtracted({
    employer_name: "  Cloudgrid   Inc.  ",
    role_title: "SW Engineer",
    work_location: "",
    job_duties: "Build and test data pipelines",
    start_date: "2026-06-15",
    end_date: null,
    unsupported_field: "ignored",
    notes: 42,
  });

  assert.deepEqual(
    fields.map((field) => field.fieldName),
    ["employer_name", "role_title", "job_duties", "start_date"],
  );
  assert.equal(
    fields.find((field) => field.fieldName === "employer_name")?.fieldValue,
    "Cloudgrid Inc.",
  );
  assert.ok(fields.every((field) => typeof field.confidenceScore === "number"));
});

test("mapClaudeFieldsToExtracted returns nothing when no usable fields are present", () => {
  assert.deepEqual(mapClaudeFieldsToExtracted({ foo: "bar", start_date: 5 }), []);
});

test("selectDocumentExtractionProvider falls back to the local stub without an API key", () => {
  assert.equal(
    selectDocumentExtractionProvider({ apiKey: undefined }).id,
    LOCAL_CASE_DOCUMENT_EXTRACTOR_ID,
  );
  assert.equal(
    selectDocumentExtractionProvider({ apiKey: "   " }).id,
    LOCAL_CASE_DOCUMENT_EXTRACTOR_ID,
  );
  assert.equal(
    selectDocumentExtractionProvider({ apiKey: null }).id,
    LOCAL_CASE_DOCUMENT_EXTRACTOR_ID,
  );
  assert.equal(localStubProvider.id, LOCAL_CASE_DOCUMENT_EXTRACTOR_ID);
});

test("selectDocumentExtractionProvider uses the Claude provider when an API key is present", () => {
  const provider = selectDocumentExtractionProvider({ apiKey: "sk-ant-test-key" });
  assert.equal(provider.id, CLAUDE_DOCUMENT_EXTRACTOR_ID);
});

test("detectExtractionMedia maps PDFs and images to native content, others to text", () => {
  assert.deepEqual(detectExtractionMedia("offer-letter.pdf"), {
    kind: "pdf",
    mediaType: "application/pdf",
  });
  assert.deepEqual(detectExtractionMedia("scan.JPG"), { kind: "image", mediaType: "image/jpeg" });
  assert.deepEqual(detectExtractionMedia("photo.png"), { kind: "image", mediaType: "image/png" });
  assert.equal(detectExtractionMedia("notes.txt").kind, "text");
  assert.equal(detectExtractionMedia("no-extension").kind, "text");
});

test("buildExtractionContent sends a PDF as a base64 document block plus instruction", () => {
  const fileBuffer = new TextEncoder().encode("%PDF-1.7 binary bytes").buffer;
  const built = buildExtractionContent({
    documentType: "offer_letter",
    fileBuffer,
    fileName: "offer.pdf",
  });

  assert.ok("content" in built);
  const [doc, instruction] = built.content;
  assert.equal(doc.type, "document");
  assert.equal(doc.type === "document" ? doc.source.media_type : null, "application/pdf");
  assert.ok(doc.type === "document" && doc.source.data.length > 0);
  assert.equal(instruction.type, "text");
});

test("buildExtractionContent sends an image as a base64 image block", () => {
  const fileBuffer = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  const built = buildExtractionContent({
    documentType: "offer_letter",
    fileBuffer,
    fileName: "scan.png",
  });

  assert.ok("content" in built);
  assert.equal(built.content[0].type, "image");
});

test("buildExtractionContent inlines decoded text for text documents", () => {
  const fileBuffer = new TextEncoder().encode(
    "Employer: Cloudgrid Inc. Role: Software Engineer",
  ).buffer;
  const built = buildExtractionContent({
    documentType: "offer_letter",
    fileBuffer,
    fileName: "offer.txt",
  });

  assert.ok("content" in built);
  assert.equal(built.content.length, 1);
  assert.equal(built.content[0].type, "text");
  assert.match(built.content[0].type === "text" ? built.content[0].text : "", /Cloudgrid Inc\./);
});

test("buildExtractionContent fails fast on unreadable text documents", () => {
  const fileBuffer = new Uint8Array([0, 1, 2, 3]).buffer;
  const built = buildExtractionContent({
    documentType: "offer_letter",
    fileBuffer,
    fileName: "garbage.txt",
  });

  assert.ok("error" in built);
});

test("buildExtractionContent rejects buffers over the upload size limit before encoding", () => {
  const oversized = new ArrayBuffer(MAX_FILE_SIZE + 1);
  const built = buildExtractionContent({
    documentType: "offer_letter",
    fileBuffer: oversized,
    fileName: "huge.pdf",
  });

  assert.ok("error" in built);
  assert.match(built.error, /exceeds the \d+MB limit/);
});
