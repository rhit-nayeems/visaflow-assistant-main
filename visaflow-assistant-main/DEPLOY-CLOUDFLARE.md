# Deploy VisaFlow to Cloudflare Workers

Reviewed: 2026-10-20 against main at 71fa5b1. This guide describes committed configuration,
not a fresh deployment or hosted-backend check. Historical publication and backend
observations are in [PROJECT_STATUS.md](./PROJECT_STATUS.md).

## Working directory and prerequisites

Use Node.js 24 and npm. From the repository root:

```powershell
Set-Location visaflow-assistant-main
npm ci
```

All remaining commands run inside this directory. Main has no root npm wrapper.
Preserve existing configuration; use .env.example as the variable reference.

## Environment configuration

Browser and server URL/key pairs must belong to the same Supabase project.

| Variable                                          | Usage                                               |
| ------------------------------------------------- | --------------------------------------------------- |
| VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY | Browser values embedded during build                |
| VITE_AUTH_REDIRECT_ORIGIN                         | Browser auth redirect origin, embedded during build |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY           | Server runtime/auth middleware                      |
| APP_URL                                           | Server auth-origin fallback                         |
| ANTHROPIC_API_KEY                                 | Optional extraction provider, server-only           |
| ANTHROPIC_EXTRACTION_MODEL                        | Optional override; code default is claude-haiku-4-5 |
| SUPABASE_SERVICE_ROLE_KEY                         | Optional unused service-role helper, server-only    |

Local settings do not automatically become Worker runtime bindings. Configure server
settings in Cloudflare for the target Worker. Current student, reviewer, and platform-admin
flows use user-scoped clients; they do not require the unused service-role helper.
Never put privileged/provider keys in VITE\_ variables.

Without an Anthropic key, extraction uses the local text-pattern stub and manual review.
A key enables the optional PDF/image/text extraction extension; live accuracy and deployed
credential availability still need verification.

## Build and publish

```powershell
npm run cf:login
npm run cf:whoami
npm test
npm run lint
npm run build
```

Confirm browser build variables contain the production backend/origin, not placeholders.
Then publish with the checked-in script:

```powershell
npm run deploy
```

The deploy script rebuilds and runs Wrangler. The Cloudflare Vite plugin supplies the built
Worker/assets. The checked-in wrangler.jsonc names visaflow-assistant, enables nodejs_compat,
and uses the TanStack Start server entry; it does not pin an account or custom domain.
Verify the selected account and runtime variables before publishing, and recheck them afterward.
Rebuild whenever browser URL/key/origin values change.

For dashboard-managed runtime variables, verify Wrangler's preservation behavior for the
installed version before deploying. See [Cloudflare environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
and [secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Supabase configuration

Confirm the intended project is active, inspect its migration history, and apply pending SQL
from supabase/migrations/ in order. Main contains 18 migrations ending with
20260610130000_bootstrap_platform_admin.sql. The local October editor/revalidation migration
is not committed in the audited main revision. Regenerate types when the hosted schema changes.

Set Supabase Authentication's Site URL to the deployed app origin. Add the exact app callback
URL to its redirect allowlist, and the callback for the actual local Vite origin/port:

- https://your-app-domain.com/auth/callback
- http://localhost:5173/auth/callback (adjust to the port Vite actually prints)

Set local VITE_AUTH_REDIRECT_ORIGIN and APP_URL to the local origin during development.
Remove old hardcoded builder domains from confirmation/reset templates and use the
configured redirect. The app handles recovery through /auth/callback and /reset-password.
See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
and [database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

Google sign-in is optional and requires complete provider credentials. Its provider OAuth
callback is https://your-project-id.supabase.co/auth/v1/callback; the app callback remains
/auth/callback on the VisaFlow origin. Apple sign-in is not exposed by the current UI.

For reviewer management, bootstrap a platform admin after signup as described in the
[README](./README.md#bootstrapping-a-platform-admin), then assign reviewers to schools.
A school_admin role alone does not grant access to every school's cases.

## Post-deployment checklist

1. Public landing/login/signup pages and signed-out protected-route redirects.
2. Signup, confirmation, login/logout, forgot/reset password, and optional Google sign-in.
3. Create/list/detail, requirement explanations, blockers/warnings, and readiness.
4. Actual private Storage upload/download, versions, retry, and manual field review.
5. Submission/resubmission, school-scoped decisions, and timeline/audit history.
6. Platform-admin assignment/revocation and case-status notifications.
7. Approved sensitive-change revalidation after its missing edit workflow is committed.

Code tests mock database/provider boundaries and do not replace live checks.
A successful Worker publish alone does not complete the v1 release.
