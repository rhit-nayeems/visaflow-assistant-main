# VisaFlow repository audit

Reviewed: 2026-10-20. Source baseline: main at 71fa5b1.
This audit covers committed source and this documentation update. Unpublished local code
is described separately in [PROJECT_STATUS.md](./PROJECT_STATUS.md).

## Implemented behavior

- Auth forms, callback/recovery handling, protected app shell, profile/settings, and RLS-backed reads.
- Authenticated server mutations in src/server/cases/, with ownership checks, input validation,
  and normalized database errors.
- Default school/CPT template seed, deterministic evaluator, separate blockers and warnings,
  next-action guidance, and controlled status transitions.
- Private Storage upload integration, idempotent version registration, extraction lifecycle,
  latest-version manual review, retry/stale-processing handling, and submission guards.
- Atomic manual-review/reevaluation and reviewer decision RPCs with reviewer school scope checks.
- Platform-admin reviewer management/bootstrap and case-status notifications.
- Optional Anthropic PDF/image/text extraction; local text-pattern stub when no key is set.

## Verification

Verified on 2026-10-20 in a clean dependency installation from main at 71fa5b1:

- npm test: 87 passed, zero failed, across 11 explicitly listed files.
- npm run lint: zero errors; seven existing Fast Refresh warnings.
- npm run build: client/server production build and TypeScript passed. Vite reports
  a client chunk above 500 kB; the local Node runtime reports a module API deprecation.
- Local verification used Node.js 26.8.1/npm 12.0.2. CI is configured for Node.js 24.
- Build URL/key settings were placeholders; this is compilation evidence, not backend connectivity.
- No dependency audit, live backend/provider, hosted migration, or browser checks were run.

## Gaps and limits

- Sensitive-change detection exists in src/lib/cases/status.ts, but no committed case-details
  editor or atomic approved-edit workflow calls it. The corresponding v1 acceptance check is open.
- Main's default template does not require employer/title/dates to be extracted from the
  offer letter; those are case-field checks. Job duties is an extracted-field blocker.
- Dashboard counts/deadlines are computed in the page; failed data reads can appear empty.
- History is not uniformly atomic: reviewer decisions write history inside their RPC,
  while some student/extraction history uses best-effort application writes.
- Tests mock Supabase/provider boundaries. There is no committed PostgreSQL migration suite
  or frontend browser/component test suite.
- Hosted migration history, Auth/Storage, optional provider credentials, and authenticated
  page flows were not checked here. Historical deployment/account observations are dated
  in PROJECT_STATUS.md rather than asserted as current status.

## Database and setup

All 18 migrations live in supabase/migrations/, ending with the platform-admin bootstrap.
The extraction migration explicitly drops the earlier document-registration function before
changing its return type. Apply the complete chain to the intended backend and regenerate
src/integrations/supabase/types.ts when the hosted schema changes.

Run npm commands inside visaflow-assistant-main/; main has no root npm wrapper.
npm test is the full checked-in suite, npm run test:cases is a subset, and CI runs lint,
typecheck, and the full suite on pushes/PRs targeting main. Build is a separate local check.

The unpublished editor migration and 117-test report are not shipped main evidence.
See [TASKS.md](./TASKS.md) for remaining implementation and live release checks.
