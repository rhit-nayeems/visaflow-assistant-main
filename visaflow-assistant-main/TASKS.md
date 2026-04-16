# TASKS.md

## Immediate repo audit

- [ ] Audit the starter scaffold and document what is real vs mocked
- [ ] Verify auth works end to end
- [ ] Verify protected routes behave correctly
- [ ] Verify database tables exist and match SPEC.md
- [ ] Verify seeded demo data loads correctly
- [ ] Verify landing page, dashboard, cases list, create flow, and case detail page all work
- [ ] Note any broken or inconsistent generated code that should be cleaned first

## Requirement evaluation engine

- [ ] Create a central deterministic CPT requirement evaluator
- [ ] Implement blocker vs warning separation
- [ ] Implement readiness evaluation for `ready_for_submission`
- [ ] Add plain-English explanation output for all requirement results
- [ ] Wire requirement evaluation into case detail view
- [ ] Wire requirement summaries into dashboard counts/cards

## Status transition engine

- [ ] Create a central case status transition module
- [ ] Prevent invalid transitions
- [ ] Add controlled status update logic to case update flows
- [ ] Generate timeline events on important status changes
- [ ] Generate audit log entries on important status changes

## Change-triggered revalidation

- [ ] Detect `employer_name` changes after approval
- [ ] Detect `work_location` changes after approval
- [ ] Detect `start_date` changes after approval
- [ ] Detect `end_date` changes after approval
- [ ] Move approved cases to `change_pending` when required
- [ ] Add user-facing warning banner and explanation for `change_pending`

## Documents

- [ ] Harden document upload flow
- [ ] Support document version records
- [ ] Create extracted-field placeholder handling
- [ ] Add support for confidence score display
- [ ] Add support for manual correction flags
- [ ] Link missing extracted fields to blocker requirements where appropriate

## Case detail UX

- [ ] Add â€œnext recommended actionâ€ to case detail page
- [ ] Add blocker count to case header
- [ ] Add warning count to case header
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

- [ ] Seed one default school record
- [ ] Seed one default CPT school template
- [ ] Verify template config shape supports future growth
- [ ] Ensure case creation uses the selected template correctly

## Validation and robustness

- [ ] Add server-side validation for create case flow
- [ ] Add server-side validation for case updates
- [ ] Add graceful error handling for failed data operations
- [ ] Verify form validation and user feedback for bad inputs

## Tests

- [ ] Add tests for deterministic requirement evaluation
- [ ] Add tests for blocker vs warning classification
- [ ] Add tests for ready-for-submission evaluation
- [ ] Add tests for status transition rules
- [ ] Add tests for change-triggered revalidation behavior

## Cleanup

- [ ] Remove duplicated requirement logic from UI components
- [ ] Refactor any oversized generated components
- [ ] Improve naming and type clarity where needed
- [ ] Update docs after each major phase
