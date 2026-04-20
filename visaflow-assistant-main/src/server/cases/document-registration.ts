import { normalizeCaseWorkflowDatabaseError } from "./database-errors.ts";

export const REGISTER_CASE_DOCUMENT_RPC = "register_case_document";

export interface RegisterCaseDocumentInput {
  caseId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  uploadRegistrationId: string;
}

export interface RegisterCaseDocumentRpcArgs {
  p_case_id: string;
  p_document_type: string;
  p_file_name: string;
  p_file_path: string;
  p_upload_registration_id: string;
}

export interface RegisteredCaseDocumentRecord {
  case_id: string;
  created_at: string;
  created_new: boolean;
  document_type: string;
  extraction_completed_at: string | null;
  extraction_error: string | null;
  extraction_started_at: string | null;
  extraction_status: string;
  file_name: string;
  file_path: string;
  id: string;
  upload_registration_id: string;
  upload_status: string;
  version_number: number;
}

interface RegisterCaseDocumentRpcErrorLike {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string;
}

interface RegisterCaseDocumentRpcSingleResponse {
  data: RegisteredCaseDocumentRecord | null;
  error: RegisterCaseDocumentRpcErrorLike | null;
}

interface RegisterCaseDocumentRpcInvocation {
  single(): PromiseLike<RegisterCaseDocumentRpcSingleResponse>;
}

export interface RegisterCaseDocumentClient {
  rpc(
    fn: typeof REGISTER_CASE_DOCUMENT_RPC,
    args: RegisterCaseDocumentRpcArgs,
  ): RegisterCaseDocumentRpcInvocation;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRegisteredCaseDocumentRecord = (value: unknown): value is RegisteredCaseDocumentRecord =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.case_id === "string" &&
  typeof value.file_name === "string" &&
  typeof value.file_path === "string" &&
  typeof value.document_type === "string" &&
  typeof value.extraction_status === "string" &&
  (typeof value.extraction_error === "string" || value.extraction_error === null) &&
  (typeof value.extraction_started_at === "string" || value.extraction_started_at === null) &&
  (typeof value.extraction_completed_at === "string" || value.extraction_completed_at === null) &&
  typeof value.upload_registration_id === "string" &&
  typeof value.upload_status === "string" &&
  typeof value.created_at === "string" &&
  typeof value.version_number === "number" &&
  typeof value.created_new === "boolean";

export const buildRegisterCaseDocumentRpcArgs = (
  input: RegisterCaseDocumentInput,
): RegisterCaseDocumentRpcArgs => ({
  p_case_id: input.caseId,
  p_document_type: input.documentType,
  p_file_name: input.fileName,
  p_file_path: input.filePath,
  p_upload_registration_id: input.uploadRegistrationId,
});

export const registerCaseDocumentRecord = async (
  supabase: RegisterCaseDocumentClient,
  input: RegisterCaseDocumentInput,
): Promise<RegisteredCaseDocumentRecord> => {
  const { data, error } = await supabase
    .rpc(REGISTER_CASE_DOCUMENT_RPC, buildRegisterCaseDocumentRpcArgs(input))
    .single();

  if (error) {
    throw normalizeCaseWorkflowDatabaseError(error, {
      operationLabel: "Document registration",
      fallbackMessage: "Unable to register the uploaded document.",
    });
  }

  if (!isRegisteredCaseDocumentRecord(data)) {
    throw new Error("Document registration returned an unexpected response.");
  }

  return data;
};
