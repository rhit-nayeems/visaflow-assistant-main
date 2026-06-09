# VisaFlow — System Architecture

_Last updated: 2026-06-09_

> Comprehensive architecture reference for VisaFlow, expressed primarily through Mermaid
> diagrams. It reflects the **current** state of `main`. Pair this with
> [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for status, risks, and gaps.

**Conventions**
- Paths are relative to the application root (the inner `visaflow-assistant-main/`).
- "Server function" = a `createServerFn` POST endpoint in `server/cases/actions.ts`.
- "RPC" = a Postgres function invoked via `supabase.rpc(...)`.
- All Mermaid blocks are standard GitHub‑flavored Mermaid.

---

## 1. System context

High‑level view of actors and external systems.

```mermaid
graph TB
    subgraph Actors
        Student["👤 Student<br/>(role: student)"]
        Reviewer["👤 Reviewer<br/>(role: school_admin)"]
    end

    subgraph VisaFlow["VisaFlow Application (TanStack Start on Cloudflare Workers)"]
        Browser["React 19 SPA / SSR<br/>(TanStack Router + React Query)"]
        ServerFns["Server Functions<br/>(createServerFn + requireSupabaseAuth)"]
    end

    subgraph Supabase["Supabase (managed)"]
        Auth["Auth<br/>(JWT / sessions)"]
        DB[("Postgres<br/>RLS + RPCs")]
        Storage["Storage<br/>bucket: case-documents"]
    end

    Student -->|"HTTPS"| Browser
    Reviewer -->|"HTTPS"| Browser

    Browser -->|"Bearer access_token<br/>(POST RPC calls)"| ServerFns
    Browser -->|"auth + RLS reads<br/>(roles, session)"| Auth
    Browser -->|"signed uploads"| Storage

    ServerFns -->|"user-scoped client<br/>(RLS enforced)"| DB
    ServerFns -->|"download for extraction"| Storage
    ServerFns -->|"getClaims(token)"| Auth

    DB -.->|"triggers: handle_new_user,<br/>handle_new_user_role"| Auth
```

---

## 2. Deployment & infrastructure

```mermaid
graph LR
    subgraph Client["Client (browser)"]
        SPA["VisaFlow UI<br/>Vite build, Tailwind v4"]
    end

    subgraph CF["Cloudflare Workers"]
        Entry["@tanstack/react-start/server-entry<br/>(nodejs_compat)"]
        SSR["SSR + Server Functions"]
    end

    subgraph SB["Supabase Project"]
        SBAuth["GoTrue Auth"]
        SBDb[("Postgres + RLS + RPCs")]
        SBStore["Object Storage<br/>case-documents"]
    end

    SPA <-->|"HTTP / fetch"| Entry
    Entry --> SSR
    SSR -->|"@supabase/supabase-js<br/>(publishable key + user JWT)"| SBDb
    SSR --> SBAuth
    SSR --> SBStore
    SPA -->|"VITE_SUPABASE_* (client)"| SBAuth
    SPA --> SBStore

    classDef infra fill:#eef,stroke:#88a;
    class CF,SB infra;
```

**Build & deploy chain**
- `vite build && tsc --noEmit` → `wrangler deploy`.
- Vite plugins: `@cloudflare/vite-plugin`, `tanstackStart`, `react`, `tailwindcss`,
  `vite-tsconfig-paths` (`@/*` alias).
- Env split: client uses `VITE_SUPABASE_*` (build‑time inlined); server uses
  `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`; the optional service‑role admin client
  uses `SUPABASE_SERVICE_ROLE_KEY` (RLS‑bypassing, server‑only).

---

## 3. Layered component architecture

```mermaid
graph TD
    subgraph Routes["Routing (src/routes/ — file-based)"]
        Root["__root.tsx → AuthProvider"]
        AuthGate["_authenticated.tsx (guard)"]
        StudentRoutes["cases/{index,new,$caseId}"]
        ReviewerRoutes["review/cases/{index,$caseId}"]
        PublicRoutes["login / signup / forgot / reset / callback / index"]
    end

    subgraph Components["UI (src/components/)"]
        FeatureCases["cases/<br/>CaseDetailPage, CreateCaseWizard,<br/>CasesListPage, ReviewerCase*Page"]
        AuthUI["auth/ AuthProvider + forms"]
        SharedUI["shared/ + ui/ (shadcn/Radix)"]
    end

    subgraph PureLib["Pure shared logic (src/lib/cases/) — client + server"]
        Reqs["requirements.ts<br/>evaluate + derive status"]
        Status["status.ts<br/>transition graph + guards"]
        ExtractState["document-extraction-state.ts<br/>stale/retry/manual predicates"]
    end

    subgraph ServerLayer["Backend (src/server/cases/)"]
        Actions["actions.ts<br/>(server-function definitions)"]
        Workflows["workflows.server.ts<br/>(mutations)"]
        ReviewerRead["reviewer-read.server.ts<br/>(reads)"]
        Authz["authz.server.ts<br/>(ownership + scope)"]
        Validation["validation.ts"]
        Extraction["document-extraction.ts (STUB)"]
        DocReg["document-registration.ts"]
        History["history.server.ts"]
        Errors["database-errors.ts"]
    end

    subgraph Integration["src/integrations/supabase/"]
        Mw["auth-middleware.ts<br/>requireSupabaseAuth"]
        ClientB["client.ts (browser, RLS)"]
        ClientS["client.server.ts (service role)"]
        Types["types.ts (generated schema)"]
    end

    DB[("Supabase Postgres<br/>RLS + RPCs")]
    Store["Supabase Storage"]

    Routes --> Components
    Components -->|"useServerFn + bearer headers"| Actions
    Components --> PureLib
    Components --> ClientB

    Actions --> Mw
    Actions --> Validation
    Actions --> Workflows
    Actions --> ReviewerRead

    Workflows --> Authz
    Workflows --> PureLib
    Workflows --> Extraction
    Workflows --> DocReg
    Workflows --> History
    Workflows --> Errors
    ReviewerRead --> Authz

    Mw --> ClientB2["request-scoped supabase client"]
    Workflows --> DB
    ReviewerRead --> DB
    Workflows --> Store
    Authz --> DB

    PureLib --> Types
    ServerLayer --> Types
```

---

## 4. Authentication & authorization layers

Authorization is enforced **redundantly** at three layers: server‑function query
filters, RPC internal checks, and Postgres RLS.

```mermaid
flowchart TD
    Start(["Client calls server function"]) --> Hdr{"Authorization:<br/>Bearer token present?"}
    Hdr -->|No| R401["401 Unauthorized"]
    Hdr -->|Yes| Claims["supabase.auth.getClaims(token)"]
    Claims -->|invalid / no sub| R401
    Claims -->|valid| Ctx["Inject context:<br/>{ supabase (user-scoped), userId, claims }"]

    Ctx --> Validate["validate* input validator"]
    Validate -->|invalid| Err400["Throws validation Error"]
    Validate -->|valid| Branch{"Student or<br/>Reviewer flow?"}

    Branch -->|Student| Own["loadOwnedCase / findOwnedCase<br/>.eq('user_id', userId)"]
    Branch -->|Reviewer| Role["assertSchoolAdminReviewer<br/>(user_roles has school_admin)"]

    Role --> Scope["loadReviewerSchoolIds<br/>(reviewer_school_assignments)"]
    Scope --> ReviewScope["findReviewableCase<br/>.in('school_templates.school_id', ids)<br/>.in('status', reviewable)"]

    Own --> Mutate["Workflow mutation"]
    ReviewScope --> Decision["apply_reviewer_case_decision RPC"]

    Mutate --> RLS["Postgres RLS re-checks ownership"]
    Decision --> RPCCheck["RPC re-checks can_review_case()<br/>+ school assignment"]
    RPCCheck --> RLS

    RLS --> OK(["Persisted + audited"])
```

**Key points**
- The request‑scoped Supabase client forwards the user JWT, so **every query the
  handler makes is RLS‑constrained** even before explicit `.eq("user_id", ...)` filters.
- Reviewer writes are restricted to the `apply_reviewer_case_decision` RPC (no direct
  case updates), which re‑validates `can_review_case()` plus school assignment.
- The service‑role client (`client.server.ts`) bypasses RLS and is server‑only.

---

## 5. Request flow — student: upload document → extract → re‑evaluate

```mermaid
sequenceDiagram
    autonumber
    actor S as Student (browser)
    participant ST as Supabase Storage
    participant A as registerUploadedCaseDocumentAction
    participant MW as requireSupabaseAuth
    participant W as workflows.server.ts
    participant RPC as register_case_document (RPC)
    participant EX as extractDocumentWithLocalStub
    participant DB as Postgres

    S->>ST: Upload file to {userId}/{caseId}/{regId}/...
    S->>A: POST registerUploadedCaseDocument (Bearer token)
    A->>MW: validate token
    MW->>DB: auth.getClaims(token)
    MW-->>A: context { supabase, userId }
    A->>W: registerUploadedCaseDocument(input)
    W->>W: loadOwnedCase + assert path prefix
    W->>RPC: register_case_document(...)
    RPC-->>W: document record (created_new, version_number)
    alt created_new && relevant to submission
        W->>DB: set needs_document_reevaluation = true
    end
    W->>DB: set extraction_status = processing
    W->>ST: download file buffer
    W->>EX: extract(documentType, buffer, fileName)
    alt extraction succeeded
        EX-->>W: normalized extracted fields
        W->>DB: replace extracted_fields, status = succeeded
        W->>DB: write timeline event (best-effort)
        opt status allows re-evaluation
            W->>W: reevaluateCaseAfterUploads(...)
            W->>DB: finalize_case_requirement_evaluation (RPC)
        end
    else extraction failed
        EX-->>W: failure
        W->>DB: status = failed + extraction_error
        W->>DB: write failure timeline event
    end
    W-->>S: { extractionStatus, extractedFieldCount, reevaluation* }
```

---

## 6. Request flow — student: manual extracted‑field review (atomic)

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant A as saveManualExtractedFieldsAction
    participant W as saveManualExtractedFields
    participant L as lib/cases (pure)
    participant RPC as apply_manual_extracted_field_review (RPC)
    participant DB as Postgres

    S->>A: POST { caseId, fields[] }
    A->>W: validated input
    W->>DB: load case + template + documents + extracted_fields
    W->>W: assert canRerunDeterministicEvaluation(status)
    W->>L: getLatestEditableExtractedFields (blocker-level, latest versions)
    W->>W: build projected in-memory document/field state
    W->>L: evaluateCaseRequirements + deriveCaseStatusFromRequirements
    W->>W: assertValidCaseStatusTransition
    Note over W: No DB writes until everything is validated & computed
    W->>RPC: apply_manual_extracted_field_review(<br/>field edits + status repair + reevaluation)
    RPC->>DB: commit ALL changes in one transaction
    RPC-->>W: ok
    W->>DB: audit log + timeline + status history (best-effort)
    W-->>S: { status, requirementCount, updatedFieldCount }
```

> Rationale: a later reevaluation‑persistence failure cannot leave partial primary‑state
> commits behind, because edits + status repair + reevaluation are one atomic RPC.

---

## 7. Request flow — reviewer decision

```mermaid
sequenceDiagram
    autonumber
    actor R as Reviewer (school_admin)
    participant A as approve/deny/requestChanges Action
    participant W as transitionSubmittedCaseByReviewer
    participant RPC as apply_reviewer_case_decision (RPC)
    participant DB as Postgres

    R->>A: POST { caseId, reviewerComment }
    A->>W: validated input
    W->>RPC: apply_reviewer_case_decision(caseId, nextStatus, comment)
    RPC->>DB: assert can_review_case() + school assignment
    RPC->>DB: assert previous_status = 'submitted'
    RPC->>DB: update case status + write audit/timeline
    RPC-->>W: { case_id, previous_status, next_status }
    W->>W: validate returned record shape matches request
    W-->>R: { caseId, status }
```

Decision targets: `approve → approved`, `deny → denied` (comment required),
`requestChanges → change_pending` (comment required).

---

## 8. Case status state machine

Source of truth: `CASE_STATUS_TRANSITIONS` in `lib/cases/status.ts`.

```mermaid
stateDiagram-v2
    [*] --> draft

    draft --> missing_documents
    draft --> blocked
    draft --> ready_for_submission

    missing_documents --> blocked
    missing_documents --> ready_for_submission
    missing_documents --> submitted

    in_progress --> blocked
    in_progress --> missing_documents
    in_progress --> ready_for_submission
    in_progress --> submitted

    blocked --> missing_documents
    blocked --> ready_for_submission
    blocked --> submitted

    ready_for_submission --> submitted
    ready_for_submission --> blocked
    ready_for_submission --> missing_documents

    submitted --> approved
    submitted --> denied
    submitted --> change_pending

    approved --> change_pending
    approved --> completed

    change_pending --> missing_documents
    change_pending --> blocked
    change_pending --> ready_for_submission
    change_pending --> submitted
    change_pending --> approved
    change_pending --> denied

    denied --> [*]
    completed --> [*]
```

**Notes**
- Student‑driven, deterministic states (`draft, missing_documents, in_progress,
  blocked, ready_for_submission, change_pending`) are re‑evaluable
  (`DETERMINISTIC_REEVALUATION_STATUSES`).
- `submitted → approved|denied|change_pending` only via the reviewer RPC.
- Editing approval‑sensitive fields (`employer_name`, `work_location`, `start_date`,
  `end_date`) on an `approved` case is what `shouldMoveToChangePending` targets.

---

## 9. Document extraction lifecycle

`extraction_status` ∈ `pending | processing | succeeded | failed`
(`lib/cases/document-extraction-state.ts`).

```mermaid
stateDiagram-v2
    [*] --> pending: document registered
    pending --> processing: extraction starts
    processing --> succeeded: fields extracted & stored
    processing --> failed: unreadable / error

    succeeded --> processing: re-upload (new version) or retry
    failed --> processing: retry (canRetryDocumentExtraction)

    processing --> processing: stale > 10 min → retry allowed
    failed --> succeeded: manual field correction repairs status
    pending --> succeeded: manual field correction repairs status

    note right of processing
        Stale threshold:
        STALE_DOCUMENT_EXTRACTION_THRESHOLD_MS = 10 min
        Stuck "processing" past threshold becomes retryable.
    end note

    note right of succeeded
        "unresolved" = pending | processing | failed.
        Manual review on latest relevant docs
        can repair extraction_status to succeeded.
    end note
```

> Extraction itself is a **local text‑pattern stub** (`extractDocumentWithLocalStub`):
> regex alias matching over decoded file bytes, fixed confidence 0.35, date
> normalization to `YYYY-MM-DD`. No production OCR/AI. Binary/scanned files without
> readable text fail.

---

## 10. Requirement evaluation pipeline

```mermaid
flowchart LR
    TC["template config_json<br/>(school_templates)"] --> NC["normalizeCaseTemplateConfig"]
    NC -->|requirements present| Reqs["template requirements"]
    NC -->|empty| Defaults["built-in default CPT requirements<br/>(offer letter, employer, job title,<br/>job duties, dates, advisor approval,<br/>course registration, lead-time)"]

    Reqs --> Eval
    Defaults --> Eval

    subgraph Eval["evaluateCaseRequirements (per requirement type)"]
        D["document: has uploaded doc?"]
        CF["case_field: field present on case?"]
        EF["extracted_field: latest doc value present?"]
        LT["lead_time: days until start ≥ minDays?"]
    end

    Eval --> Rows["RequirementInsert[]<br/>(status: met/not_met/pending, severity)"]
    Rows --> Derive["deriveCaseStatusFromRequirements"]

    Derive -->|"0 blockers"| RFS["ready_for_submission"]
    Derive -->|"blockers incl. document"| MD["missing_documents"]
    Derive -->|"blockers, non-document"| BL["blocked"]
    Derive -->|"no requirements"| DR["draft"]

    RFS --> Persist["finalize_case_requirement_evaluation RPC<br/>(persist rows + status atomically)"]
    MD --> Persist
    BL --> Persist
```

---

## 11. Data model (ER diagram)

Derived from `integrations/supabase/types.ts` and the base migration. PK = `id`
(uuid) on all tables unless noted; FKs shown as relationships.

```mermaid
erDiagram
    profiles ||--o| user_roles : "user_id"
    schools ||--o{ school_templates : "school_id"
    schools ||--o{ reviewer_school_assignments : "school_id"
    school_templates ||--o{ cases : "school_template_id"
    cases ||--o{ documents : "case_id"
    cases ||--o{ case_requirements : "case_id"
    cases ||--o{ case_timeline_events : "case_id"
    cases ||--o{ case_notes : "case_id"
    cases ||--o{ audit_logs : "case_id"
    cases ||--o{ notifications : "case_id (nullable)"
    documents ||--o{ extracted_fields : "document_id"

    profiles {
        uuid user_id
        string email
        string full_name
        string university_name
        string degree_level
        string major
        string visa_type
    }
    user_roles {
        uuid user_id
        enum role "app_role"
    }
    schools {
        uuid id
        bool active
    }
    school_templates {
        uuid id
        uuid school_id
        json config_json
        string process_type
        bool is_active
        int version
    }
    cases {
        uuid id
        uuid user_id
        uuid school_template_id
        enum status "case_status"
        bool needs_document_reevaluation
        string process_type
        string employer_name
        string role_title
        string work_location
        date start_date
        date end_date
        string case_summary
        string risk_level
    }
    documents {
        uuid id
        uuid case_id
        string document_type
        string file_name
        string file_path
        string upload_registration_id
        string upload_status
        string extraction_status
        timestamptz extraction_started_at
        timestamptz extraction_completed_at
        string extraction_error
        int version_number
    }
    extracted_fields {
        uuid id
        uuid document_id
        string field_name
        string field_value
        float confidence_score
        bool manually_corrected
    }
    case_requirements {
        uuid id
        uuid case_id
        string requirement_key
        string label
        enum severity "requirement_severity"
        enum status "requirement_status"
        string explanation
        string source
    }
    case_timeline_events {
        uuid id
        uuid case_id
        string event_type
        string title
        string description
        json metadata_json
    }
    case_notes {
        uuid id
        uuid case_id
        uuid user_id
        string content
    }
    audit_logs {
        uuid id
        uuid case_id
        uuid actor_id
        string action_type
        string field_name
        string old_value
        string new_value
        string reason
    }
    notifications {
        uuid id
        uuid user_id
        uuid case_id
        string type
        string title
        string body
        bool read
        timestamptz scheduled_for
    }
    reviewer_school_assignments {
        uuid id
        uuid user_id
        uuid school_id
    }
```

**Enums**
- `app_role`: `student | school_admin | advisor | employer`
- `case_status`: 10 values (see §8)
- `requirement_severity`: `blocker | warning | info`
- `requirement_status`: `pending | met | not_met | waived`

---

## 12. Server‑enforced RPCs (transaction boundaries)

```mermaid
graph TD
    subgraph JS["workflows.server.ts"]
        F1["finalizeCaseCreationAndEvaluate"]
        F2["reevaluateCaseAfterUploads"]
        F3["saveManualExtractedFields"]
        F4["approve/deny/requestChanges"]
        F5["registerUploadedCaseDocument"]
    end

    subgraph RPCs["Postgres RPCs (atomic)"]
        R1["finalize_case_requirement_evaluation"]
        R2["apply_manual_extracted_field_review"]
        R3["apply_reviewer_case_decision"]
        R4["register_case_document"]
    end

    F1 --> R1
    F2 --> R1
    F3 --> R2
    F4 --> R3
    F5 --> R4

    R1 -->|"persist requirements + status"| DB[("Postgres")]
    R2 -->|"field edits + status repair + reevaluation"| DB
    R3 -->|"status + audit + assignment check"| DB
    R4 -->|"create/version document"| DB
```

Each RPC is a single transaction, so a partial failure cannot leave inconsistent
primary state. RPC names are hardcoded constants in `workflows.server.ts`; the JS
projects state in memory, validates, then delegates the commit to the RPC.

---

## 13. Cross‑cutting concerns

| Concern | Where handled |
|---------|---------------|
| AuthN (token validation) | `integrations/supabase/auth-middleware.ts` |
| AuthZ (ownership/scope) | `server/cases/authz.server.ts` + RLS + RPC checks |
| Input validation | `server/cases/validation.ts` (hand‑written) |
| Error normalization | `server/cases/database-errors.ts` |
| Audit / timeline / status history | `server/cases/history.server.ts` (best‑effort writes) |
| Shared business rules | `src/lib/cases/*` (pure, client + server) |
| UI status/labels | `src/lib/constants.ts` |
| Type safety | `integrations/supabase/types.ts` (generated) + strict TS |

> "Best‑effort" history writes are wrapped so a logging failure does not abort the
> primary mutation.

---

## 14. Architectural principles observed

1. **Server is the source of truth.** The client re‑uses the same pure logic
   (`src/lib/cases/*`) for responsive UX, but the server re‑computes and persists.
2. **Atomic mutations via RPC.** Multi‑step writes are pushed into Postgres
   transactions to avoid partial state.
3. **Defense in depth for authz.** Query filters + RPC checks + RLS all enforce the
   same rules independently.
4. **Validate‑then‑commit.** Workflows build and validate a projected state in memory
   before any write (notably manual field review).
5. **Generated boundaries.** Supabase client/types and the route tree are generated and
   should be regenerated, not hand‑edited.

For known risks, fragile areas, gaps, and open questions, see
[`PROJECT_STATUS.md`](./PROJECT_STATUS.md) §13–15.

---

_Generated from a read‑only inspection of the codebase on 2026-06-09. Diagrams reflect
code paths in `src/server/cases/`, `src/lib/cases/`, `src/integrations/supabase/`, and
`supabase/migrations/`. Where the database column type is looser than the app‑level
constraint (e.g. `extraction_status` is `string` in generated types), the app‑level
constraint is shown._
