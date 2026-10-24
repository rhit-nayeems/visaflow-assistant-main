# ROADMAP.md

## Goal

Evolve the starter scaffold into a serious workflow product in staged, controlled increments.

---

## Phase 1 - Harden the starter scaffold

### Objective

Verify that the starter app is structurally sound and aligned with the product spec.

### Deliverables

- verify auth flow
- verify routing and protected routes
- verify Supabase schema and seeded demo data
- verify dashboard, cases list, create flow, and case detail pages
- identify what is real vs mocked
- clean obvious type issues or broken wiring

### Success criteria

- app runs locally
- core pages load
- mock/demo flows work consistently
- current repo state is documented

---

## Phase 2 - Requirement evaluation engine

### Objective

Implement deterministic CPT requirement evaluation.

### Deliverables

- central requirement evaluation module/service
- blocker vs warning logic
- ready-for-submission logic
- plain-English explanations for every requirement result
- integration with case detail and dashboard summaries

### Success criteria

- requirement results come from reusable logic, not scattered UI conditions
- cases correctly reflect missing requirements
- blockers and warnings are clearly separated

---

## Phase 3 - Case status transition engine

### Objective

Formalize workflow state transitions.

### Deliverables

- central status transition logic
- protection against invalid transitions
- timeline events for important status changes
- audit log entries for status changes

### Success criteria

- transitions are deterministic
- UI reflects controlled lifecycle states
- history is created automatically

---

## Phase 4 - Change-triggered revalidation

### Objective

Detect approval-sensitive changes and force re-review behavior.

### Deliverables

- detect changes to:
  - employer_name
  - work_location
  - start_date
  - end_date
- if changed after approval, move case to `change_pending`
- generate timeline/audit events
- show warning banner and next-step guidance

### Success criteria

- approved cases do not silently accept sensitive changes
- users can clearly see when reapproval may be required

---

## Phase 5 - Document handling hardening

### Objective

Improve the document layer so it is ready for deeper logic later.

### Deliverables

- cleaner upload flow
- document version support
- extracted field placeholder structure
- confidence score support
- manual correction flags
- improved document-related requirement wiring

### Success criteria

- document data model is ready for future parsing logic
- UI can display extracted/missing fields cleanly

---

## Phase 6 - UX refinement

### Objective

Make the app more polished and more obviously product-grade.

### Deliverables

- next recommended action on case detail page
- better progress tracker
- stronger alert banners
- better empty/loading/error states
- improved case header summaries
- clearer dashboard prioritization

### Success criteria

- the app is easy to demo
- users can understand status and next steps quickly

---

## Phase 7 - Testing and cleanup

### Objective

Make the app easier to trust and extend.

### Deliverables

- tests for requirement evaluation
- tests for status transitions
- tests for change-triggered revalidation
- cleanup duplicated logic
- update docs where needed

### Success criteria

- logic-heavy code has test coverage
- main flows remain stable during future iterations

---

## Future phases (not current priority)

These are intentionally deferred:

- OPT support
- admin portal
- advisor portal
- employer portal
- real OCR/document parsing
- grounded AI explanation layer
- email automation
- analytics/reporting for school staff

## V1 progress — 2026-10-08

The local implementation for phases 2–7 is in place: deterministic evaluation, status controls, sensitive approved edits with atomic history, document review/version handling, deadline/progress summaries, error states, and reusable logic tests. The complete migration chain and real PostgreSQL edit workflow are tested. All 117 tests, production build/typecheck, and lint pass (seven existing Fast Refresh warnings).

Phase 1 live verification remains open. The authorized hosted project (`visaflow-assistant`, `cryimllpsevwelcsagih`) cannot be restored while the organization is at its free-project limit. Docker Desktop startup also failed. Apply migrations and matching environment configuration after restoration, then verify authenticated pages and real Auth/Storage flows before declaring the hosted v1 release complete. See TASKS.md and REPO_AUDIT.md for the remaining release checklist.

## Documentation and publication — 2026-10-11

The app was published on 2026-10-08 at [VisaFlow](https://visaflow-assistant.ledgerly-benefits.workers.dev). Public pages and the guest dashboard redirect were verified on that date. Publication preserves the existing backend settings and does not complete the selected-project migration or authenticated-flow verification. The restoration/free-project-limit and Docker failures above describe the last verification attempt, not a fresh account-status check.

Documentation is synchronized across the READMEs, audit, architecture, project status, deployment guide, roadmap, and task list. The application-directory audit points to the canonical root audit. Historical portfolio exports are labeled separately; their embedded older test counts are not current release evidence. SPEC.md and AGENTS.md remain the product contract and working instructions.


## Main reconciliation - 2026-10-24

The local v1 implementation and PostgreSQL tests are now included in main alongside the existing reviewer/admin, notification, and optional extraction extensions. All 117 tests pass after a clean dependency installation. Hosted configuration, migration application, and authenticated Auth/Storage checks remain open; historical backend status was not rechecked.
