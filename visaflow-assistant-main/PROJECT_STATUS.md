# VisaFlow project status

Reviewed: 2026-10-20 against main at 71fa5b1 and this documentation update.
See [REPO_AUDIT.md](./REPO_AUDIT.md) for current verification results.

## Implemented in main

The student CPT workflow includes email/password authentication, recovery and OAuth callback
handling, protected routes, case creation, document uploads/version registration, deterministic
requirement evaluation, submission/resubmission, notes, timeline, and audit displays.
Supabase reads use RLS; case server functions validate inputs and use authenticated,
user-scoped clients. Reviewer decisions and manual extracted-field review use atomic SQL RPCs.

The default template requires an offer letter, employer, job title, job duties, dates,
advisor approval, course registration, and a lead-time warning. Employer/title/dates are
currently case-field requirements; job duties is an extracted offer-letter field.
Warnings remain separate from blockers.

Existing extensions include school-assigned reviewer queues and decisions, platform-admin
reviewer assignment/revocation, a first-admin bootstrap path, and case-status notifications.
These do not expand the student v1 contract in [SPEC.md](./SPEC.md).
The notification bell uses Realtime plus focus and 60-second polling fallbacks; email
and document-expiry reminders are deferred.

## Extraction

Without ANTHROPIC_API_KEY, extraction uses the local text-pattern stub, which does not
provide real OCR for scanned/binary documents. Manual field review and retry handling exist.
With a key, the optional Anthropic Messages provider sends native PDF/image content or text
and requests structured CPT fields. Its configured default model is claude-haiku-4-5,
overridable with ANTHROPIC_EXTRACTION_MODEL. Tests mock provider network responses;
they do not establish live extraction accuracy or deployed credential configuration.

## Remaining student v1 work

The shared status module detects sensitive approved changes, but main has no dedicated
internship-details editor or atomic edit/revalidation RPC that exercises that rule.
End-to-end approved employer/location/date revalidation is therefore incomplete.
Case details show blockers, warnings, next action, documents, and days to start; dashboard
counts and some error handling still need hardening and targeted verification.

The original working directory contains unpublished work for an editor, stronger required
letter fields, shared dashboard/deadline summaries, and PostgreSQL migration tests, including
20261008214723_complete_v1_case_editing_and_revalidation.sql. Those files are absent from
the audited main revision. This documentation update does not publish them or count their
117-test report as main's verification. Review and commit that work separately.

## Backend and release verification

There are 18 checked-in SQL migrations, through 20260610130000_bootstrap_platform_admin.sql.
Migration files describe intended database state; they do not prove a hosted project has
applied it. Main has no test:database script or isolated PostgreSQL migration suite.
Server tests largely use mocked Supabase clients.

Prior local release notes recorded a public Worker publication on 2026-10-08 at
[VisaFlow](https://visaflow-assistant.ledgerly-benefits.workers.dev), with public-page and
guest redirect verification. They also recorded a failed restoration of the selected
visaflow-assistant backend (cryimllpsevwelcsagih) due to the free-project limit and a failed
Docker Desktop startup. These are historical observations, not fresh service-status checks.
This audit did not restore a project, deploy, inspect hosted migrations, or run authenticated
browser/Auth/Storage flows.

Before calling v1 release-ready, finish the missing edit flow, confirm the intended backend,
inspect/apply migrations, align browser/server settings and redirects, and verify signup,
recovery, case creation/list/detail, actual uploads/downloads, review, submission, and
approved-change revalidation. Use [TASKS.md](./TASKS.md) for the checklist.

OPT/STEM OPT, SEVIS, broad chatbot/legal advice, advisor/employer portals, and email automation
remain outside v1. Historical portfolio images are explained in their
[README](./public/projects/visaflow/README.md).
