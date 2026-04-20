DROP POLICY IF EXISTS "School admins can update review workflow cases" ON public.cases;

CREATE OR REPLACE FUNCTION public.apply_reviewer_case_decision(
  p_case_id UUID,
  p_next_status public.case_status
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

  UPDATE public.cases
  SET status = p_next_status
  WHERE id = p_case_id
    AND status = 'submitted'::public.case_status;

  IF FOUND THEN
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
  public.case_status
) TO authenticated;
