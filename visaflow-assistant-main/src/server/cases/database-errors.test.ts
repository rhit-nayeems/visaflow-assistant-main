import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCaseWorkflowSchemaDriftMessage,
  isCaseWorkflowSchemaDriftError,
  normalizeCaseWorkflowDatabaseError,
} from "./database-errors.ts";

test("maps missing RPC errors to an actionable migration message", () => {
  const normalized = normalizeCaseWorkflowDatabaseError(
    {
      code: "PGRST202",
      message: "Could not find the function public.register_case_document",
    },
    {
      operationLabel: "Document registration",
      fallbackMessage: "Unable to register the uploaded document.",
    },
  );

  assert.equal(normalized.message, formatCaseWorkflowSchemaDriftMessage("Document registration"));
});

test("maps missing reviewer decision RPC errors to an actionable migration message", () => {
  const normalized = normalizeCaseWorkflowDatabaseError(
    {
      code: "PGRST202",
      message:
        "Could not find the function public.apply_reviewer_case_decision(p_case_id, p_next_status, p_reviewer_comment) in the schema cache",
    },
    {
      operationLabel: "Case review",
      fallbackMessage: "Unable to update this case.",
    },
  );

  assert.equal(normalized.message, formatCaseWorkflowSchemaDriftMessage("Case review"));
});

test("treats missing upload_registration_id column errors as schema drift", () => {
  const error = {
    code: "42703",
    message: 'column "upload_registration_id" does not exist',
  };

  assert.equal(isCaseWorkflowSchemaDriftError(error), true);

  const normalized = normalizeCaseWorkflowDatabaseError(error, {
    operationLabel: "Case finalization",
    fallbackMessage: "Unable to finalize this case.",
  });

  assert.equal(normalized.message, formatCaseWorkflowSchemaDriftMessage("Case finalization"));
});

test("treats missing needs_document_reevaluation column errors as schema drift", () => {
  const error = {
    code: "42703",
    message: 'column "needs_document_reevaluation" does not exist',
  };

  assert.equal(isCaseWorkflowSchemaDriftError(error), true);

  const normalized = normalizeCaseWorkflowDatabaseError(error, {
    operationLabel: "Case access",
    fallbackMessage: "Unable to load this case.",
  });

  assert.equal(normalized.message, formatCaseWorkflowSchemaDriftMessage("Case access"));
});

test("treats PostgREST schema-cache misses for needs_document_reevaluation as schema drift", () => {
  const error = {
    code: "PGRST204",
    message:
      "Could not find the 'needs_document_reevaluation' column of 'cases' in the schema cache",
  };

  assert.equal(isCaseWorkflowSchemaDriftError(error), true);

  const normalized = normalizeCaseWorkflowDatabaseError(error, {
    operationLabel: "Case access",
    fallbackMessage: "Unable to load this case.",
  });

  assert.equal(normalized.message, formatCaseWorkflowSchemaDriftMessage("Case access"));
});

test("does not treat unrelated PostgREST schema-cache misses as schema drift", () => {
  const error = {
    code: "PGRST204",
    message: "Could not find the 'status' column of 'cases' in the schema cache",
  };

  assert.equal(isCaseWorkflowSchemaDriftError(error), false);

  const normalized = normalizeCaseWorkflowDatabaseError(error, {
    operationLabel: "Case access",
    fallbackMessage: "Unable to load this case.",
  });

  assert.equal(
    normalized.message,
    "Could not find the 'status' column of 'cases' in the schema cache",
  );
});

test("preserves non-schema-drift database messages", () => {
  const normalized = normalizeCaseWorkflowDatabaseError(
    {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
    {
      operationLabel: "Document registration",
      fallbackMessage: "Unable to register the uploaded document.",
    },
  );

  assert.equal(normalized.message, "duplicate key value violates unique constraint");
});

test("does not treat duplicate upload registration conflicts as schema drift", () => {
  const error = {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "documents_case_upload_registration_id_key"',
    details:
      "Key (case_id, upload_registration_id)=(11111111-1111-1111-1111-111111111111, upload-123) already exists.",
  };

  assert.equal(isCaseWorkflowSchemaDriftError(error), false);

  const normalized = normalizeCaseWorkflowDatabaseError(error, {
    operationLabel: "Document registration",
    fallbackMessage: "Unable to register the uploaded document.",
  });

  assert.equal(
    normalized.message,
    'duplicate key value violates unique constraint "documents_case_upload_registration_id_key"',
  );
});
