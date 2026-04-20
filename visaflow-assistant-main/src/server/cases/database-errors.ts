const REQUIRED_CASE_WORKFLOW_MIGRATIONS = [
  "20260416103000_fix_case_finalize_atomicity_and_document_registration.sql",
  "20260419113000_register_case_document_rpc.sql",
] as const;

const CASE_WORKFLOW_SCHEMA_DRIFT_CODES = new Set(["PGRST202", "42883", "42703", "42P01", "42704"]);

export interface CaseWorkflowDatabaseErrorLike {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string;
}

interface NormalizeCaseWorkflowDatabaseErrorOptions {
  fallbackMessage: string;
  operationLabel: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isDatabaseErrorLike = (value: unknown): value is CaseWorkflowDatabaseErrorLike =>
  isRecord(value) && typeof value.message === "string";

const buildDatabaseErrorText = (error: CaseWorkflowDatabaseErrorLike) =>
  [error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();

export const isCaseWorkflowSchemaDriftError = (
  error: unknown,
): error is CaseWorkflowDatabaseErrorLike => {
  if (!isDatabaseErrorLike(error)) {
    return false;
  }

  if (typeof error.code === "string" && CASE_WORKFLOW_SCHEMA_DRIFT_CODES.has(error.code)) {
    return true;
  }

  const databaseErrorText = buildDatabaseErrorText(error);

  return (
    databaseErrorText.includes(
      "could not find the function public.finalize_case_requirement_evaluation",
    ) ||
    databaseErrorText.includes("could not find the function public.register_case_document") ||
    databaseErrorText.includes("finalize_case_requirement_evaluation") ||
    databaseErrorText.includes("register_case_document") ||
    databaseErrorText.includes('column "upload_registration_id" does not exist') ||
    databaseErrorText.includes("column upload_registration_id does not exist") ||
    databaseErrorText.includes('has no field "upload_registration_id"')
  );
};

export const formatCaseWorkflowSchemaDriftMessage = (operationLabel: string) =>
  `${operationLabel} is unavailable because the database schema is behind the app code. Apply the latest Supabase case-workflow migrations (${REQUIRED_CASE_WORKFLOW_MIGRATIONS.join(", ")}) and retry.`;

export const normalizeCaseWorkflowDatabaseError = (
  error: unknown,
  options: NormalizeCaseWorkflowDatabaseErrorOptions,
): Error => {
  if (isCaseWorkflowSchemaDriftError(error)) {
    return new Error(formatCaseWorkflowSchemaDriftMessage(options.operationLabel));
  }

  if (error instanceof Error) {
    return error;
  }

  if (isDatabaseErrorLike(error)) {
    return new Error(error.message);
  }

  return new Error(options.fallbackMessage);
};
