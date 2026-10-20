# TASKS.md

Reviewed: 2026-10-20 against committed main at 71fa5b1. Checked implementation tasks
indicate source and automated-test evidence, not a completed hosted/browser rollout.
Unpublished local v1 work is excluded. See REPO_AUDIT.md and PROJECT_STATUS.md.

## Immediate repo audit

- [x] Audit the starter scaffold and document what is real vs mocked
- [ ] Verify auth works end to end
- [ ] Verify protected routes behave correctly
- [ ] Verify database tables exist and match SPEC.md
- [ ] Verify seeded demo data loads correctly
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

- [ ] Detect `employer_name` changes after approval
- [ ] Detect `work_location` changes after approval
- [ ] Detect `start_date` changes after approval
- [ ] Detect `end_date` changes after approval
- [ ] Move approved cases to `change_pending` when required
- [x] Add user-facing warning banner and explanation for `change_pending`

## Documents

- [x] Harden document upload flow
- [x] Support document version records
- [x] Create extracted-field placeholder handling
- [x] Add support for confidence score display
- [x] Add support for manual correction flags
- [x] Link missing extracted fields to blocker requirements where appropriate

## Case detail UX

- [x] Add next recommended action to case detail page
- [x] Add blocker count to case header
- [x] Add warning count to case header
- [ ] Add upcoming deadline count to case header
- [ ] Improve progress tracking visibility

## Dashboard UX

- [ ] Verify active cases widget logic
- [ ] Verify blocked cases widget logic
- [ ] Verify upcoming deadlines widget logic
- [ ] Verify ready-for-submission widget logic
- [ ] Improve recent activity feed usefulness
- [ ] Improve important alerts section

## Data and templates

- [x] Seed one default school record
- [x] Seed one default CPT school template
- [x] Verify template config shape supports future growth
- [x] Ensure case creation uses the selected template correctly

## Validation and robustness

- [x] Add server-side validation for create case flow
- [x] Add server-side validation for case updates
- [ ] Add graceful error handling for failed data operations
- [ ] Verify form validation and user feedback for bad inputs

## Tests

- [x] Add tests for deterministic requirement evaluation
- [x] Add tests for blocker vs warning classification
- [x] Add tests for ready-for-submission evaluation
- [x] Add tests for status transition rules
- [ ] Add tests for change-triggered revalidation behavior

## Cleanup

- [x] Remove duplicated requirement logic from UI components
- [ ] Refactor any oversized generated components
- [x] Improve naming and type clarity where needed
- [x] Update docs after each major phase

## Clarifications and remaining release checks

- Sensitive-change detection helpers exist in src/lib/cases/status.ts. The four detection
  tasks and change_pending mutation remain open until a committed case-edit flow calls them
  and verifies persistence/history. The warning banner also handles reviewer requests.
- Seed SQL exists; hosted table/seed verification remains unchecked.
- Case detail shows days to start, not a distinct upcoming-deadline count.
- Dashboard blocker/ready summaries exist, but lifecycle-aware counts and deadline edge cases
  still need hardening/verification. Some reads turn errors into empty results.
- Existing workflow tests cover deterministic evaluation, transition and manual-review behavior.
  They mock database/provider boundaries; main has no isolated PostgreSQL migration suite.

## Existing extensions outside student v1 scope

- [x] School-assigned reviewer queue, detail, and atomic decisions.
- [x] Platform-admin reviewer assignment/revocation and first-admin bootstrap.
- [x] Case-status notification trigger and bell with Realtime/polling fallback.
- [x] Optional Anthropic extraction provider with mocked-response tests.

## Hosted release checklist

- [ ] Confirm the intended backend is active and obtain matching browser/server configuration.
- [ ] Inspect hosted migration history and apply pending checked-in migrations.
- [ ] Regenerate Supabase types if the hosted schema differs.
- [ ] Configure Site URL, callback allowlist, email templates, and optional Google provider.
- [ ] Verify signup, confirmation, login/logout, password recovery, and protected routes.
- [ ] Verify create/list/detail, actual Storage upload/download, versioning, and manual review.
- [ ] Verify submission/resubmission, reviewer school scope, and timeline/audit persistence.
- [ ] Publish and verify the approved-edit/revalidation increment before claiming v1 complete.

Historical 2026-10-08 backend restoration and Docker failures are recorded in PROJECT_STATUS.md.
They were not rechecked in this documentation pass.
