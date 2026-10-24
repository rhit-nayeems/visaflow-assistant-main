# TASKS.md

## Immediate repo audit

- [x] Audit the starter scaffold and document what is real vs mocked
- [ ] Verify auth works end to end
- [ ] Verify protected routes behave correctly
- [ ] Verify hosted database tables exist and match SPEC.md
- [ ] Verify hosted seeded demo data loads correctly
- [ ] Verify landing page, dashboard, cases list, create flow, and case detail page all work
- [x] Note any broken or inconsistent generated code that should be cleaned first

## Requirement evaluation engine

- [x] Create a central deterministic CPT requirement evaluator
- [x] Implement blocker vs warning separation
- [x] Implement readiness evaluation for `ready_for_submission`
- [x] Add plain-English explanation output for all requirement results
- [x] Wire requirement evaluation into case detail view
- [x] Wire requirement summaries into dashboard counts/cards

## Status transition engine

- [x] Create a central case status transition module
- [x] Prevent invalid transitions
- [x] Add controlled status update logic to case update flows
- [x] Generate timeline events on important status changes
- [x] Generate audit log entries on important status changes

## Change-triggered revalidation

- [x] Detect `employer_name` changes after approval
- [x] Detect `work_location` changes after approval
- [x] Detect `start_date` changes after approval
- [x] Detect `end_date` changes after approval
- [x] Move approved cases to `change_pending` when required
- [x] Add user-facing warning banner and explanation for `change_pending`

## Documents

- [x] Harden document upload flow
- [x] Support document version records
- [x] Create extracted-field placeholder handling
- [x] Add support for confidence score display
- [x] Add support for manual correction flags
- [x] Link missing extracted fields to blocker requirements where appropriate

## Case detail UX

- [x] Add `next recommended action` to case detail page
- [x] Add blocker count to case header
- [x] Add warning count to case header
- [x] Add upcoming deadline count to case header
- [x] Improve progress tracking visibility

## Dashboard UX

- [x] Verify active cases widget logic
- [x] Verify blocked cases widget logic
- [x] Verify upcoming deadlines widget logic
- [x] Verify ready-for-submission widget logic
- [x] Improve recent activity feed usefulness
- [x] Improve important alerts section

## Data and templates

- [x] Seed one default school record
- [x] Seed one default CPT school template
- [x] Verify template config shape supports future growth
- [x] Ensure case creation uses the selected template correctly

## Validation and robustness

- [x] Add server-side validation for create case flow
- [x] Add server-side validation for case updates
- [x] Add graceful error handling for failed data operations
- [x] Verify form validation and user feedback for bad inputs

## Tests

- [x] Add tests for deterministic requirement evaluation
- [x] Add tests for blocker vs warning classification
- [x] Add tests for ready-for-submission evaluation
- [x] Add tests for status transition rules
- [x] Add tests for change-triggered revalidation behavior

## Cleanup

- [x] Remove duplicated requirement logic from UI components
- [ ] Refactor any oversized generated components
- [x] Improve naming and type clarity where needed
- [x] Update docs after each major phase

## Verification scope (2026-10-08)

Checked tasks represent implemented behavior with unit/server/PostgreSQL verification, not a completed hosted rollout. All 117 tests, the production build, and lint pass (seven existing warnings). PostgreSQL tests apply the complete migration chain and verify seeds, edit/revalidation, ownership, and transactional history. Chrome verifies the landing page and guest dashboard-to-login redirect.

The remaining auth/routing/page-flow checks require the selected Supabase project to be restored and configured. Supabase rejected restoration due to the active-free-project limit. Docker Desktop startup also failed, so live local Auth/Storage verification could not run. Oversized-component cleanup is optional follow-up, not a student v1 acceptance criterion.

## Hosted release checklist

- [ ] Restore `visaflow-assistant` (`cryimllpsevwelcsagih`) after resolving the free-project limit.
- [ ] Inspect hosted migration history and apply pending migrations, including the v1 edit/revalidation migration.
- [ ] Set matching browser/server Supabase environment values and configure auth redirects.
- [ ] Regenerate Supabase types from the migrated hosted project.
- [ ] Verify signup, login/logout, protected routes, create/list/detail, actual storage upload/download, manual field review, submission, and approved-change revalidation on the live backend.

## Documentation and publication â€” 2026-10-11

The app was published on 2026-10-08 at [VisaFlow](https://visaflow-assistant.ledgerly-benefits.workers.dev). Public pages and the guest dashboard redirect were verified on that date. Publication preserves the existing backend settings and does not complete the selected-project migration or authenticated-flow verification. The restoration/free-project-limit and Docker failures above describe the last verification attempt, not a fresh account-status check.

Documentation is synchronized across the READMEs, audit, architecture, project status, deployment guide, roadmap, and task list. The application-directory audit points to the canonical root audit. Historical portfolio exports are labeled separately; their embedded older test counts are not current release evidence. SPEC.md and AGENTS.md remain the product contract and working instructions.


## Main reconciliation - 2026-10-24

The local v1 implementation and PostgreSQL tests are now included in main alongside the existing reviewer/admin, notification, and optional extraction extensions. All 117 tests pass after a clean dependency installation. Hosted configuration, migration application, and authenticated Auth/Storage checks remain open; historical backend status was not rechecked.


## Existing extensions outside student v1 scope


- [x] School-assigned reviewer queue, detail, and atomic decisions.
- [x] Platform-admin reviewer assignment/revocation and first-admin bootstrap.
- [x] Case-status notification trigger and bell with Realtime/polling fallback.
- [x] Optional Anthropic extraction provider with mocked-response tests.
