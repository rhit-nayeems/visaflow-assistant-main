# Deploy VisaFlow to Cloudflare Workers

Documentation reviewed: 2026-10-11. Last deployment and browser verification: 2026-10-08.

Live app: [VisaFlow](https://visaflow-assistant.ledgerly-benefits.workers.dev).
Worker: `visaflow-assistant`. Published version: `7ad270f5-1091-460b-abf3-e90f73428a4b`.

The landing/login/signup pages returned HTTP 200, and a signed-out dashboard visit redirected
to login. This verifies publication, not the complete authenticated workflow. Deployment
preserved the existing backend URL/key pair. The user-selected Supabase project
`visaflow-assistant` (`cryimllpsevwelcsagih`) still needed restoration, matching credentials,
and migrations at the last check. Restoration was rejected by the active-free-project limit;
no unrelated project was paused. See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for release gaps.

## Working directory and prerequisites

Use Node.js 24 and npm. The application lives in `visaflow-assistant-main`; the root npm scripts
delegate normal development, build, and test commands there. Cloudflare-specific scripts live
in the application package.

From the repository root:

```powershell
npm install
Set-Location visaflow-assistant-main
```

For a fresh checkout, copy `.env.example` to `.env`. Preserve an existing `.env` and update its
values rather than overwriting it with placeholders. Environment files are ignored by Git.

## Environment configuration

The browser and server must use the same Supabase project and matching publishable key.

| Setting                         | Where used                                    | Required for v1   |
| ------------------------------- | --------------------------------------------- | ----------------- |
| `VITE_SUPABASE_URL`             | Browser, embedded during build                | Yes               |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser, embedded during build                | Yes               |
| `VITE_AUTH_REDIRECT_ORIGIN`     | Browser auth redirects, embedded during build | Production origin |
| `SUPABASE_URL`                  | Worker runtime/auth middleware                | Yes               |
| `SUPABASE_PUBLISHABLE_KEY`      | Worker runtime/auth middleware                | Yes               |
| `APP_URL`                       | Worker auth-origin fallback                   | Production origin |

Set the production origin to `https://visaflow-assistant.ledgerly-benefits.workers.dev`.
Local `.env` settings do not automatically become deployed Worker bindings. Browser values
are compiled into assets; server settings must also be configured on Cloudflare.

V1 does not require a service-role key or Anthropic key. The unused service-role client is a
server-only helper; adding its credential is unnecessary for the current student flows.
The optional Anthropic extraction extension is separate from the default stub/manual review
flow and was not enabled or live-verified. Never place privileged or provider credentials in
`VITE_` variables. See [Supabase API key guidance](https://supabase.com/docs/guides/api/api-keys).

## Build and publish

Authenticate using the application scripts, then build and check the generated Worker:

```powershell
npm run cf:login
npm run cf:whoami
$env:VITE_AUTH_REDIRECT_ORIGIN = 'https://visaflow-assistant.ledgerly-benefits.workers.dev'
$env:APP_URL = $env:VITE_AUTH_REDIRECT_ORIGIN
npm run build
npx wrangler deploy --dry-run --keep-vars
```

Stop if the build or dry-run fails. The Cloudflare Vite plugin redirects Wrangler to the
built `dist/server/wrangler.json`, which includes the compiled server and client assets.
The checked-in config pins the target account and enables `workers.dev` and observability.

For the first publish or when runtime credentials change, create an ignored private JSON file
such as `.env.deploy-secrets.json` with these fields:

```json
{
  "SUPABASE_URL": "https://your-project-id.supabase.co",
  "SUPABASE_PUBLISHABLE_KEY": "your-project-publishable-key",
  "APP_URL": "https://visaflow-assistant.ledgerly-benefits.workers.dev"
}
```

Fill in the real matching values locally; do not print keys or put them in command arguments.
Upload these settings with the deployment and remove the temporary file after success:

```powershell
npx wrangler deploy --keep-vars --secrets-file .env.deploy-secrets.json
Remove-Item -LiteralPath .env.deploy-secrets.json
```

For later deployments with unchanged runtime settings:

```powershell
npx wrangler deploy --keep-vars
```

`--keep-vars` preserves settings managed outside the config file. The bare `npm run deploy`
script builds and runs Wrangler without that flag, so use the explicit command above when
preserving dashboard-managed variables. Rebuild whenever browser Supabase values change.
See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Supabase setup before a complete v1 release

Restore the selected project after resolving the free-project limit. Inspect its migration
history, then apply pending migrations from this application directory. Include
`20261008214723_complete_v1_case_editing_and_revalidation.sql` for the edit RPC, atomic history,
transition guards, and default offer-letter field requirements. Regenerate the generated types
afterward; `workflow-schema.ts` is the temporary additive edit-RPC contract.

In Supabase Authentication → URL Configuration, set the Site URL to the deployed app origin.
Allow the exact callback URLs used by the app:

- `https://visaflow-assistant.ledgerly-benefits.workers.dev/auth/callback`
- `http://localhost:5173/auth/callback`
- `http://127.0.0.1:5173/auth/callback` if using that local origin

Use the actual port/origin printed by Vite if it differs. For local development, set the local
`VITE_AUTH_REDIRECT_ORIGIN`/`APP_URL` to that local origin rather than the production example.
The app handles recovery links through `/auth/callback` and routes recovery sessions to
`/reset-password`. Remove old hardcoded builder URLs from email templates and confirm the
redirect-aware confirmation/reset links. See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

Google sign-in is optional and needs complete Google provider credentials. Its provider OAuth
callback is `https://<project-ref>.supabase.co/auth/v1/callback`; the app redirect remains the
VisaFlow `/auth/callback` URL. Apple sign-in is not exposed by the current login UI.

If adding a custom domain later, update the app origins, rebuild, update Cloudflare runtime
bindings, and add the matching Supabase Site URL/redirect URLs.

## Verification after publish

Check the public landing page, login/signup pages, and signed-out protected-route redirect.
After the selected backend is active, configured, and migrated, verify:

1. Email signup, confirmation, login/logout, forgot-password, and reset-password flows.
2. Case creation/list/detail and requirement explanations, blockers, warnings, and readiness.
3. Actual private Storage uploads/downloads, document versions, and manual field review.
4. Submission and resubmission guards.
5. Approved employer/location/date edits becoming `change_pending`, with audit/timeline history.
6. Google sign-in if its optional provider is configured.

All authenticated/backend checks remain open until exercised against the selected project.


For reviewer management, bootstrap a platform admin after signup as described in the [README](./README.md#bootstrapping-a-platform-admin), then assign reviewers to schools. A school_admin role alone does not grant access to every school's cases.


## Main reconciliation - 2026-10-24

The previously local case editor, atomic edit/revalidation migration, required offer-letter fields, dashboard/deadline helpers, and PostgreSQL tests are now included in main. Existing reviewer/admin, notification, and optional extraction-provider work is preserved. The full suite passes 117 tests after a clean dependency installation. Earlier deployment, account-limit, and browser observations above are historical; no hosted migration, deployment, or authenticated Auth/Storage check was performed in this reconciliation.
