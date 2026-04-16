ALTER TABLE public.documents
ADD COLUMN upload_registration_id TEXT;

UPDATE public.documents
SET upload_registration_id = id::text
WHERE upload_registration_id IS NULL;

ALTER TABLE public.documents
ALTER COLUMN upload_registration_id SET NOT NULL;

CREATE UNIQUE INDEX documents_case_upload_registration_id_key
  ON public.documents (case_id, upload_registration_id);

CREATE INDEX idx_documents_case_type_version
  ON public.documents (case_id, document_type, version_number DESC);

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
  SET status = p_next_status
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
