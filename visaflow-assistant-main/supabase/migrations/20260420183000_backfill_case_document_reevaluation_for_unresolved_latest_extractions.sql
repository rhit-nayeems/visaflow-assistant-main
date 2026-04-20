WITH latest_documents AS (
  SELECT DISTINCT ON (documents.case_id, documents.document_type)
    documents.case_id,
    documents.document_type,
    documents.extraction_status
  FROM public.documents
  ORDER BY
    documents.case_id,
    documents.document_type,
    documents.version_number DESC,
    documents.created_at DESC,
    documents.id DESC
),
cases_requiring_reevaluation AS (
  SELECT DISTINCT latest_documents.case_id
  FROM latest_documents
  WHERE latest_documents.extraction_status IN ('pending', 'processing', 'failed')
)
UPDATE public.cases AS cases
SET needs_document_reevaluation = true
FROM cases_requiring_reevaluation
WHERE cases.id = cases_requiring_reevaluation.case_id
  AND cases.needs_document_reevaluation = false;
