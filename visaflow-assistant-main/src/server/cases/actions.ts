import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateAddCaseNoteInput,
  validateApproveCaseInput,
  validateDenyCaseInput,
  validateFinalizeCaseCreationAndEvaluateInput,
  validateLoadReviewerCaseDetailInput,
  validateReevaluateCaseAfterUploadsInput,
  validateRegisterUploadedCaseDocumentInput,
  validateRetryCaseDocumentExtractionInput,
  validateRequestCaseChangesInput,
  validateSaveManualExtractedFieldsInput,
  validateSaveCaseDraftInput,
  validateSubmitCaseForReviewInput,
} from "./validation";

export const listReviewerCasesAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { listReviewerCases } = await import("./reviewer-read.server");

    return listReviewerCases({
      supabase: context.supabase,
      userId: context.userId,
    });
  });

export const loadReviewerCaseDetailAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateLoadReviewerCaseDetailInput)
  .handler(async ({ context, data }) => {
    const { loadReviewerCaseDetail } = await import("./reviewer-read.server");

    return loadReviewerCaseDetail(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data.caseId,
    );
  });

export const saveCaseDraftAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSaveCaseDraftInput)
  .handler(async ({ context, data }) => {
    const { saveCaseDraft } = await import("./workflows.server");

    return saveCaseDraft(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const registerUploadedCaseDocumentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRegisterUploadedCaseDocumentInput)
  .handler(async ({ context, data }) => {
    const { registerUploadedCaseDocument } = await import("./workflows.server");

    return registerUploadedCaseDocument(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const finalizeCaseCreationAndEvaluateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateFinalizeCaseCreationAndEvaluateInput)
  .handler(async ({ context, data }) => {
    const { finalizeCaseCreationAndEvaluate } = await import("./workflows.server");

    return finalizeCaseCreationAndEvaluate(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const reevaluateCaseAfterUploadsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateReevaluateCaseAfterUploadsInput)
  .handler(async ({ context, data }) => {
    const { reevaluateCaseAfterUploads } = await import("./workflows.server");

    return reevaluateCaseAfterUploads(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const retryCaseDocumentExtractionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRetryCaseDocumentExtractionInput)
  .handler(async ({ context, data }) => {
    const { retryCaseDocumentExtraction } = await import("./workflows.server");

    return retryCaseDocumentExtraction(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const saveManualExtractedFieldsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSaveManualExtractedFieldsInput)
  .handler(async ({ context, data }) => {
    const { saveManualExtractedFields } = await import("./workflows.server");

    return saveManualExtractedFields(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const submitCaseForReviewAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSubmitCaseForReviewInput)
  .handler(async ({ context, data }) => {
    const { submitCaseForReview } = await import("./workflows.server");

    return submitCaseForReview(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const approveCaseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateApproveCaseInput)
  .handler(async ({ context, data }) => {
    const { approveCase } = await import("./workflows.server");

    return approveCase(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const denyCaseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDenyCaseInput)
  .handler(async ({ context, data }) => {
    const { denyCase } = await import("./workflows.server");

    return denyCase(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const requestCaseChangesAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRequestCaseChangesInput)
  .handler(async ({ context, data }) => {
    const { requestCaseChanges } = await import("./workflows.server");

    return requestCaseChanges(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });

export const addCaseNoteAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateAddCaseNoteInput)
  .handler(async ({ context, data }) => {
    const { addCaseNote } = await import("./workflows.server");

    return addCaseNote(
      {
        supabase: context.supabase,
        userId: context.userId,
      },
      data,
    );
  });
