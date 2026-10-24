# VisaFlow v1 audit

Last verified: 2026-10-08. Scope: the student CPT workflow in SPEC.md.

Documentation synchronized: 2026-10-11. This is the canonical audit; the application-directory
audit links here. Verification results below retain their original date rather than claiming
a new test or live-backend check. Architecture and deployment instructions have been reconciled
with the edit/revalidation workflow, current extraction-provider options, and runtime setup.

Public app: [VisaFlow](https://visaflow-assistant.ledgerly-benefits.workers.dev), deployed to
Cloudflare Workers on 2026-10-08 (version `7ad270f5-1091-460b-abf3-e90f73428a4b`).
Production build/typecheck and Wrangler dry-run passed. The public landing page and guest
dashboard redirect were verified in Chrome. Existing matching backend settings were deployed
as encrypted bindings, and temporary deployment settings were removed afterward. This publishes
the app without completing the paused-project restoration or hosted v1 backend rollout.

## Implemented

- Supabase email/password authentication, protected routes, profiles, private document storage, and RLS-backed case reads and mutations.
- One seeded default school/CPT template, structured employment details, and a reusable deterministic evaluator with separate blockers/warnings and plain-English explanations.
- Document registration and version records, extraction lifecycle, confidence/manual-review fields, and requirement reevaluation. Default offer letters require reviewed employer, job title, start date, end date, and job duties.
- Controlled case transitions, submission guards, timeline/audit history, and an internship-details editor with date validation and concurrent-edit protection.
- Approved employer/location/date edits atomically become `change_pending`, with field audit entries and reapproval guidance. Non-sensitive edits preserve approval. Submitted, denied, and completed cases reject detail edits.
- Dashboard counts and upcoming-start deadlines use shared, tested logic; case details show progress, blockers, warnings, deadlines, and a lifecycle-aware next action. Data failures are visible instead of appearing as empty results.
- Existing school-scoped reviewer/admin code and optional extraction-provider code remain available; those are pre-existing extensions rather than additions to student v1 scope.

## Verification

- `npm test`: 117 passed, zero failed.
- `npm run build`: client/server production build and TypeScript passed.
- `npm run lint`: zero errors; seven existing Fast Refresh warnings.
- `npm audit`: zero reported vulnerabilities after compatible dependency updates.
- Database tests apply every checked-in migration to an isolated PGlite PostgreSQL engine. Tests exercise the actual edit RPC and server workflow, each sensitive approved field, direct-update safeguards, ownership, stale updates, rollback when history cannot be written, required letter fields, and invalid lifecycle/date changes.
- Chrome: landing page loads; a signed-out dashboard visit redirects to login.
- Live signup/login, storage upload/download, and authenticated page flows are still unverified against the selected hosted project. PGlite supplies minimal auth/storage schema fixtures; it does not run Supabase Auth or Storage services.

## Release setup still required

The user selected the CLI-linked `visaflow-assistant` project (`cryimllpsevwelcsagih`). Supabase rejected restoration because the organization already has two active free projects. No unrelated project was paused. The existing `.env` URL points to a different project; its configuration was preserved until matching credentials can be obtained from the selected project.

Docker Desktop was also unable to start locally: its inference-manager listener failed during initialization. The local Supabase stack therefore could not provide an alternative live Auth/Storage check. The Docker configuration/data were not reset.

Once the chosen hosted project is active:

1. Inspect its migration history and apply the checked-in migrations from `visaflow-assistant-main`, including `20261008214723_complete_v1_case_editing_and_revalidation.sql`.
2. Configure matching browser/server URL and publishable-key values for that project in the application `.env`. Configure auth redirect origins for the intended app URL.
3. Regenerate Supabase types; the additive edit-RPC contract currently lives in `workflow-schema.ts`.
4. Verify signup/login/logout, case creation/list/detail, actual uploads and manual field review, submission, and approved-change revalidation against that database.

The new migration extends only the default CPT template, adds missing pending letter requirements to existing pre-submission/change-pending cases, and moves stale ready cases with those blockers back to blocked. It adds atomic edit/history behavior and guards status transitions and immutable ownership. Existing custom templates and approved/submitted legacy cases are not backfilled until normal reevaluation.

## Mocked and deferred

Without `ANTHROPIC_API_KEY`, document extraction uses local text-pattern/stub behavior. PDF/image OCR is not part of v1; students must manually review missing fields. The optional provider is not enabled or verified here. No broad AI assistant, OPT/STEM OPT, SEVIS integration, or legal determination is delivered by this work. Notifications are existing case-status notifications; document-expiry alerts and email automation are not claimed.

The v1 implementation and database logic are verified locally. A hosted release is not complete until the project activation/configuration and live checks above pass.


## Main reconciliation - 2026-10-24

Previously local implementation is now reconciled with GitHub main, including the October edit migration. A clean npm ci and all 117 tests pass. The install audit now reports five vulnerabilities (three moderate, two high); the historical zero-vulnerability result above is not current. No hosted configuration or data was changed. Production build/typecheck pass. Lint passes with seven existing Fast Refresh warnings. Environment files and Supabase CLI caches remain local and are no longer tracked.
