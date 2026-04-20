CREATE POLICY "Users can insert requirements for own cases" ON public.case_requirements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cases
      WHERE cases.id = case_requirements.case_id
        AND cases.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete requirements for own cases" ON public.case_requirements
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.cases
      WHERE cases.id = case_requirements.case_id
        AND cases.user_id = auth.uid()
    )
  );

WITH seeded_school AS (
  INSERT INTO public.schools (name, country, active)
  SELECT 'VisaFlow Demo University', 'US', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.schools
    WHERE name = 'VisaFlow Demo University'
  )
  RETURNING id
),
school_row AS (
  SELECT id
  FROM seeded_school
  UNION ALL
  SELECT id
  FROM public.schools
  WHERE name = 'VisaFlow Demo University'
  LIMIT 1
)
INSERT INTO public.school_templates (
  school_id,
  process_type,
  version,
  config_json,
  is_active
)
SELECT
  school_row.id,
  'CPT',
  1,
  '{
    "lead_time_warning_days": 14,
    "requirements": [
      {
        "key": "offer_letter_uploaded",
        "label": "Offer letter uploaded",
        "severity": "blocker",
        "type": "document",
        "documentType": "offer_letter"
      },
      {
        "key": "employer_name_provided",
        "label": "Employer name provided",
        "severity": "blocker",
        "type": "case_field",
        "field": "employer_name"
      },
      {
        "key": "job_title_provided",
        "label": "Job title provided",
        "severity": "blocker",
        "type": "case_field",
        "field": "role_title"
      },
      {
        "key": "job_duties_available",
        "label": "Job duties available",
        "severity": "blocker",
        "type": "extracted_field",
        "documentType": "offer_letter",
        "extractedFieldName": "job_duties"
      },
      {
        "key": "start_date_provided",
        "label": "Start date provided",
        "severity": "blocker",
        "type": "case_field",
        "field": "start_date"
      },
      {
        "key": "end_date_provided",
        "label": "End date provided",
        "severity": "blocker",
        "type": "case_field",
        "field": "end_date"
      },
      {
        "key": "advisor_approval_uploaded",
        "label": "Advisor approval uploaded",
        "severity": "blocker",
        "type": "document",
        "documentType": "advisor_approval"
      },
      {
        "key": "course_registration_uploaded",
        "label": "Course registration uploaded",
        "severity": "blocker",
        "type": "document",
        "documentType": "course_registration"
      },
      {
        "key": "lead_time_warning",
        "label": "Lead time before start date",
        "severity": "warning",
        "type": "lead_time",
        "minDays": 14
      }
    ]
  }'::jsonb,
  true
FROM school_row
WHERE NOT EXISTS (
  SELECT 1
  FROM public.school_templates
  WHERE school_templates.school_id = school_row.id
    AND school_templates.process_type = 'CPT'
    AND school_templates.version = 1
);
