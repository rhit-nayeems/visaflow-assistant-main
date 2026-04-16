# SPEC.md

## Product name
VisaFlow

## One-line summary
VisaFlow is a CPT workflow assistant for international students that manages cases, requirements, documents, deadlines, and approval progress in a structured way.

## Problem
International students often manage CPT through scattered school pages, PDFs, emails, advisor instructions, and manual reminders. That leads to:
- incomplete offer letters
- missed steps
- deadline risk
- unclear next actions
- poor visibility into application readiness

## Product goal
Turn CPT into a structured workflow system instead of an informal checklist process.

The app should help students:
- create and track a CPT case
- understand what is missing
- see blockers vs warnings
- upload and review documents
- track deadlines and progress
- see why a case is not ready
- maintain a clear history of changes

## Primary user
- Student

## Future users
These may be added later, but are not part of v1:
- School admin / international office
- Academic advisor
- Employer contact

## V1 scope
V1 supports:
- CPT only
- one school template initially
- one primary user role: student

### V1 features
- Authentication
- Dashboard
- CPT cases list
- Create CPT case flow
- Case detail page
- Document upload and version-friendly structure
- Requirement tracking
- Timeline
- Audit log
- Alerts/reminders UI and data model
- Deterministic requirement evaluation
- Case status transitions
- Change-triggered revalidation for key fields

## Out of scope for V1
- OPT
- STEM OPT
- SEVIS integration
- real OCR / document AI parsing
- advisor portal
- school admin portal
- employer portal
- automated email sending
- legal advice engine
- advanced cross-school workflow management
- multi-tenant enterprise administration

## Product principles
1. This is a workflow product, not a generic productivity app.
2. Users should always know what to do next.
3. Deterministic rules should drive readiness and status.
4. AI, if added later, should assist explanation/extraction, not replace rules.
5. Every blocker and warning must be understandable in plain English.
6. Important changes should be visible in history.

## Core entities
- profiles
- schools
- school_templates
- cases
- documents
- extracted_fields
- case_requirements
- case_timeline_events
- notifications
- audit_logs

## Case statuses
The workflow uses structured statuses, not loose tags.

Allowed statuses:
- `draft`
- `missing_documents`
- `in_progress`
- `blocked`
- `ready_for_submission`
- `submitted`
- `approved`
- `denied`
- `change_pending`
- `completed`

## Core business rules
1. A case becomes `ready_for_submission` only when all blocker requirements are satisfied.
2. Missing required offer-letter fields create blocker requirements.
3. Warnings and blockers must be tracked separately.
4. If `employer_name`, `work_location`, `start_date`, or `end_date` changes after approval, the case must move to `change_pending`.
5. Every blocker must include a plain-English explanation.
6. Every warning must include a plain-English explanation.
7. Important updates should create timeline and/or audit entries.
8. The case detail page should clearly show:
   - current status
   - blockers
   - warnings
   - next recommended action

## Default CPT template behavior
The initial default CPT school template should support configurable requirements such as:
- required offer letter
- required job title
- required job duties
- required start date
- required end date
- requires advisor approval
- requires course registration
- lead-time warning days

## Case lifecycle expectations
A typical case flow in v1 should look like:
- user creates case
- user fills internship details
- user uploads offer letter
- system evaluates requirements
- system shows blockers/warnings
- user resolves blockers
- case becomes `ready_for_submission`
- later statuses like `submitted` or `approved` can be tracked manually or through product actions
- if approval-sensitive fields change after approval, case becomes `change_pending`

## Document handling expectations
V1 should support:
- document upload
- document record creation
- file metadata storage
- document type tracking
- document version support structure
- extracted field placeholders
- mock or seeded extracted field display if real parsing is not implemented

V1 should not claim real document intelligence if it is still mocked.

## Dashboard expectations
The dashboard should surface:
- active CPT cases
- blocked cases
- upcoming deadlines
- ready-for-submission cases
- recent activity
- important alerts

## Acceptance criteria
The following behaviors must be true for v1:

1. A user can create a CPT case.
2. A user can view all CPT cases.
3. A user can open a case detail page.
4. The system can display requirements with status, severity, and explanation.
5. The system can distinguish blockers from warnings.
6. A case becomes `ready_for_submission` only when all blocker requirements are satisfied.
7. A case with missing required data can display as `blocked` or otherwise not ready, with clear reasons.
8. Changing `employer_name`, `work_location`, `start_date`, or `end_date` after approval moves the case to `change_pending`.
9. Important case changes appear in timeline and/or audit history.
10. The app remains clean, polished, and demoable.

## Non-goals
This product does not:
- make legal determinations
- replace a DSO
- file government forms
- guarantee immigration compliance
- provide official authorization