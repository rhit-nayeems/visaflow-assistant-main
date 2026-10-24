-- Case edits, approval revalidation, and edit history commit as one transaction.
-- Triggers also protect approval-sensitive fields changed through the Data API.
CREATE OR REPLACE FUNCTION public.guard_case_workflow_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  details_changed BOOLEAN;
  sensitive_changed BOOLEAN;
  allowed public.case_status[];
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Case ownership cannot be changed.';
  END IF;
  IF OLD.status <> 'draft' AND NEW.school_template_id IS DISTINCT FROM OLD.school_template_id THEN
    RAISE EXCEPTION 'The school template cannot be changed after case setup.';
  END IF;
  details_changed := ROW(NEW.employer_name, NEW.role_title, NEW.work_location,
    NEW.start_date, NEW.end_date, NEW.case_summary) IS DISTINCT FROM
    ROW(OLD.employer_name, OLD.role_title, OLD.work_location,
    OLD.start_date, OLD.end_date, OLD.case_summary);
  sensitive_changed := ROW(NEW.employer_name, NEW.work_location, NEW.start_date, NEW.end_date)
    IS DISTINCT FROM ROW(OLD.employer_name, OLD.work_location, OLD.start_date, OLD.end_date);
  IF details_changed AND OLD.status IN ('submitted', 'denied', 'completed') THEN
    RAISE EXCEPTION 'Case details cannot be edited while submitted, denied, or completed.';
  END IF;
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'End date must be on or after the start date.';
  END IF;
  IF OLD.status = 'approved' AND sensitive_changed THEN
    NEW.status := 'change_pending';
  ELSIF details_changed AND OLD.status = 'ready_for_submission' AND NEW.status = OLD.status THEN
    -- Direct edits must lose stale readiness; the atomic edit RPC reevaluates below.
    NEW.status := 'blocked';
  END IF;
  allowed := CASE OLD.status
    WHEN 'draft' THEN ARRAY['missing_documents','blocked','ready_for_submission']::public.case_status[]
    WHEN 'missing_documents' THEN ARRAY['blocked','ready_for_submission','submitted']::public.case_status[]
    WHEN 'in_progress' THEN ARRAY['blocked','missing_documents','ready_for_submission','submitted']::public.case_status[]
    WHEN 'blocked' THEN ARRAY['missing_documents','ready_for_submission','submitted']::public.case_status[]
    WHEN 'ready_for_submission' THEN ARRAY['submitted','blocked','missing_documents']::public.case_status[]
    WHEN 'submitted' THEN ARRAY['approved','denied','change_pending']::public.case_status[]
    WHEN 'approved' THEN ARRAY['change_pending','completed']::public.case_status[]
    WHEN 'change_pending' THEN ARRAY['missing_documents','blocked','ready_for_submission','submitted','approved','denied']::public.case_status[]
    ELSE ARRAY[]::public.case_status[] END;
  IF NEW.status <> OLD.status AND NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid case status transition: % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status IN ('ready_for_submission','submitted') THEN
    IF NOT EXISTS (SELECT 1 FROM public.case_requirements WHERE case_id = NEW.id)
      OR EXISTS (SELECT 1 FROM public.case_requirements WHERE case_id = NEW.id
        AND severity = 'blocker' AND status NOT IN ('met','waived')) THEN
      RAISE EXCEPTION 'Resolve all blocker requirements before submission.';
    END IF;
    IF NEW.status = 'submitted' AND NEW.needs_document_reevaluation THEN
      RAISE EXCEPTION 'Reevaluate unresolved documents before submission.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_case_workflow_update BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.guard_case_workflow_update();

CREATE OR REPLACE FUNCTION public.record_case_details_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  field TEXT;
  changed_fields TEXT[] := ARRAY[]::TEXT[];
  reason TEXT := 'Student updated internship details.';
