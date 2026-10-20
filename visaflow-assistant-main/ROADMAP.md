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

## Current progress (2026-10-20)

Reviewed against main at 71fa5b1. This table records committed implementation,
not a completed hosted rollout or unpublished work from another checkout.

| Phase            | Current state                                                    | Remaining work                                                       |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1: Scaffold      | Auth, pages, schema and seed SQL exist                           | Live auth, route, page and hosted schema/seed verification           |
| 2: Requirements  | Shared deterministic evaluator, explanations, blocker/warning UI | Stronger required offer-letter field checks remain local work        |
| 3: Transitions   | Shared graph, authenticated workflows, atomic reviewer decisions | Live lifecycle verification; history is not uniformly atomic         |
| 4: Revalidation  | Sensitive-change helpers and change_pending guidance exist       | Commit dedicated approved-edit flow and atomic persistence/history   |
| 5: Documents     | Versions, extraction lifecycle, manual review, retries           | Live Storage/provider verification                                   |
| 6: UX            | Counts, next action, progress, alerts exist                      | Dashboard/deadline edge cases, load failures, v1 detail refinements  |
| 7: Tests/cleanup | Full npm test suite and CI exist                                 | Database integration/browser coverage and optional component cleanup |

School reviewer/admin tools, case-status notifications, and optional Anthropic extraction
already exist as extensions; their presence does not expand the student CPT v1 contract.
The future-phase list above describes v1 priorities rather than claiming no extension code exists.

Priority: review/publish the local edit/revalidation increment, verify the intended hosted
schema/configuration, then run authenticated Auth/Storage and case workflows. The local
117-test report and October editor migration are not evidence for committed main.
See [TASKS.md](./TASKS.md), [REPO_AUDIT.md](./REPO_AUDIT.md), and
[PROJECT_STATUS.md](./PROJECT_STATUS.md) for evidence and remaining checks.
