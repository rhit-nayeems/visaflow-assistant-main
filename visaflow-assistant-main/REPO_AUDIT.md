# Current Repo Audit

## Product Fit

- The repo is aligned to a CPT workflow product for students, not a generic checklist or chatbot.
- The current UI already covers the v1 page structure: landing, auth, dashboard, cases list, create flow, case detail, and settings.

## What Is Real

- Supabase email/password auth is wired in the client.
- The database schema includes profiles, schools, school templates, cases, documents, extracted fields, requirements, timeline events, notifications, audit logs, and notes.
- Cases, profile updates, notes, documents, and timeline events are using real Supabase reads and writes.
- Storage uploads are wired to the `case-documents` bucket.

## What Was Incomplete Before This Pass

- No default school or CPT template seed data existed, so the create-case flow had no selectable school/template records.
- Requirement rows were generated from UI code with generic pending states instead of a central deterministic evaluator.
- The `case_requirements` table was missing insert/delete policies, so requirement writes could fail under RLS.
- Dashboard blocker/ready counts were derived from raw case statuses instead of reusable requirement summaries.
- Status transition rules were hardcoded in UI logic instead of a shared module.
- Audit log UI existed, but status changes were not being written there.
- Starter-generator-specific auth/build references were still present in the repo.

## Still Mocked Or Deferred

- OCR/document parsing is still placeholder-only. Extracted fields can be stored and displayed, but no real parser populates them.
- There is still no server-side case mutation layer; writes happen directly from the client through Supabase.
- Approval-sensitive change revalidation logic is centralized, but there is not yet a dedicated case-edit flow that exercises it.
- Protected routing is enforced in the app shell, but there is not yet a server-side page loader strategy for all authenticated routes.