BEGIN
  FOREACH field IN ARRAY ARRAY['employer_name','role_title','work_location','start_date','end_date','case_summary'] LOOP
    IF (to_jsonb(OLD) -> field) IS DISTINCT FROM (to_jsonb(NEW) -> field) THEN
      changed_fields := array_append(changed_fields, field);
      INSERT INTO public.audit_logs(case_id, actor_id, action_type, field_name, old_value, new_value, reason)
      VALUES (NEW.id, COALESCE(auth.uid(), NEW.user_id), 'case_details_updated', field,
        to_jsonb(OLD) ->> field, to_jsonb(NEW) ->> field, reason);
    END IF;
  END LOOP;
  IF cardinality(changed_fields) > 0 THEN
    INSERT INTO public.case_timeline_events(case_id, event_type, title, description)
    VALUES (NEW.id, 'case_details_updated', 'Internship details updated',
      'Updated: ' || replace(array_to_string(changed_fields, ', '), '_', ' ') || '.');
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'change_pending' AND cardinality(changed_fields) > 0 THEN
    reason := 'Approved employment details changed. Review the updated documents and resubmit for reapproval.';
    INSERT INTO public.audit_logs(case_id, actor_id, action_type, field_name, old_value, new_value, reason)
    VALUES (NEW.id, COALESCE(auth.uid(), NEW.user_id), 'approval_revalidation', 'status', OLD.status, NEW.status, reason);
    INSERT INTO public.case_timeline_events(case_id, event_type, title, description)
    VALUES (NEW.id, 'approval_revalidation', 'Reapproval required', reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_case_details_history AFTER UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.record_case_details_history();

CREATE OR REPLACE FUNCTION public.update_case_details(
  p_case_id UUID, p_expected_updated_at TIMESTAMPTZ, p_details JSONB,
  p_next_status public.case_status, p_requirements JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  target public.cases%ROWTYPE;
  field TEXT;
  next_status public.case_status;
  sensitive_changed BOOLEAN;
  expected_status public.case_status;
BEGIN
  SELECT * INTO target FROM public.cases WHERE id = p_case_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found or you do not have access.'; END IF;
  IF p_expected_updated_at IS NULL OR target.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'This case changed since you opened it. Reload the case before saving.';
  END IF;
  IF target.status IN ('submitted','denied','completed') THEN
    RAISE EXCEPTION 'Case details cannot be edited while submitted, denied, or completed.';
  END IF;
  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN
    RAISE EXCEPTION 'Case details must be an object.';
  END IF;
  FOREACH field IN ARRAY ARRAY['employer_name','role_title','work_location','start_date','end_date','case_summary'] LOOP
    IF NOT (p_details ? field) OR jsonb_typeof(p_details -> field) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'Invalid case detail: %', field;
    END IF;
  END LOOP;
  IF jsonb_typeof(p_requirements) IS DISTINCT FROM 'array' OR jsonb_array_length(p_requirements) = 0 THEN
    RAISE EXCEPTION 'Evaluated requirements are required.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_requirements) r
    WHERE NULLIF(btrim(r ->> 'explanation'), '') IS NULL
      OR NULLIF(btrim(r ->> 'requirement_key'), '') IS NULL
      OR NULLIF(btrim(r ->> 'label'), '') IS NULL) THEN
    RAISE EXCEPTION 'Every requirement must have a key, label, and explanation.';
  END IF;
  sensitive_changed := ROW(target.employer_name,target.work_location,target.start_date,target.end_date)
    IS DISTINCT FROM ROW(p_details ->> 'employer_name',p_details ->> 'work_location',
      (p_details ->> 'start_date')::DATE,(p_details ->> 'end_date')::DATE);
  expected_status := CASE
    WHEN target.status = 'change_pending' OR (target.status = 'approved' AND sensitive_changed) THEN 'change_pending'
    WHEN target.status = 'approved' THEN 'approved'
    WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_requirements) r
      WHERE COALESCE(r ->> 'severity','blocker') = 'blocker'
        AND COALESCE(r ->> 'status','pending') NOT IN ('met','waived')) THEN 'ready_for_submission'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(p_requirements) r
      WHERE COALESCE(r ->> 'severity','blocker') = 'blocker'
        AND COALESCE(r ->> 'status','pending') NOT IN ('met','waived')
        AND r ->> 'source' LIKE '%document%') THEN 'missing_documents'
    ELSE 'blocked' END;
  IF p_next_status IS DISTINCT FROM expected_status THEN
    RAISE EXCEPTION 'Case status does not match requirement evaluation.';
  END IF;
  UPDATE public.cases SET employer_name = NULLIF(btrim(p_details ->> 'employer_name'),''),
    role_title = NULLIF(btrim(p_details ->> 'role_title'),''),
    work_location = NULLIF(btrim(p_details ->> 'work_location'),''),
    start_date = (p_details ->> 'start_date')::DATE, end_date = (p_details ->> 'end_date')::DATE,
    case_summary = NULLIF(btrim(p_details ->> 'case_summary'),'')
  WHERE id = p_case_id;
  PERFORM public.finalize_case_requirement_evaluation(p_case_id, p_next_status, p_requirements);
  IF target.status <> p_next_status AND NOT (target.status = 'approved' AND sensitive_changed) THEN
    INSERT INTO public.audit_logs(case_id,actor_id,action_type,field_name,old_value,new_value,reason)
    VALUES (p_case_id,auth.uid(),'status_changed','status',target.status,p_next_status,
      'Requirements reevaluated after internship details changed.');
    INSERT INTO public.case_timeline_events(case_id,event_type,title,description)
    VALUES (p_case_id,'status_changed','Requirements reevaluated',
      'Case status changed to ' || replace(p_next_status::TEXT,'_',' ') || ' after internship details changed.');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_case_details(UUID,TIMESTAMPTZ,JSONB,public.case_status,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_case_details(UUID,TIMESTAMPTZ,JSONB,public.case_status,JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_case_workflow_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_case_details_history() FROM PUBLIC, anon, authenticated;

-- The demo template requires offer-letter fields independently of the case form.
UPDATE public.school_templates t SET config_json = jsonb_set(t.config_json, '{requirements}',
  COALESCE(t.config_json -> 'requirements','[]'::JSONB) || (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key','offer_letter_' || f.name,
      'label',f.label || ' in offer letter','severity','blocker','type','extracted_field',
      'documentType','offer_letter','extractedFieldName',f.name)),'[]'::JSONB)
    FROM (VALUES ('employer_name','Employer name'),('role_title','Job title'),
      ('start_date','Start date'),('end_date','End date')) f(name,label)
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.config_json -> 'requirements') r
      WHERE r ->> 'key' = 'offer_letter_' || f.name)
  ))
