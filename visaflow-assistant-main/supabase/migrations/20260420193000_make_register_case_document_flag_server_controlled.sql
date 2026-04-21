CREATE OR REPLACE FUNCTION public.register_case_document(
  p_case_id UUID,
  p_document_type TEXT,
  p_file_name TEXT,
  p_file_path TEXT,
  p_upload_registration_id TEXT
)
RETURNS TABLE (
  id UUID,
  case_id UUID,
  file_name TEXT,
  file_path TEXT,
  document_type TEXT,
  version_number INTEGER,
  upload_status TEXT,
  upload_registration_id TEXT,
  extraction_status TEXT,
  extraction_error TEXT,
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  created_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  existing_document public.documents%ROWTYPE;
BEGIN
  SELECT *
  INTO existing_document
  FROM public.documents
  WHERE documents.case_id = p_case_id
    AND documents.upload_registration_id = p_upload_registration_id;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      existing_document.id,
      existing_document.case_id,
      existing_document.file_name,
      existing_document.file_path,
      existing_document.document_type,
      existing_document.version_number,
      existing_document.upload_status,
      existing_document.upload_registration_id,
      existing_document.extraction_status,
      existing_document.extraction_error,
      existing_document.extraction_started_at,
      existing_document.extraction_completed_at,
      existing_document.created_at,
      false;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_case_id::text || ':' || p_document_type, 0)
  );

  SELECT *
  INTO existing_document
  FROM public.documents
  WHERE documents.case_id = p_case_id
    AND documents.upload_registration_id = p_upload_registration_id;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      existing_document.id,
      existing_document.case_id,
      existing_document.file_name,
      existing_document.file_path,
      existing_document.document_type,
      existing_document.version_number,
      existing_document.upload_status,
      existing_document.upload_registration_id,
      existing_document.extraction_status,
      existing_document.extraction_error,
      existing_document.extraction_started_at,
      existing_document.extraction_completed_at,
      existing_document.created_at,
      false;
    RETURN;
  END IF;

  INSERT INTO public.documents (
    case_id,
    file_name,
    file_path,
    document_type,
    version_number,
    upload_status,
    upload_registration_id
  )
  VALUES (
    p_case_id,
    p_file_name,
    p_file_path,
    p_document_type,
    COALESCE(
      (
        SELECT MAX(documents.version_number)
        FROM public.documents
        WHERE documents.case_id = p_case_id
          AND documents.document_type = p_document_type
      ),
      0
    ) + 1,
    'uploaded',
    p_upload_registration_id
  )
  RETURNING * INTO existing_document;

  RETURN QUERY
  SELECT
    existing_document.id,
    existing_document.case_id,
    existing_document.file_name,
    existing_document.file_path,
    existing_document.document_type,
    existing_document.version_number,
    existing_document.upload_status,
    existing_document.upload_registration_id,
    existing_document.extraction_status,
    existing_document.extraction_error,
    existing_document.extraction_started_at,
    existing_document.extraction_completed_at,
    existing_document.created_at,
    true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_case_document(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO authenticated;
