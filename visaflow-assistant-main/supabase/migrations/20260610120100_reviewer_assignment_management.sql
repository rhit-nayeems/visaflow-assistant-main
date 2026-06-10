-- Reviewer-assignment management for platform admins.
--
-- Writes to reviewer_school_assignments are intentionally restricted to the SECURITY DEFINER RPCs
-- below (there is no INSERT/DELETE RLS policy), mirroring the audited-RPC pattern used for case
-- decisions. Platform admins additionally get read access to the full assignment roster.

-- Let platform admins read every reviewer assignment (reviewers still only see their own).
CREATE POLICY "Platform admins can view all reviewer assignments"
  ON public.reviewer_school_assignments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- Assign a school_admin reviewer to a school. Idempotent: re-assigning returns the existing row.
CREATE OR REPLACE FUNCTION public.assign_reviewer_to_school(
  p_user_id UUID,
  p_school_id UUID
)
RETURNS public.reviewer_school_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignment_row public.reviewer_school_assignments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Managing reviewer assignments requires the platform_admin role.';
  END IF;

  IF NOT public.has_role(p_user_id, 'school_admin') THEN
    RAISE EXCEPTION 'Only users with the school_admin role can be assigned as reviewers.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RAISE EXCEPTION 'School not found.';
  END IF;

  INSERT INTO public.reviewer_school_assignments (user_id, school_id)
  VALUES (p_user_id, p_school_id)
  ON CONFLICT (user_id, school_id) DO UPDATE
    SET user_id = EXCLUDED.user_id
  RETURNING * INTO assignment_row;

  RETURN assignment_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_reviewer_to_school(UUID, UUID) TO authenticated;

-- Remove a reviewer assignment by id. Returns true when a row was deleted.
CREATE OR REPLACE FUNCTION public.revoke_reviewer_from_school(p_assignment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Managing reviewer assignments requires the platform_admin role.';
  END IF;

  DELETE FROM public.reviewer_school_assignments WHERE id = p_assignment_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_reviewer_from_school(UUID) TO authenticated;

-- The current assignment roster, enriched with reviewer and school display fields.
CREATE OR REPLACE FUNCTION public.list_reviewer_assignments()
RETURNS TABLE (
  assignment_id UUID,
  user_id UUID,
  full_name TEXT,
  email TEXT,
  school_id UUID,
  school_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rsa.id,
    rsa.user_id,
    profiles.full_name,
    profiles.email,
    rsa.school_id,
    schools.name,
    rsa.created_at
  FROM public.reviewer_school_assignments rsa
  JOIN public.schools schools ON schools.id = rsa.school_id
  LEFT JOIN public.profiles profiles ON profiles.user_id = rsa.user_id
  WHERE public.has_role(auth.uid(), 'platform_admin')
  ORDER BY schools.name, profiles.full_name NULLS LAST, rsa.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.list_reviewer_assignments() TO authenticated;

-- The school_admins who can be assigned as reviewers.
CREATE OR REPLACE FUNCTION public.list_assignable_reviewers()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    user_roles.user_id,
    profiles.full_name,
    profiles.email
  FROM public.user_roles user_roles
  LEFT JOIN public.profiles profiles ON profiles.user_id = user_roles.user_id
  WHERE user_roles.role = 'school_admin'
    AND public.has_role(auth.uid(), 'platform_admin')
  ORDER BY profiles.full_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_assignable_reviewers() TO authenticated;

-- The active schools a reviewer can be assigned to.
CREATE OR REPLACE FUNCTION public.list_assignable_schools()
RETURNS TABLE (
  id UUID,
  name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT schools.id, schools.name
  FROM public.schools schools
  WHERE schools.active
    AND public.has_role(auth.uid(), 'platform_admin')
  ORDER BY schools.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_assignable_schools() TO authenticated;
