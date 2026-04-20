import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateAddCaseNoteInput,
  validateFinalizeCaseCreationAndEvaluateInput,
  validateReevaluateCaseAfterUploadsInput,
  validateRegisterUploadedCaseDocumentInput,
  validateSaveCaseDraftInput,
} from "./validation";

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
