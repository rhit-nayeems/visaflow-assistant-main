-- Clear historical stale reevaluation flags using the same template-derived
-- relevant latest document rules as the server submission workflow.
WITH flagged_cases AS (
  SELECT
    cases.id AS case_id,
    COALESCE(school_templates.config_json::jsonb, '{}'::jsonb) AS template_config
  FROM public.cases AS cases
  LEFT JOIN public.school_templates
    ON school_templates.id = cases.school_template_id
  WHERE cases.needs_document_reevaluation = true
),
normalized_template_requirements AS (
  SELECT
    flagged_cases.case_id,
    requirement
  FROM flagged_cases
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(flagged_cases.template_config) = 'object'
        AND jsonb_typeof(flagged_cases.template_config -> 'requirements') = 'array'
      THEN flagged_cases.template_config -> 'requirements'
      ELSE '[]'::jsonb
    END
  ) AS requirement
  WHERE jsonb_typeof(requirement) = 'object'
    AND NULLIF(BTRIM(requirement ->> 'key'), '') IS NOT NULL
    AND NULLIF(BTRIM(requirement ->> 'label'), '') IS NOT NULL
    AND requirement ->> 'type' IN ('document', 'case_field', 'extracted_field', 'lead_time')
    AND (
      requirement ->> 'type' <> 'case_field'
      OR requirement ->> 'field' IN (
        'employer_name',
        'role_title',
        'work_location',
        'start_date',
        'end_date',
        'case_summary'
      )
    )
    AND (
      requirement ->> 'type' <> 'extracted_field'
      OR NULLIF(BTRIM(requirement ->> 'extractedFieldName'), '') IS NOT NULL
    )
),
cases_with_custom_requirements AS (
  SELECT DISTINCT normalized_template_requirements.case_id
  FROM normalized_template_requirements
),
default_requirements AS (
  SELECT requirement
  FROM jsonb_array_elements(
    '[
      {"key":"offer_letter_uploaded","label":"Offer letter uploaded","severity":"blocker","type":"document","documentType":"offer_letter"},
      {"key":"employer_name_provided","label":"Employer name provided","severity":"blocker","type":"case_field","field":"employer_name"},
      {"key":"job_title_provided","label":"Job title provided","severity":"blocker","type":"case_field","field":"role_title"},
      {"key":"job_duties_available","label":"Job duties available","severity":"blocker","type":"extracted_field","documentType":"offer_letter","extractedFieldName":"job_duties"},
      {"key":"start_date_provided","label":"Start date provided","severity":"blocker","type":"case_field","field":"start_date"},
      {"key":"end_date_provided","label":"End date provided","severity":"blocker","type":"case_field","field":"end_date"},
      {"key":"advisor_approval_uploaded","label":"Advisor approval uploaded","severity":"blocker","type":"document","documentType":"advisor_approval"},
      {"key":"course_registration_uploaded","label":"Course registration uploaded","severity":"blocker","type":"document","documentType":"course_registration"},
      {"key":"lead_time_warning","label":"Lead time before start date","severity":"warning","type":"lead_time","minDays":14}
    ]'::jsonb
  ) AS requirement
),
effective_requirements AS (
  SELECT
    normalized_template_requirements.case_id,
    normalized_template_requirements.requirement
  FROM normalized_template_requirements
  UNION ALL
  SELECT
    flagged_cases.case_id,
    default_requirements.requirement
  FROM flagged_cases
  CROSS JOIN default_requirements
  WHERE NOT EXISTS (
    SELECT 1
    FROM cases_with_custom_requirements
    WHERE cases_with_custom_requirements.case_id = flagged_cases.case_id
  )
),
relevant_document_types AS (
  SELECT DISTINCT
    effective_requirements.case_id,
    COALESCE(NULLIF(BTRIM(effective_requirements.requirement ->> 'documentType'), ''), 'offer_letter')
      AS document_type
  FROM effective_requirements
  WHERE effective_requirements.requirement ->> 'type' IN ('document', 'extracted_field')
    AND (
      CASE
        WHEN effective_requirements.requirement ->> 'severity' IN ('blocker', 'warning', 'info')
          THEN effective_requirements.requirement ->> 'severity'
        WHEN effective_requirements.requirement ->> 'type' = 'lead_time'
          THEN 'warning'
        ELSE 'blocker'
      END
    ) = 'blocker'
),
latest_relevant_documents AS (
  SELECT DISTINCT ON (documents.case_id, documents.document_type)
    documents.case_id,
    documents.document_type,
    documents.extraction_status
  FROM public.documents AS documents
  JOIN relevant_document_types
    ON relevant_document_types.case_id = documents.case_id
   AND relevant_document_types.document_type = documents.document_type
  ORDER BY
    documents.case_id,
    documents.document_type,
    documents.version_number DESC,
    documents.created_at DESC,
    documents.id DESC
),
cases_still_requiring_reevaluation AS (
  SELECT DISTINCT latest_relevant_documents.case_id
  FROM latest_relevant_documents
  WHERE latest_relevant_documents.extraction_status IN ('pending', 'processing', 'failed')
)
UPDATE public.cases AS cases
SET needs_document_reevaluation = false
WHERE cases.needs_document_reevaluation = true
  AND NOT EXISTS (
    SELECT 1
    FROM cases_still_requiring_reevaluation
    WHERE cases_still_requiring_reevaluation.case_id = cases.id
  );
