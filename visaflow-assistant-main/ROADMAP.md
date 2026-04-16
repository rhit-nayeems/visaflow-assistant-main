# ROADMAP.md

## Goal
Evolve the Lovable starter into a serious workflow product in staged, controlled increments.

---

## Phase 1 - Harden the Lovable scaffold
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