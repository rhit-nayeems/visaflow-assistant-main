import { MAX_FILE_SIZE } from "../../lib/constants.ts";
import {
  LOCAL_CASE_DOCUMENT_EXTRACTOR_ID,
  extractDocumentWithLocalStub,
  type DocumentExtractionResult,
  type NormalizedExtractedFieldValue,
} from "./document-extraction.ts";

/**
 * Document extraction is pluggable. The default provider is the dependency-free local
 * text-pattern stub; when an ANTHROPIC_API_KEY is configured, extraction is delegated to
 * Claude via the Messages API (tool use forces structured field output). The selection is
 * environment-driven, so no key in the environment === unchanged stub behavior.
 */
export interface DocumentExtractionInput {
  documentType: string;
  fileBuffer: ArrayBuffer;
  fileName: string;
}

export interface DocumentExtractionProvider {
  id: string;
  extract: (input: DocumentExtractionInput) => Promise<DocumentExtractionResult>;
}

export const CLAUDE_DOCUMENT_EXTRACTOR_ID = "anthropic_messages_tool_extraction";

// Cheap, fast model appropriate for field extraction. Override with ANTHROPIC_EXTRACTION_MODEL.
const DEFAULT_EXTRACTION_MODEL = "claude-haiku-4-5";
const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_DOCUMENT_TEXT_CHARS = 20000;
const MIN_READABLE_CHARS = 8;
const CLAUDE_EXTRACTION_CONFIDENCE = 0.9;
const EXTRACTION_TOOL_NAME = "record_cpt_document_fields";

// CPT supporting documents are most often PDFs and scans/photos of offer letters. Those are
// sent to Claude as native document/image content blocks (vision/PDF parsing) rather than being
// decoded as UTF-8 text, which would only produce garbage for binary formats.
const IMAGE_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const PDF_MEDIA_TYPE = "application/pdf";

export type ExtractionMediaKind = "pdf" | "image" | "text";

export interface ExtractionMedia {
  kind: ExtractionMediaKind;
  /** The Anthropic content-block media_type for pdf/image kinds; undefined for text. */
  mediaType?: string;
}

// Mirrors the field names the deterministic requirements engine understands.
const CLAUDE_EXTRACTION_FIELD_NAMES = [
  "employer_name",
  "role_title",
  "work_location",
  "job_duties",
  "start_date",
  "end_date",
] as const;

const EXTRACTION_TOOL = {
  name: EXTRACTION_TOOL_NAME,
  description:
    "Record the CPT-relevant fields found in the document text. Omit any field that is not present in the document.",
  input_schema: {
    type: "object",
    properties: {
      employer_name: { type: "string", description: "Employer or company name" },
      role_title: { type: "string", description: "Job title or role" },
      work_location: { type: "string", description: "Work location, e.g. city and state" },
      job_duties: { type: "string", description: "Summary of the job duties or responsibilities" },
      start_date: { type: "string", description: "Employment start date in YYYY-MM-DD format" },
      end_date: { type: "string", description: "Employment end date in YYYY-MM-DD format" },
    },
    additionalProperties: false,
  },
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

interface ClaudeToolUseBlock {
  type: "tool_use";
  name: string;
  input: Record<string, unknown>;
}

const isToolUseBlock = (value: unknown): value is ClaudeToolUseBlock =>
  isRecord(value) &&
  value.type === "tool_use" &&
  typeof value.name === "string" &&
  isRecord(value.input);

/**
 * Convert the Claude tool-call input into the normalized extracted-field shape, keeping only
 * supported, non-empty string fields. Pure and unit-tested.
 */
export function mapClaudeFieldsToExtracted(
  input: Record<string, unknown>,
): NormalizedExtractedFieldValue[] {
  const extractedFields: NormalizedExtractedFieldValue[] = [];

  for (const fieldName of CLAUDE_EXTRACTION_FIELD_NAMES) {
    const rawValue = input[fieldName];
    if (typeof rawValue !== "string") {
      continue;
    }

    const fieldValue = rawValue.replace(/\s+/g, " ").trim();
    if (fieldValue.length === 0) {
      continue;
    }

    extractedFields.push({
      confidenceScore: CLAUDE_EXTRACTION_CONFIDENCE,
      fieldName,
      fieldValue,
    });
  }

  return extractedFields;
}

/**
 * Decide how a document should be handed to Claude based on its file extension. PDFs and the
 * supported image types are sent as native content blocks; everything else falls back to the
 * decoded-text path. Pure and unit-tested.
 */
export function detectExtractionMedia(fileName: string): ExtractionMedia {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    return { kind: "pdf", mediaType: PDF_MEDIA_TYPE };
  }

  const imageMediaType = IMAGE_MEDIA_TYPES[extension];
  if (imageMediaType) {
    return { kind: "image", mediaType: imageMediaType };
  }

  return { kind: "text" };
}

const arrayBufferToBase64 = (fileBuffer: ArrayBuffer) => Buffer.from(fileBuffer).toString("base64");

