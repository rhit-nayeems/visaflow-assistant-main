import type { CaseNoteRecord, CaseRecord, CaseWorkflowContext } from "./types";

export const findOwnedCase = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<CaseRecord | null> => {
  const { data, error } = await context.supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const loadOwnedCase = async (
  context: CaseWorkflowContext,
  caseId: string,
): Promise<CaseRecord> => {
  const data = await findOwnedCase(context, caseId);

  if (!data) {
    throw new Error("Case not found or you do not have access.");
  }

  return data;
};

export const findOwnedCaseNote = async (
  context: CaseWorkflowContext,
  caseId: string,
  noteId: string,
): Promise<CaseNoteRecord | null> => {
  const { data, error } = await context.supabase
    .from("case_notes")
    .select("*")
    .eq("id", noteId)
    .eq("case_id", caseId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
