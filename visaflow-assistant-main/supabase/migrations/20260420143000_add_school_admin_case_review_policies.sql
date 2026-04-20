CREATE OR REPLACE FUNCTION public.can_review_case(_user_id UUID, _case_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'school_admin')
    AND EXISTS (
      SELECT 1
      FROM public.cases
      WHERE cases.id = _case_id
        AND cases.status IN ('submitted', 'approved', 'denied', 'change_pending', 'completed')
    )
$$;

GRANT EXECUTE ON FUNCTION public.can_review_case(UUID, UUID) TO authenticated;

CREATE POLICY "School admins can review workflow cases" ON public.cases
  FOR SELECT USING (public.can_review_case(auth.uid(), id));

CREATE POLICY "School admins can update review workflow cases" ON public.cases
  FOR UPDATE USING (public.can_review_case(auth.uid(), id))
  WITH CHECK (
    public.has_role(auth.uid(), 'school_admin')
    AND status IN ('submitted', 'approved', 'denied', 'change_pending', 'completed')
  );

CREATE POLICY "School admins can view reviewable case documents" ON public.documents
  FOR SELECT USING (public.can_review_case(auth.uid(), case_id));

CREATE POLICY "School admins can view reviewable extracted fields" ON public.extracted_fields
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.documents
      WHERE documents.id = extracted_fields.document_id
        AND public.can_review_case(auth.uid(), documents.case_id)
    )
  );

CREATE POLICY "School admins can view reviewable case requirements" ON public.case_requirements
  FOR SELECT USING (public.can_review_case(auth.uid(), case_id));

CREATE POLICY "School admins can view reviewable case timeline" ON public.case_timeline_events
  FOR SELECT USING (public.can_review_case(auth.uid(), case_id));

CREATE POLICY "School admins can insert review timeline events" ON public.case_timeline_events
  FOR INSERT WITH CHECK (public.can_review_case(auth.uid(), case_id));

CREATE POLICY "School admins can view reviewable audit logs" ON public.audit_logs
  FOR SELECT USING (public.can_review_case(auth.uid(), case_id));

CREATE POLICY "School admins can insert review audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (public.can_review_case(auth.uid(), case_id));
