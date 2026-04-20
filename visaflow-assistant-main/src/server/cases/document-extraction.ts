export const LOCAL_CASE_DOCUMENT_EXTRACTOR_ID = "local_text_pattern_stub";

export type DocumentExtractionStatus = "pending" | "processing" | "succeeded" | "failed";

export interface NormalizedExtractedFieldValue {
  confidenceScore: number | null;
  fieldName: string;
  fieldValue: string;
}

export interface SuccessfulDocumentExtractionResult {
  extractedFields: NormalizedExtractedFieldValue[];
  extractorId: typeof LOCAL_CASE_DOCUMENT_EXTRACTOR_ID;
  status: "succeeded";
}

export interface FailedDocumentExtractionResult {
  errorMessage: string;
  extractorId: typeof LOCAL_CASE_DOCUMENT_EXTRACTOR_ID;
  status: "failed";
}

export type DocumentExtractionResult =
  | SuccessfulDocumentExtractionResult
  | FailedDocumentExtractionResult;

interface ExtractDocumentInput {
  documentType: string;
  fileBuffer: ArrayBuffer;
  fileName: string;
}

interface FieldPatternDefinition {
  aliases: string[];
  fieldName: string;
  normalize?: (value: string) => string | null;
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const buildFieldAliasPattern = (aliases: string[]) =>
  aliases
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|");

const normalizeDateValue = (value: string) => {
  const trimmedValue = normalizeWhitespace(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const usDateMatch = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDateMatch) {
    const [, month, day, year] = usDateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  const year = parsedDate.getUTCFullYear();
  const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const FIELD_PATTERNS: FieldPatternDefinition[] = [
  {
    aliases: ["job duties", "duties", "responsibilities", "job description"],
    fieldName: "job_duties",
  },
  {
    aliases: ["employer name", "employer", "company"],
    fieldName: "employer_name",
  },
  {
    aliases: ["job title", "role", "position", "title"],
    fieldName: "role_title",
  },
  {
    aliases: ["work location", "location", "office location"],
    fieldName: "work_location",
  },
  {
    aliases: ["start date", "employment start date"],
    fieldName: "start_date",
    normalize: normalizeDateValue,
  },
  {
    aliases: ["end date", "employment end date"],
    fieldName: "end_date",
    normalize: normalizeDateValue,
  },
];

const extractLikelyTextFromFile = (fileBuffer: ArrayBuffer) => {
  const decodedText = new TextDecoder("utf-8", { fatal: false }).decode(fileBuffer);
  const normalizedText = decodedText.replace(/\0/g, " ");
  const printableCharacterMatches = normalizedText.match(/[A-Za-z0-9]/g) ?? [];

  return {
    hasLikelyReadableText: printableCharacterMatches.length >= 8,
    text: normalizedText,
  };
};

const normalizeExtractedFieldValue = (
  definition: FieldPatternDefinition,
  rawValue: string,
): string | null => {
  const normalizedValue = definition.normalize
    ? definition.normalize(rawValue)
    : normalizeWhitespace(rawValue);

  if (!normalizedValue) {
    return null;
  }

  return normalizeWhitespace(normalizedValue);
};

const extractNormalizedFieldsFromText = (text: string): NormalizedExtractedFieldValue[] => {
  const normalizedFields = new Map<string, NormalizedExtractedFieldValue>();

  for (const definition of FIELD_PATTERNS) {
    const aliasPattern = buildFieldAliasPattern(definition.aliases);
    const matcher = new RegExp(
      `(?:^|\\n)\\s*(?:${aliasPattern})\\s*[:\\-]\\s*([^\\n]+(?:\\n(?!\\s*[A-Za-z][A-Za-z ]{1,40}\\s*[:\\-]).+)*)`,
      "i",
    );
    const match = text.match(matcher);

    if (!match?.[1]) {
      continue;
    }

    const normalizedFieldValue = normalizeExtractedFieldValue(definition, match[1]);
    if (!normalizedFieldValue) {
      continue;
    }

    normalizedFields.set(definition.fieldName, {
      confidenceScore: 0.35,
      fieldName: definition.fieldName,
      fieldValue: normalizedFieldValue,
    });
  }

  return Array.from(normalizedFields.values());
};

const buildUnsupportedExtractionMessage = (fileName: string, documentType: string) =>
  `Local extraction failed for ${fileName} (${documentType}). This repo does not have a production OCR or document-parsing provider configured, and the local text-pattern stub could not read supported text from the uploaded file.`;

export const extractDocumentWithLocalStub = async ({
  documentType,
  fileBuffer,
  fileName,
}: ExtractDocumentInput): Promise<DocumentExtractionResult> => {
  const { hasLikelyReadableText, text } = extractLikelyTextFromFile(fileBuffer);

  if (!hasLikelyReadableText) {
    return {
      errorMessage: buildUnsupportedExtractionMessage(fileName, documentType),
      extractorId: LOCAL_CASE_DOCUMENT_EXTRACTOR_ID,
      status: "failed",
    };
  }

  return {
    extractedFields: extractNormalizedFieldsFromText(text),
    extractorId: LOCAL_CASE_DOCUMENT_EXTRACTOR_ID,
    status: "succeeded",
  };
};
