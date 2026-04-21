CREATE OR REPLACE FUNCTION public.apply_manual_extracted_field_review(
  p_case_id UUID,
  p_field_changes JSONB,
  p_reviewed_at TIMESTAMPTZ,
  p_next_status public.case_status,
  p_requirements JSONB DEFAULT '[]'::jsonb,
  p_needs_document_reevaluation BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  normalized_field_changes JSONB := COALESCE(p_field_changes, '[]'::jsonb);
  field_change JSONB;
  existing_field_id UUID;
  next_field_value TEXT;
  target_document public.documents%ROWTYPE;
  touched_document_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF jsonb_typeof(normalized_field_changes) <> 'array' THEN
    RAISE EXCEPTION 'Manual field change payload must be a JSON array.';
  END IF;

  IF jsonb_array_length(normalized_field_changes) = 0 THEN
    RAISE EXCEPTION 'At least one extracted field edit is required.';
  END IF;

  IF p_reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Reviewed timestamp is required.';
  END IF;

  FOR field_change IN
    SELECT value
    FROM jsonb_array_elements(normalized_field_changes) AS value
  LOOP
    IF jsonb_typeof(field_change) <> 'object' THEN
      RAISE EXCEPTION 'Each manual field change must be an object.';
    END IF;

    IF NULLIF(BTRIM(field_change ->> 'document_id'), '') IS NULL THEN
      RAISE EXCEPTION 'Each manual field change must include a document_id.';
    END IF;

    IF NULLIF(BTRIM(field_change ->> 'field_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Each manual field change must include a field_name.';
    END IF;

    SELECT *
    INTO target_document
    FROM public.documents
    WHERE documents.id = (field_change ->> 'document_id')::UUID
      AND documents.case_id = p_case_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Document not found or you do not have access.';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_case_id::text || ':' || target_document.document_type, 0)
    );

    SELECT *
    INTO target_document
    FROM public.documents
    WHERE documents.id = target_document.id
      AND documents.case_id = p_case_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.documents AS newer_document
      WHERE newer_document.case_id = p_case_id
        AND newer_document.document_type = target_document.document_type
        AND (
          newer_document.version_number > target_document.version_number
          OR (
            newer_document.version_number = target_document.version_number
            AND newer_document.created_at > target_document.created_at
          )
          OR (
            newer_document.version_number = target_document.version_number
            AND newer_document.created_at = target_document.created_at
            AND newer_document.id > target_document.id
          )
        )
    ) THEN
      RAISE EXCEPTION
        'Only blocker-level extracted fields from the latest relevant document versions can be edited.';
    END IF;

    IF target_document.extraction_status = 'processing'
      AND (
        target_document.extraction_started_at IS NULL
        OR target_document.extraction_started_at > (NOW() - INTERVAL '10 minutes')
      )
    THEN
      RAISE EXCEPTION
        'Wait for % extraction to finish before editing its extracted fields.',
        INITCAP(REPLACE(target_document.document_type, '_', ' '));
    END IF;

    existing_field_id := NULLIF(BTRIM(COALESCE(field_change ->> 'existing_field_id', '')), '')::UUID;
    next_field_value := CASE
      WHEN field_change ? 'field_value' AND jsonb_typeof(field_change -> 'field_value') <> 'null'
        THEN field_change ->> 'field_value'
      ELSE NULL
    END;

    IF existing_field_id IS NULL AND next_field_value IS NULL THEN
      RAISE EXCEPTION 'A new manual extracted field requires a value.';
    END IF;

    IF existing_field_id IS NOT NULL THEN
      UPDATE public.extracted_fields
      SET
        confidence_score = NULL,
        field_value = next_field_value,
        manually_corrected = true
      WHERE extracted_fields.id = existing_field_id
        AND extracted_fields.document_id = target_document.id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Unable to save the reviewed extracted field.';
      END IF;
    ELSE
      INSERT INTO public.extracted_fields (
        document_id,
        field_name,
        field_value,
        confidence_score,
        manually_corrected
      )
      VALUES (
        target_document.id,
        field_change ->> 'field_name',
        next_field_value,
        NULL,
        true
      );
    END IF;

    IF NOT target_document.id = ANY(touched_document_ids) THEN
      touched_document_ids := array_append(touched_document_ids, target_document.id);
    END IF;
  END LOOP;

  UPDATE public.documents
  SET
    extraction_completed_at = p_reviewed_at,
    extraction_error = NULL,
    extraction_started_at = COALESCE(extraction_started_at, p_reviewed_at),
    extraction_status = 'succeeded'
  WHERE case_id = p_case_id
    AND id = ANY(touched_document_ids)
    AND (
      extraction_status IN ('pending', 'processing', 'failed')
      OR extraction_error IS NOT NULL
    );

  PERFORM public.finalize_case_requirement_evaluation(
    p_case_id,
    p_next_status,
    p_requirements
  );

  IF p_needs_document_reevaluation THEN
    UPDATE public.cases
    SET needs_document_reevaluation = true
    WHERE id = p_case_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Case % was not found.', p_case_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_manual_extracted_field_review(
  UUID,
  JSONB,
  TIMESTAMPTZ,
  public.case_status,
  JSONB,
  BOOLEAN
) TO authenticated;
