-- Event-driven case notifications.
--
-- A single AFTER UPDATE trigger on cases.status produces notifications, so the behavior is
-- robust no matter which path changes the status (submit flow, reviewer-decision RPC, etc.)
-- and is written in the same transaction as the status change.
--   * status -> submitted        : notify every reviewer assigned to the case's school
--   * status -> approved/denied/change_pending : notify the case owner (student)
--
-- SECURITY DEFINER lets the trigger insert rows for other users (reviewers) and bypass RLS,
-- mirroring how apply_reviewer_case_decision already writes audit_logs / case_timeline_events.
-- The notifications table intentionally has no INSERT policy: rows are only ever created here.

-- Support listing a user's notifications newest-first.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_on_case_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_title TEXT;
  notification_body TEXT;
BEGIN
  -- Reviewers: a case entered (or re-entered) the review queue.
  IF NEW.status = 'submitted'::public.case_status THEN
    INSERT INTO public.notifications (user_id, case_id, type, title, body)
    SELECT
      rsa.user_id,
      NEW.id,
      'case_submitted',
      'Case submitted for review',
      'A CPT case is ready for your review.'
    FROM public.school_templates st
    JOIN public.reviewer_school_assignments rsa
      ON rsa.school_id = st.school_id
    WHERE st.id = NEW.school_template_id;

    RETURN NEW;
  END IF;

  -- Student: a reviewer reached a decision on their case.
  IF NEW.status = 'approved'::public.case_status THEN
    notification_title := 'Case approved';
    notification_body := 'School review approved your case.';
  ELSIF NEW.status = 'denied'::public.case_status THEN
    notification_title := 'Case denied';
    notification_body := 'School review denied your case. Open the case for details.';
  ELSIF NEW.status = 'change_pending'::public.case_status THEN
    notification_title := 'Changes requested';
    notification_body := 'School review requested changes. Open the case for details.';
  ELSE
    -- Intermediate/automated transitions (draft, missing_documents, ...) do not notify.
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, case_id, type, title, body)
  VALUES (NEW.user_id, NEW.id, 'case_status', notification_title, notification_body);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_case_status_change ON public.cases;

CREATE TRIGGER trg_notify_on_case_status_change
  AFTER UPDATE OF status ON public.cases
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_on_case_status_change();

-- Enable Realtime for live notification delivery (Supabase ships the supabase_realtime
-- publication). Guarded so the migration is safe on plain Postgres and is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
