# AGENTS.md

## Project

VisaFlow is a CPT workflow platform for international students.

This is a workflow/case-management product, not:

- a generic to-do app
- a generic document uploader
- a legal advice chatbot
- an unrestricted AI assistant

The core value is structured workflow orchestration:

- CPT case tracking
- school-template-based requirements
- document handling
- blocker/warning evaluation
- deadline visibility
- audit history
- change-triggered revalidation

## Read first

Before making changes, always read:

1. SPEC.md
2. ROADMAP.md
3. TASKS.md

Do not start coding until you understand:

- the product scope
- what is in v1
- what is out of scope
- the highest-priority unchecked tasks

## Working style

- Preserve the existing existing UI structure unless a task explicitly requires UI changes.
- Prefer small, modular, high-confidence changes.
- Keep business logic out of presentational components.
- Do not redesign the product without a clear task asking for it.
- Do not replace the stack unless explicitly instructed.
- Do not implement speculative features outside the current phase.
- Do not invent immigration/legal rules beyond the documented product spec.
- Keep deterministic rules separate from any future AI-assisted logic.

## Architecture expectations

The app should evolve toward this structure:

- UI layer: pages, forms, presentational components
- Application layer: case workflow, requirement evaluation, transitions
- Data layer: Supabase tables, queries, storage
- Event/history layer: timeline events, notifications, audit logs

Business logic should be centralized and reusable.
Avoid duplicating requirement logic inside multiple UI components.

## Product expectations

For v1:

- CPT only
- one school template initially
- deterministic requirement evaluation
- case status transitions
- audit logging
- change-triggered revalidation for approval-sensitive fields

Out of scope for v1:

- OPT
- STEM OPT
- SEVIS integration
- real OCR/document AI parsing
- advisor portal
- admin portal
- employer portal
- legal advice engine
- broad chatbot behavior

## Core business rules

- A case becomes `ready_for_submission` only when all blocker requirements are satisfied.
- Missing required offer-letter fields create blocker requirements.
- Warnings and blockers are separate.
- If `employer_name`, `work_location`, `start_date`, or `end_date` changes after approval, the case moves to `change_pending`.
- Every blocker and warning must have a plain-English explanation.
- Every important case update must create timeline and/or audit history where appropriate.

## Commands

Update these if the repo uses different scripts.

Typical commands:

- install: `npm install`
- dev: `npm run dev`
- build: `npm run build`
- lint: `npm run lint`
- test: `npm test`

If backend or Supabase local workflows exist, detect and use the repoâ€™s actual commands instead of assuming.

## Definition of done

A task is done only if:

1. The code compiles or builds successfully.
2. The relevant flow works.
3. Existing behavior is not broken.
4. New business logic is implemented in a reusable place.
5. Tests are added where practical for logic-heavy changes.
6. Any schema or migration changes are clearly documented.
7. A brief summary of what changed is provided.

## When asked to implement work

Follow this order:

1. Understand current repo state
2. Compare repo state to SPEC.md and TASKS.md
3. Implement the smallest correct increment
4. Verify behavior
5. Report what changed and what remains mocked
