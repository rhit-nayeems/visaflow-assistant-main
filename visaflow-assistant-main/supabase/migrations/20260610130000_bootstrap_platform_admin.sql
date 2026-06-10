-- Bootstrapping the first platform_admin.
--
-- A role can only attach to a real authenticated user, and users are created by signup (after
-- migrations run), so the first platform_admin must be granted post-signup. This migration makes
-- that a single safe step, plus an optional zero-touch path driven by database config.

-- Explicit path: promote an existing user to platform_admin by email. Idempotent and validated.
-- Intentionally NOT granted to `authenticated` — only the SQL editor (postgres) or service role
-- may call it, so an ordinary user can never self-promote.
CREATE OR REPLACE FUNCTION public.grant_platform_admin(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT id
  INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower(btrim(p_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %.', p_email;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'platform_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_platform_admin(TEXT) FROM PUBLIC;

-- Automatic path: when the database setting `app.bootstrap_admin_email` is configured, the user
-- who signs up with that exact email is granted platform_admin automatically on creation. When the
-- setting is absent (the default), this is a no-op. Configure once with, e.g.:
--   ALTER DATABASE postgres SET app.bootstrap_admin_email = 'you@example.com';
CREATE OR REPLACE FUNCTION public.maybe_grant_bootstrap_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bootstrap_email TEXT := current_setting('app.bootstrap_admin_email', true);
BEGIN
  IF bootstrap_email IS NOT NULL
     AND btrim(bootstrap_email) <> ''
     AND NEW.email IS NOT NULL
     AND lower(NEW.email) = lower(btrim(bootstrap_email)) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'platform_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_bootstrap_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.maybe_grant_bootstrap_admin();
