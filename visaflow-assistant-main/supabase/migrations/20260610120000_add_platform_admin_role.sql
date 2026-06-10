-- Introduce a platform_admin role that sits above school_admin and is responsible for
-- provisioning reviewer-to-school assignments.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` must commit before the new label can be referenced by other
-- DDL (function bodies, RLS policies). This migration only adds the value; the management RPCs
-- and policies that use it live in the next migration so they run in a separate transaction.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';
