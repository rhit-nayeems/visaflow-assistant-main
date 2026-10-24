# VisaFlow — Project Status

Last updated: 2026-10-08.

Documentation synchronized: 2026-10-11. Verification and deployment results below are from
2026-10-08; this documentation pass did not rerun live backend or account-status checks.

Public deployment: [VisaFlow](https://visaflow-assistant.ledgerly-benefits.workers.dev).
Cloudflare version `7ad270f5-1091-460b-abf3-e90f73428a4b` was published on 2026-10-08.
The public landing page and guest dashboard-to-login redirect were verified in Chrome.
The deployment preserves the existing Supabase URL/key pair; connection to the selected
paused project and hosted migrations remain pending.

VisaFlow is a student CPT workflow platform built with React, TanStack Start, Cloudflare Workers, and Supabase. The current v1 implementation has deterministic school-template requirements, private document handling, case transitions, history, and approved-change revalidation.

## Current verification

- 117 automated tests passed, including real PostgreSQL migration/RPC tests with PGlite.
- Production build and TypeScript passed; lint has zero errors and seven existing Fast Refresh warnings.
- Dependency audit reports zero vulnerabilities.
- The landing page and signed-out dashboard redirect were verified in Chrome.
- Hosted Auth/Storage and authenticated browser flows remain pending. The selected `visaflow-assistant` project is paused; Supabase rejected restoration due to the two-active-free-project limit. Docker Desktop failed to start, preventing a local Supabase service check.

The existing environment points to a different Supabase project. It was preserved rather than pairing a new project URL with an unrelated key. No unrelated project has been paused.

## V1 behavior

Students create CPT cases against the default school template, supply internship details and documents, and resolve evaluated blockers. Warnings do not block readiness. The default offer letter must contain reviewed employer, job title, start/end dates, and job duties.

An internship-details editor calls an authenticated server workflow and atomic database RPC. Approved changes to employer, work location, start date, or end date cause `change_pending` and create field audit entries and timeline guidance. Non-sensitive edits retain approval; submitted, denied, and completed cases reject edits. Optimistic version checks reject stale saves. Submission checks both blocker readiness and unresolved document reevaluation.

The dashboard and case header show actionable counts, upcoming internship starts, progress, and clear next actions. Error states distinguish failed data operations from empty results. Existing reviewer/admin features remain in the codebase and are outside the narrow student v1 completion scope.

## Database change

`supabase/migrations/20261008214723_complete_v1_case_editing_and_revalidation.sql` adds the edit RPC, transactional history, ownership/lifecycle guards, and four additional required offer-letter fields to the default template. It backfills pending fields for pre-submission/change-pending default cases and invalidates stale ready cases. The database suite applies all migrations and tests these behaviors, including rollback and authorization.

Apply migrations to the restored hosted project before using the editor. Regenerate the generated Supabase types afterward; `src/integrations/supabase/workflow-schema.ts` provides the additive RPC type until then.

## Extraction and scope

Default extraction is local text-pattern/stub behavior with manual field review. Real OCR is not implemented in v1. An optional Anthropic provider already exists, but no provider key was configured or live extraction verified. OPT, STEM OPT, SEVIS, legal advice, broad chatbot behavior, email automation, and new portals remain outside v1 scope.

## Release follow-through

Restore the selected hosted project after resolving the free-project limit, inspect/apply migration history, align browser and server environment values, configure auth redirects, and verify live signup/login, authenticated pages, uploads, submission, and reapproval. These are release blockers rather than unfinished local workflow code.

See the root [REPO_AUDIT.md](../REPO_AUDIT.md), [TASKS.md](../TASKS.md), and application [README.md](./README.md) for details and commands. Root npm scripts delegate to this application; dependencies are maintained here.


## Main reconciliation - 2026-10-24

The previously local case editor, atomic edit/revalidation migration, required offer-letter fields, dashboard/deadline helpers, and PostgreSQL tests are now included in main. Existing reviewer/admin, notification, and optional extraction-provider work is preserved. The full suite passes 117 tests after a clean dependency installation. Earlier deployment, account-limit, and browser observations above are historical; no hosted migration, deployment, or authenticated Auth/Storage check was performed in this reconciliation.
