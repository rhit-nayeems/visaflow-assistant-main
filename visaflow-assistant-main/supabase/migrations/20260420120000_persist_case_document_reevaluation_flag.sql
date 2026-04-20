ALTER TABLE public.cases
ADD COLUMN needs_document_reevaluation BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.finalize_case_requirement_evaluation(
  p_case_id UUID,
  p_next_status public.case_status,
  p_requirements JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(COALESCE(p_requirements, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Requirement payload must be a JSON array.';
  END IF;

  DELETE FROM public.case_requirements
  WHERE case_id = p_case_id;

  INSERT INTO public.case_requirements (
    case_id,
    requirement_key,
    label,
    severity,
    status,
    explanation,
    source
  )
  SELECT
    p_case_id,
    requirement ->> 'requirement_key',
    requirement ->> 'label',
    COALESCE(
      (requirement ->> 'severity')::public.requirement_severity,
      'blocker'::public.requirement_severity
    ),
    COALESCE(
      (requirement ->> 'status')::public.requirement_status,
      'pending'::public.requirement_status
    ),
    NULLIF(requirement ->> 'explanation', ''),
    NULLIF(requirement ->> 'source', '')
  FROM jsonb_array_elements(COALESCE(p_requirements, '[]'::jsonb)) AS requirement;

  UPDATE public.cases
  SET
    status = p_next_status,
    needs_document_reevaluation = false
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case % was not found.', p_case_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_case_requirement_evaluation(
  UUID,
  public.case_status,
  JSONB
) TO authenticated;

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

  UPDATE public.cases
  SET needs_document_reevaluation = true
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case % was not found.', p_case_id;
  END IF;

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