WHERE t.school_id IN (SELECT id FROM public.schools WHERE name = 'VisaFlow Demo University')
  AND upper(t.process_type) = 'CPT' AND t.version = 1;

INSERT INTO public.case_requirements(case_id,requirement_key,label,severity,status,explanation,source)
SELECT c.id,r ->> 'key',r ->> 'label','blocker','pending',
  'Review ' || lower(r ->> 'label') || ' and rerun requirement evaluation.','template:extracted_field'
FROM public.cases c JOIN public.school_templates t ON t.id=c.school_template_id,
  LATERAL jsonb_array_elements(t.config_json -> 'requirements') r
WHERE c.status IN ('draft','missing_documents','in_progress','blocked','ready_for_submission','change_pending')
  AND t.school_id IN (SELECT id FROM public.schools WHERE name='VisaFlow Demo University')
  AND r ->> 'key' IN ('offer_letter_employer_name','offer_letter_role_title','offer_letter_start_date','offer_letter_end_date')
  AND NOT EXISTS (SELECT 1 FROM public.case_requirements old WHERE old.case_id=c.id AND old.requirement_key=r ->> 'key');

WITH invalidated AS (
  UPDATE public.cases c SET status='blocked' WHERE c.status='ready_for_submission'
    AND EXISTS (SELECT 1 FROM public.case_requirements r WHERE r.case_id=c.id
      AND r.severity='blocker' AND r.status NOT IN ('met','waived')) RETURNING id
)
INSERT INTO public.case_timeline_events(case_id,event_type,title,description)
SELECT id,'requirements_updated','Offer-letter review required',
  'The default CPT template now checks the required offer-letter fields. Review the fields and rerun evaluation.'
FROM invalidated;
