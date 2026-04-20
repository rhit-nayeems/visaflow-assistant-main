import type { Tables } from "../../integrations/supabase/types.ts";

type DocumentRecord = Tables<"documents">;
type DocumentExtractionStatus = DocumentRecord["extraction_status"];

export const STALE_DOCUMENT_EXTRACTION_THRESHOLD_MS = 10 * 60 * 1000;
export const STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES =
  STALE_DOCUMENT_EXTRACTION_THRESHOLD_MS / (60 * 1000);

const parseExtractionStartedAt = (extractionStartedAt: string | null) => {
  if (!extractionStartedAt) {
    return null;
  }

  const startedAtTimestamp = Date.parse(extractionStartedAt);

  return Number.isNaN(startedAtTimestamp) ? null : startedAtTimestamp;
};

export const hasUnresolvedDocumentExtraction = (status: DocumentExtractionStatus) =>
  status === "pending" || status === "processing" || status === "failed";

export const isStaleDocumentExtractionProcessing = (
  extractionStartedAt: string | null,
  now = Date.now(),
) => {
  const startedAtTimestamp = parseExtractionStartedAt(extractionStartedAt);

  if (startedAtTimestamp === null) {
    return false;
  }

  return now - startedAtTimestamp >= STALE_DOCUMENT_EXTRACTION_THRESHOLD_MS;
};

export const canRetryDocumentExtraction = (
  document: Pick<DocumentRecord, "extraction_started_at" | "extraction_status">,
  now = Date.now(),
) => {
  if (document.extraction_status === "pending" || document.extraction_status === "failed") {
    return true;
  }

  if (document.extraction_status !== "processing") {
    return false;
  }

  return isStaleDocumentExtractionProcessing(document.extraction_started_at, now);
};
