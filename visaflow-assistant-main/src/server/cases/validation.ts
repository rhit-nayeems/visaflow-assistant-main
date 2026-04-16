const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface SaveCaseDraftInput {
  caseId?: string;
  draftId?: string;
  schoolId: string;
  schoolTemplateId: string | null;
  employerName: string | null;
  roleTitle: string | null;
  workLocation: string | null;
  startDate: string | null;
  endDate: string | null;
  caseSummary: string | null;
}

export interface RegisterUploadedCaseDocumentInput {
  caseId: string;
  fileName: string;
  filePath: string;
  documentType: string;
  uploadRegistrationId: string;
}

export interface FinalizeCaseCreationAndEvaluateInput {
  caseId: string;
}

export interface AddCaseNoteInput {
  caseId: string;
  noteId?: string;
  content: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseRequiredString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
};

const parseOptionalString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined => {
  const value = record[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
};

const parseNullableString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | null => {
  const value = record[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseNullableDate = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | null => {
  const normalized = parseNullableString(record, key, label);

  if (normalized !== null && !DATE_ONLY_PATTERN.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  return normalized;
};

export const validateSaveCaseDraftInput = (input: unknown): SaveCaseDraftInput => {
  if (!isRecord(input)) {
    throw new Error("Case draft input is required.");
  }

  return {
    caseId: parseOptionalString(input, "caseId", "Case ID"),
    draftId: parseOptionalString(input, "draftId", "Draft ID"),
    schoolId: parseRequiredString(input, "schoolId", "School"),
    schoolTemplateId: parseNullableString(input, "schoolTemplateId", "School template"),
    employerName: parseNullableString(input, "employerName", "Employer name"),
    roleTitle: parseNullableString(input, "roleTitle", "Role title"),
    workLocation: parseNullableString(input, "workLocation", "Work location"),
    startDate: parseNullableDate(input, "startDate", "Start date"),
    endDate: parseNullableDate(input, "endDate", "End date"),
    caseSummary: parseNullableString(input, "caseSummary", "Case summary"),
  };
};

export const validateRegisterUploadedCaseDocumentInput = (
  input: unknown,
): RegisterUploadedCaseDocumentInput => {
  if (!isRecord(input)) {
    throw new Error("Uploaded document details are required.");
  }

  return {
    caseId: parseRequiredString(input, "caseId", "Case"),
    fileName: parseRequiredString(input, "fileName", "File name"),
    filePath: parseRequiredString(input, "filePath", "File path"),
    documentType: parseRequiredString(input, "documentType", "Document type"),
    uploadRegistrationId: parseRequiredString(
      input,
      "uploadRegistrationId",
      "Upload registration ID",
    ),
  };
};

export const validateFinalizeCaseCreationAndEvaluateInput = (
  input: unknown,
): FinalizeCaseCreationAndEvaluateInput => {
  if (!isRecord(input)) {
    throw new Error("Case finalization input is required.");
  }

  return {
    caseId: parseRequiredString(input, "caseId", "Case"),
  };
};

export const validateAddCaseNoteInput = (input: unknown): AddCaseNoteInput => {
  if (!isRecord(input)) {
    throw new Error("Case note input is required.");
  }

  return {
    caseId: parseRequiredString(input, "caseId", "Case"),
    noteId: parseOptionalString(input, "noteId", "Note ID"),
    content: parseRequiredString(input, "content", "Note"),
  };
};

