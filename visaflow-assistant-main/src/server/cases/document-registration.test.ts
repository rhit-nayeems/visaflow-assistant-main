import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRegisterCaseDocumentRpcArgs,
  registerCaseDocumentRecord,
  REGISTER_CASE_DOCUMENT_RPC,
  type RegisterCaseDocumentClient,
  type RegisterCaseDocumentInput,
  type RegisterCaseDocumentRpcArgs,
  type RegisteredCaseDocumentRecord,
} from "./document-registration.ts";

const buildRegisterDocumentInput = (uploadRegistrationId: string): RegisterCaseDocumentInput => ({
  caseId: "case-123",
  documentType: "offer_letter",
  fileName: "offer-letter.pdf",
  filePath: `user-1/case-123/${uploadRegistrationId}/offer-letter.pdf`,
  uploadRegistrationId,
});

const buildRegisteredDocument = (
  args: RegisterCaseDocumentRpcArgs,
  versionNumber: number,
  createdNew: boolean,
  id: string,
): RegisteredCaseDocumentRecord => ({
  id,
  case_id: args.p_case_id,
  file_name: args.p_file_name,
  file_path: args.p_file_path,
  document_type: args.p_document_type,
  version_number: versionNumber,
  upload_status: "uploaded",
  upload_registration_id: args.p_upload_registration_id,
  created_at: "2026-04-19T00:00:00.000Z",
  created_new: createdNew,
});

const buildStatefulRegisterCaseDocumentClient = () => {
  const documentsByRegistrationId = new Map<string, RegisteredCaseDocumentRecord>();
  const rpcCalls: Array<{ args: RegisterCaseDocumentRpcArgs; fn: string }> = [];
  let nextDocumentNumber = 1;
  let nextVersionNumber = 1;

  const client: RegisterCaseDocumentClient = {
    rpc(fn, args) {
      rpcCalls.push({ fn, args });

      return {
        async single() {
          const existingDocument = documentsByRegistrationId.get(args.p_upload_registration_id);

          if (existingDocument) {
            return {
              data: {
                ...existingDocument,
                created_new: false,
              },
              error: null,
            };
          }

          const nextDocument = buildRegisteredDocument(
            args,
            nextVersionNumber,
            true,
            `doc-${nextDocumentNumber}`,
          );

          nextDocumentNumber += 1;
          nextVersionNumber += 1;
          documentsByRegistrationId.set(args.p_upload_registration_id, nextDocument);

          return {
            data: nextDocument,
            error: null,
          };
        },
      };
    },
  };

  return {
    client,
    documentsByRegistrationId,
    rpcCalls,
  };
};

test("retry with the same uploadRegistrationId returns the same document without a duplicate", async () => {
  const registerClient = buildStatefulRegisterCaseDocumentClient();
  const input = buildRegisterDocumentInput("upload-1");

  const firstAttempt = await registerCaseDocumentRecord(registerClient.client, input);
  const retryAttempt = await registerCaseDocumentRecord(registerClient.client, input);

  assert.equal(firstAttempt.id, "doc-1");
  assert.equal(firstAttempt.version_number, 1);
  assert.equal(firstAttempt.created_new, true);
  assert.equal(retryAttempt.id, firstAttempt.id);
  assert.equal(retryAttempt.version_number, firstAttempt.version_number);
  assert.equal(retryAttempt.created_new, false);
  assert.equal(registerClient.documentsByRegistrationId.size, 1);
});

test("intentional re-upload with a new uploadRegistrationId returns a new row and version", async () => {
  const registerClient = buildStatefulRegisterCaseDocumentClient();

  const firstUpload = await registerCaseDocumentRecord(
    registerClient.client,
    buildRegisterDocumentInput("upload-1"),
  );
  const secondUpload = await registerCaseDocumentRecord(
    registerClient.client,
    buildRegisterDocumentInput("upload-2"),
  );

  assert.equal(firstUpload.id, "doc-1");
  assert.equal(firstUpload.version_number, 1);
  assert.equal(secondUpload.id, "doc-2");
  assert.equal(secondUpload.version_number, 2);
  assert.equal(secondUpload.created_new, true);
  assert.equal(registerClient.documentsByRegistrationId.size, 2);
});

test("document registration delegates version allocation to the DB RPC", async () => {
  const input = buildRegisterDocumentInput("upload-3");
  const rpcCalls: Array<{ args: RegisterCaseDocumentRpcArgs; fn: string }> = [];

  const client: RegisterCaseDocumentClient = {
    rpc(fn, args) {
      rpcCalls.push({ fn, args });

      return {
        async single() {
          return {
            data: buildRegisteredDocument(args, 4, true, "doc-9"),
            error: null,
          };
        },
      };
    },
  };

  const registeredDocument = await registerCaseDocumentRecord(client, input);

  assert.equal(registeredDocument.version_number, 4);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]?.fn, REGISTER_CASE_DOCUMENT_RPC);
  assert.deepEqual(rpcCalls[0]?.args, buildRegisterCaseDocumentRpcArgs(input));
});

test("unexpected RPC payloads fail clearly", async () => {
  const client: RegisterCaseDocumentClient = {
    rpc() {
      return {
        async single() {
          return {
            data: null,
            error: null,
          };
        },
      };
    },
  };

  await assert.rejects(
    () => registerCaseDocumentRecord(client, buildRegisterDocumentInput("upload-4")),
    /unexpected response/i,
  );
});