const decodeReadableText = (fileBuffer: ArrayBuffer) =>
  new TextDecoder("utf-8", { fatal: false }).decode(fileBuffer).replace(/\0/g, " ");

const extractionInstruction = (documentType: string, fileName: string) =>
  `Extract the CPT-relevant fields from this ${documentType} document (${fileName}). ` +
  `Use the ${EXTRACTION_TOOL_NAME} tool, format dates as YYYY-MM-DD, and omit any field you cannot find.`;

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

/**
 * Build the Claude user-message content for a document. Returns the content blocks to send, or a
 * failure message when a text document has too little readable content to be worth a request.
 * Pure and unit-tested.
 */
export function buildExtractionContent(
  input: DocumentExtractionInput,
): { content: ClaudeContentBlock[] } | { error: string } {
  const { documentType, fileBuffer, fileName } = input;

  // Defense-in-depth: the client caps uploads at MAX_FILE_SIZE, but the server function must not
  // trust that. Reject before base64-encoding so an oversized buffer can't blow up Worker memory
  // or the request body sent to Claude.
  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    const maxMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
    return {
      error: `Claude extraction skipped: ${fileName} (${documentType}) exceeds the ${maxMb}MB limit.`,
    };
  }

  const media = detectExtractionMedia(fileName);
  const instruction = extractionInstruction(documentType, fileName);

  if (media.kind === "pdf" || media.kind === "image") {
    return {
      content: [
        {
          type: media.kind === "pdf" ? "document" : "image",
          source: {
            type: "base64",
            media_type: media.mediaType as string,
            data: arrayBufferToBase64(fileBuffer),
          },
        },
        { type: "text", text: instruction },
      ],
    };
  }

  const text = decodeReadableText(fileBuffer);
  const readableCharacters = text.match(/[A-Za-z0-9]/g)?.length ?? 0;
  if (readableCharacters < MIN_READABLE_CHARS) {
    return {
      error: `Claude extraction could not read supported text from ${fileName} (${documentType}).`,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `${instruction}\n\n--- DOCUMENT (${fileName}) ---\n${text.slice(0, MAX_DOCUMENT_TEXT_CHARS)}`,
      },
    ],
  };
}

const failedResult = (errorMessage: string): DocumentExtractionResult => ({
  errorMessage,
  extractorId: CLAUDE_DOCUMENT_EXTRACTOR_ID,
  status: "failed",
});

const readResponseTextSafely = async (response: Response): Promise<string> => {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
};

export function createClaudeDocumentExtractionProvider(config: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): DocumentExtractionProvider {
  const model = config.model?.trim() || DEFAULT_EXTRACTION_MODEL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    id: CLAUDE_DOCUMENT_EXTRACTOR_ID,
    extract: async (input) => {
      const built = buildExtractionContent(input);
      if ("error" in built) {
        return failedResult(built.error);
      }

      try {
        const response = await fetchImpl(ANTHROPIC_MESSAGES_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            tools: [EXTRACTION_TOOL],
            tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
            messages: [{ role: "user", content: built.content }],
          }),
        });

        if (!response.ok) {
          const detail = await readResponseTextSafely(response);
          return failedResult(
            `Claude extraction request failed (HTTP ${response.status}). ${detail}`.trim(),
          );
        }

        const data: unknown = await response.json();
        const content = isRecord(data) && Array.isArray(data.content) ? data.content : [];
        const toolUseBlock = content.find(isToolUseBlock);

        if (!toolUseBlock || toolUseBlock.name !== EXTRACTION_TOOL_NAME) {
          return failedResult("Claude extraction returned no structured fields for this document.");
        }

        return {
          extractedFields: mapClaudeFieldsToExtracted(toolUseBlock.input),
          extractorId: CLAUDE_DOCUMENT_EXTRACTOR_ID,
          status: "succeeded",
        };
      } catch (error) {
        return failedResult(
          error instanceof Error
            ? `Claude extraction error: ${error.message}`
            : "Claude extraction failed unexpectedly.",
        );
      }
    },
  };
}

export const localStubProvider: DocumentExtractionProvider = {
  id: LOCAL_CASE_DOCUMENT_EXTRACTOR_ID,
  extract: (input) => extractDocumentWithLocalStub(input),
};

/** Pure provider selection: Claude when an API key is present, otherwise the local stub. */
export function selectDocumentExtractionProvider(config: {
  apiKey?: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
}): DocumentExtractionProvider {
  const apiKey = config.apiKey?.trim();
  if (apiKey) {
    return createClaudeDocumentExtractionProvider({
      apiKey,
      model: config.model,
      fetchImpl: config.fetchImpl,
    });
  }
  return localStubProvider;
}

export function getDocumentExtractionProvider(): DocumentExtractionProvider {
  return selectDocumentExtractionProvider({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_EXTRACTION_MODEL,
  });
}

/** Extract a case document using the configured provider (Claude if keyed, else local stub). */
export function extractCaseDocument(
  input: DocumentExtractionInput,
): Promise<DocumentExtractionResult> {
  return getDocumentExtractionProvider().extract(input);
}
