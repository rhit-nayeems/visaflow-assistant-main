DROP POLICY IF EXISTS "School admins can insert review timeline events" ON public.case_timeline_events;

DROP POLICY IF EXISTS "School admins can insert review audit logs" ON public.audit_logs;

DROP FUNCTION IF EXISTS public.apply_reviewer_case_decision(UUID, public.case_status);

CREATE OR REPLACE FUNCTION public.apply_reviewer_case_decision(
  p_case_id UUID,
  p_next_status public.case_status,
  p_reviewer_comment TEXT
)
RETURNS TABLE (
  case_id UUID,
  previous_status public.case_status,
  next_status public.case_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewer_user_id UUID := auth.uid();
  current_status public.case_status;
  normalized_comment TEXT := NULLIF(BTRIM(COALESCE(p_reviewer_comment, '')), '');
  timeline_title TEXT;
  timeline_description TEXT;
  audit_action_type TEXT;
  audit_reason TEXT;
BEGIN
  IF reviewer_user_id IS NULL OR NOT public.has_role(reviewer_user_id, 'school_admin') THEN
    RAISE EXCEPTION 'Reviewer access requires the school_admin role.';
  END IF;

  IF p_next_status NOT IN (
    'approved'::public.case_status,
    'denied'::public.case_status,
    'change_pending'::public.case_status
  ) THEN
    RAISE EXCEPTION 'Reviewer decisions can only transition cases to approved, denied, or change_pending.';
  END IF;

  IF p_next_status IN ('denied'::public.case_status, 'change_pending'::public.case_status)
    AND normalized_comment IS NULL THEN
    RAISE EXCEPTION 'Reviewer comment is required.';
  END IF;

  IF p_next_status = 'approved'::public.case_status THEN
    timeline_title := 'Case approved';
    timeline_description := 'School review approved this case.';
    audit_action_type := 'review_approved';
    audit_reason := 'Reviewer approved the submitted case.';
  ELSIF p_next_status = 'denied'::public.case_status THEN
    timeline_title := 'Case denied';
    timeline_description := 'School review denied this case.';
    audit_action_type := 'review_denied';
    audit_reason := 'Reviewer denied the submitted case.';
  ELSE
    timeline_title := 'Changes requested';
    timeline_description := 'School review requested changes before approval.';
    audit_action_type := 'review_changes_requested';
    audit_reason := 'Reviewer requested changes on the submitted case.';
  END IF;

  IF normalized_comment IS NOT NULL THEN
    timeline_description := timeline_description || ' Reviewer note: ' || normalized_comment;
    audit_reason := audit_reason || ' Comment: ' || normalized_comment;
  END IF;

  UPDATE public.cases
  SET status = p_next_status
  WHERE id = p_case_id
    AND status = 'submitted'::public.case_status;

  IF FOUND THEN
    INSERT INTO public.case_timeline_events (
      case_id,
      event_type,
      title,
      description
    )
    VALUES (
      p_case_id,
      'status_changed',
      timeline_title,
      timeline_description
    );

    INSERT INTO public.audit_logs (
      case_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value,
      reason
    )
    VALUES (
      p_case_id,
      reviewer_user_id,
      audit_action_type,
      'status',
      'submitted',
      p_next_status,
      audit_reason
    );

    RETURN QUERY
    SELECT
      p_case_id,
      'submitted'::public.case_status,
      p_next_status;
    RETURN;
  END IF;

  SELECT cases.status
  INTO current_status
  FROM public.cases
  WHERE cases.id = p_case_id
    AND public.can_review_case(reviewer_user_id, cases.id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found or you do not have reviewer access.';
  END IF;

  IF current_status <> 'submitted'::public.case_status THEN
    RAISE EXCEPTION 'Only submitted cases can be reviewed.';
  END IF;

  RAISE EXCEPTION 'Unable to update this case.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_reviewer_case_decision(
  UUID,
  public.case_status,
  TEXT
) TO authenticated;
