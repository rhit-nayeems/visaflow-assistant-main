# VisaFlow — Project Status

_Last updated: 2026-06-09_

> Comprehensive snapshot of the VisaFlow codebase: what it is, how it is built, what
> works today, where the risks are, and what is known to be incomplete. This document
> is descriptive of the **current** state of `main` — it is not a roadmap commitment.

---

## 1. Executive summary

**VisaFlow** is a CPT (Curricular Practical Training) work‑authorization workflow
platform for international students. A student creates a **case**, fills in employment
details, uploads supporting documents (offer letter, advisor approval, course
registration, I‑20), and a **deterministic requirement‑evaluation engine** computes the
case status. School‑admin **reviewers** see a queue of submitted cases scoped to the
schools they are assigned to, and approve / deny / request changes through an audited,
database‑enforced decision path.

The application is a **TanStack Start** full‑stack React app deployed to **Cloudflare
Workers**, backed by **Supabase** (Postgres + Auth + Storage). Critical multi‑step
mutations are enforced atomically inside Postgres RPCs, and access control is layered
across server‑function authorization, RPC checks, and Row‑Level Security (RLS).

**Current maturity:** the student and reviewer workflows are implemented end‑to‑end at
the code level, with a meaningful server‑side test suite. Document extraction is a
**local text‑pattern stub** (no production OCR/AI). Several recent commits focused on
hardening transactional integrity and reviewer authorization.

---

## 2. Repository layout note

The git working tree root contains a single nested project directory:

```
visaflow-assistant-main/            <- git root (this file's repo)
└── visaflow-assistant-main/        <- actual application root (package.json lives here)
    ├── src/
    ├── supabase/
    ├── package.json
    └── ...
```

All paths in this document are relative to the **application root**
(`visaflow-assistant-main/` inner folder) unless otherwise stated.

---

## 3. Tech stack

| Area | Technology |
|------|-----------|
| Language | TypeScript 5.8 (strict; typecheck via `tsc --noEmit`) |
| UI runtime | React 19 |
| Full‑stack framework | TanStack Start (`@tanstack/react-start`) |
| Routing | TanStack Router (file‑based, generated `routeTree.gen.ts`) |
| Data fetching/cache | TanStack React Query |
| Server functions | `createServerFn` (POST RPC‑style endpoints) |
| Deploy target | Cloudflare Workers via Wrangler + `@cloudflare/vite-plugin` |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4, `tw-animate-css` |
| Component library | shadcn‑style components on Radix UI primitives |
| Icons | lucide-react |
| Forms | react-hook-form + `@hookform/resolvers` + zod |
| Backend | Supabase (Postgres, Auth, Storage) via `@supabase/supabase-js` |
| Charts / misc UI | recharts, sonner (toasts), embla-carousel, vaul, cmdk |
| Dates | date-fns |
| Lint/format | ESLint 9 + typescript-eslint, Prettier (+ eslint-plugin-prettier) |
| Tests | Node built‑in test runner (`node --test --experimental-strip-types`) |

> **Note:** A `bunfig.toml` is present, but all npm scripts assume npm. The canonical
> package manager is **unconfirmed** (npm scripts vs. Bun).

---

## 4. Directory map

```
src/
├── routes/                      # File-based routes (TanStack Router)
│   ├── __root.tsx               # Root shell, wraps AuthProvider
│   ├── index.tsx                # Landing
│   ├── login / signup / forgot-password / reset-password
│   ├── auth/callback.tsx
│   └── _authenticated/          # Auth-gated layout
│       ├── dashboard.tsx
│       ├── settings.tsx
│       ├── cases/{index,new,$caseId}.tsx
│       └── review/cases/{index,$caseId}.tsx   # Reviewer (school_admin) views
│
├── server/cases/                # BACKEND CORE
│   ├── actions.ts               # Server-function definitions (the API surface)
│   ├── workflows.server.ts      # All mutating case workflows (~1,500 LOC; central)
│   ├── reviewer-read.server.ts  # Reviewer queue + detail reads
│   ├── authz.server.ts          # Ownership + reviewer-school-scope authorization
│   ├── validation.ts            # Hand-written input validators
│   ├── types.ts                 # DB-derived record/insert/update aliases
│   ├── document-registration.ts # Document record registration (wraps RPC)
│   ├── document-extraction.ts   # LOCAL text-pattern extraction STUB
│   ├── history.server.ts        # Timeline / audit / status-history writers
│   ├── database-errors.ts       # Normalizes Postgres errors into user messages
│   └── *.test.ts                # Server-side test suite
│
├── lib/
│   ├── cases/                   # PURE shared logic (client + server)
│   │   ├── requirements.ts      # Requirement evaluation engine + status derivation
│   │   ├── status.ts            # Status transition graph + guards
│   │   └── document-extraction-state.ts  # stale/retry/manual-review predicates
│   ├── auth.ts                  # AuthContext + useAuth
│   ├── auth-redirect.ts         # Post-auth redirect logic (+ test)
│   ├── server-functions.ts      # buildSupabaseServerFnHeaders (bearer token)
│   └── constants.ts             # Status/severity/document-type config, file limits
│
├── components/
│   ├── cases/                   # Feature UI (CaseDetailPage, CreateCaseWizard, etc.)
│   ├── auth/                    # AuthProvider, forms
│   ├── dashboard/, settings/, landing/, layout/, shared/
│   └── ui/                      # ~50 shadcn/Radix components
│
├── integrations/supabase/
│   ├── client.ts                # Browser client (RLS applies) — generated
│   ├── client.server.ts         # Service-role admin client (BYPASSES RLS) — generated
│   ├── auth-middleware.ts       # requireSupabaseAuth — generated
│   ├── types.ts                 # Generated DB schema types
│   └── url.ts                   # Supabase URL normalization (+ test)
│
├── hooks/                       # use-mobile
└── styles.css                   # Tailwind entry

supabase/
├── migrations/                  # 14 SQL migrations (schema, RLS, RPCs, seeds)
└── config.toml
```

> Files marked _“automatically generated. Do not edit”_:
> `integrations/supabase/{client.ts, client.server.ts, auth-middleware.ts, types.ts}`
> and `src/routeTree.gen.ts`.

---

## 5. Runtime architecture & data flow

### 5.1 Authentication
- The browser uses the Supabase client (`integrations/supabase/client.ts`) with a
  **persisted session** in `localStorage`.
- `AuthProvider` (`components/auth/AuthProvider.tsx`) subscribes to
  `onAuthStateChange`, tracks `user`/`session`, and loads roles from the `user_roles`
  table. It exposes `isSchoolAdmin`, `isAuthenticated`, etc. via `useAuth()`.

### 5.2 Calling the backend
- Components call server functions through `useServerFn(...)` and pass
  `headers: buildSupabaseServerFnHeaders(session)`, which attaches the session
  `access_token` as a `Bearer` token (`lib/server-functions.ts`). Missing token throws
  “You must be signed in to continue.”

### 5.3 Server middleware (`requireSupabaseAuth`)
Every action runs `requireSupabaseAuth` (`integrations/supabase/auth-middleware.ts`):
1. Requires `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` env vars.
2. Reads the `Authorization: Bearer <token>` header.
3. Builds a **request‑scoped** Supabase client that forwards the user token, so
   **RLS applies to every query** the handler makes.
4. Validates the token with `supabase.auth.getClaims(token)` and injects
   `{ supabase, userId, claims }` into the action context.

### 5.4 Workflow execution
- Action handlers in `actions.ts` validate input, then **dynamically `import()`** the
  workflow module and call it with `{ supabase, userId }` (a `CaseWorkflowContext`).
- Authorization is enforced redundantly: JS query filters
  (`.eq("user_id", userId)`), reviewer‑school scoping, **and** Postgres RLS + RPC
  internal checks.

### 5.5 Requirement evaluation engine
On finalize / re‑upload / manual field review:
1. `evaluateCaseRequirements(...)` produces requirement rows from the template config
   (or a built‑in default set).
2. `deriveCaseStatusFromRequirements(...)` maps blockers → next status.
3. `assertValidCaseStatusTransition(...)` validates against `CASE_STATUS_TRANSITIONS`.
4. The result is persisted — increasingly through **atomic Postgres RPCs** rather than
   multiple sequential writes.

### 5.6 Document lifecycle
Upload → `register_case_document` RPC creates/​versions the record →
`extractCaseDocumentAndMaybeReevaluate` sets status `processing`, downloads the file
from the `case-documents` storage bucket, runs `extractDocumentWithLocalStub`, stores
`extracted_fields`, sets `succeeded`/`failed` → re‑evaluates if the case status allows.
Failed or **stale processing (>10 min)** extractions are retryable; students can also
manually correct blocker‑level extracted fields.

---

## 6. Domain model

### 6.1 Case status enum & transitions (`lib/cases/status.ts`)
States: `draft`, `missing_documents`, `in_progress`, `blocked`,
`ready_for_submission`, `submitted`, `approved`, `denied`, `change_pending`,
`completed`.

- Student path: `draft → missing_documents/blocked → ready_for_submission → submitted`.
- Reviewer path: `submitted → approved | denied | change_pending`.
- `approved → change_pending | completed`; `change_pending` can re‑enter the student
  loop or be re‑decided. `denied` and `completed` are terminal.
- `DETERMINISTIC_REEVALUATION_STATUSES` gates which states may be auto re‑evaluated.
- `shouldMoveToChangePending` / `getApprovalSensitiveFieldChanges` handle edits to
  approval‑sensitive fields (`employer_name`, `work_location`, `start_date`,
  `end_date`).

### 6.2 Requirement types (`lib/cases/requirements.ts`)
`document` · `case_field` · `extracted_field` · `lead_time`. Severities: `blocker`,
`warning`, `info`. If a template provides no requirements, a **default CPT requirement
set** is used (offer letter, employer name, job title, job duties, start/end date,
advisor approval, course registration, lead‑time warning with a 14‑day default).

### 6.3 Database tables (from `integrations/supabase/types.ts`)
`profiles`, `user_roles`, `schools`, `school_templates`, `cases`, `documents`,
`extracted_fields`, `case_requirements`, `case_timeline_events`, `notifications`,
`audit_logs`, `case_notes`, `reviewer_school_assignments`.

Enums: `app_role` (`student | school_admin | advisor | employer`), `case_status`,
`requirement_severity` (`blocker | warning | info`),
`requirement_status` (`pending | met | not_met | waived`).

> The `documents.extraction_status` and `upload_status` columns are typed as plain
> `string` in the generated types (not enums); the app constrains them to
> `pending | processing | succeeded | failed` in code.

---

## 7. API surface (server functions — `server/cases/actions.ts`)

All endpoints are `POST`, gated by `requireSupabaseAuth`, with input validated by the
matching `validate*` function in `validation.ts`. Inputs are validated by **hand‑written
validators** (not zod) on the server.

### Student‑facing
| Action | Returns |
|--------|---------|
| `saveCaseDraftAction` | `{ caseId }` |
| `registerUploadedCaseDocumentAction` | extraction result (`documentId`, `documentType`, `versionNumber`, `extractionStatus`, `extractedFieldCount`, `extractionError`, `reevaluation*`, `createdNew`) |
| `finalizeCaseCreationAndEvaluateAction` | `{ caseId, status }` |
| `reevaluateCaseAfterUploadsAction` | `{ caseId, status, requirementCount }` |
| `retryCaseDocumentExtractionAction` | extraction result |
| `saveManualExtractedFieldsAction` | `{ caseId, status, requirementCount, updatedFieldCount }` |
| `submitCaseForReviewAction` | `{ caseId, status }` |
| `addCaseNoteAction` | `{ noteId }` |

### Reviewer‑facing (requires `school_admin`, scoped to assigned schools)
| Action | Returns |
|--------|---------|
| `listReviewerCasesAction` | `ReviewerQueueCase[]` (status = `submitted`) |
| `loadReviewerCaseDetailAction` | `ReviewerCaseDetail \| null` (case + documents + requirements + timeline + auditLogs) |
| `approveCaseAction` | `{ caseId, status }` |
| `denyCaseAction` | `{ caseId, status }` (comment required) |
| `requestCaseChangesAction` | `{ caseId, status }` (comment required) |

**Input contracts:** see the `*Input` interfaces in `validation.ts`. Dates must match
`YYYY-MM-DD`. `saveManualExtractedFields` rejects duplicate `documentId:fieldName`
pairs in a single request.

---

## 8. Database / migrations status

14 migrations in `supabase/migrations/` (chronological):

1. `20260416032837_*` — Base schema: all enums, all tables, RLS policies, storage
   bucket policies (`case-documents`), `handle_new_user`/`handle_new_user_role`
   triggers, `has_role()`.
2. `20260416043000_seed_default_school_and_requirement_policies` — seed + requirement
   insert/delete RLS.
3. `20260416103000_fix_case_finalize_atomicity_and_document_registration` —
   `finalize_case_requirement_evaluation` RPC.
4. `20260419113000_register_case_document_rpc` — `register_case_document` RPC.
5. `20260420120000_persist_case_document_reevaluation_flag` — adds
   `needs_document_reevaluation`; updates finalize + register RPCs.
6. `20260420143000_add_school_admin_case_review_policies` — `can_review_case()` +
   reviewer RLS on cases.
7. `20260420150000_restrict_reviewer_case_writes_to_atomic_decision_rpc` —
   `apply_reviewer_case_decision` RPC.
8. `20260420153000_make_reviewer_case_decision_audit_safe` — audit hardening for the
   decision RPC.
9. `20260420170000_add_case_document_extraction_lifecycle` — extraction lifecycle
   columns (`extraction_status`, `extraction_started_at`, `extraction_completed_at`,
   `extraction_error`, `upload_status`, `upload_registration_id`, `version_number`).
10. `20260420183000_backfill_case_document_reevaluation_for_unresolved_latest_extractions`
    — backfill for unresolved latest extractions.
11. `20260420193000_make_register_case_document_flag_server_controlled` — moves the
    reevaluation flag to server control.
12. `20260420203000_repair_stale_case_document_reevaluation_flags` — repair migration.
13. `20260420213000_apply_manual_extracted_field_review_rpc` —
    `apply_manual_extracted_field_review` RPC (atomic manual field review +
    extraction‑status repair + reevaluation persistence).
14. `20260421120000_scope_reviewers_to_assigned_schools` —
    `reviewer_school_assignments` table; `can_review_case` and
    `apply_reviewer_case_decision` now require assignment to the case's school.

**Server‑enforced atomic RPCs in use** (referenced from `workflows.server.ts`):
- `finalize_case_requirement_evaluation`
- `apply_manual_extracted_field_review`
- `apply_reviewer_case_decision`
- `register_case_document`

**Security model:** per‑user RLS on all case‑scoped tables; reviewer access via
`can_review_case()` + school‑assignment scoping; storage policies confine uploads to
`{userId}/{caseId}/{uploadRegistrationId}/...`. The server‑function layer additionally
filters by `user_id` / reviewer school IDs before hitting the read‑side data.

---

## 9. Testing status

Tests use Node's built‑in runner with TS strip‑types. `npm run test:cases` runs the
core case suite:

| File | Approx. test count | Focus |
|------|-----|-------|
| `server/cases/workflows.server.test.ts` | ~32 | Workflow behavior incl. manual‑review mixed valid/invalid, reevaluation‑persistence rollback, submit gating |
| `server/cases/database-errors.test.ts` | ~12 | Postgres error → user‑message normalization |
| `server/cases/document-registration.test.ts` | ~4 | Document registration / versioning |
| `server/cases/document-extraction.test.ts` | ~2 | Local extraction stub |
| `server/cases/reviewer-read.server.test.ts` | ~2 | Reviewer read scoping by assigned schools |

**Not included in `test:cases`** (exist but run separately, if at all):
- `lib/auth-redirect.test.ts` (~7)
- `integrations/supabase/url.test.ts` (~3)

> There is **no single “run all tests” script**, and **no front‑end / component
> tests**. Recent commits added focused regressions for reviewer read‑scope, manual
> review atomicity/rollback, and submit‑button gating.

---

## 10. Validation / developer commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | `vite build && tsc --noEmit` (build **and** typecheck) |
| `npm run build:dev` | Development‑mode build + typecheck |
| `npm run preview` | Preview production build |
| `npm run lint` | `eslint .` |
| `npm run format` | `prettier --write .` |
| `npm run test:cases` | Core case test suite |
| `npm run deploy` | `npm run build && wrangler deploy` |
| `npm run cf:login` / `cf:whoami` / `cf:typegen` | Cloudflare/Wrangler helpers |

---

## 11. Configuration & environment

`.env` keys (`.env.example`):

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_AUTH_REDIRECT_ORIGIN
APP_URL
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY        # optional; only for admin (RLS-bypassing) flows
```

- Client reads `VITE_*` (build‑time inlined) and falls back to `process.env` for SSR.
- Server middleware reads `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`.
- `client.server.ts` (service role) reads `SUPABASE_SERVICE_ROLE_KEY` and **bypasses
  RLS** — server‑only, never client‑reachable.
- Deploy config: `wrangler.jsonc` (`nodejs_compat`, server entry
  `@tanstack/react-start/server-entry`). Vite plugins: cloudflare, tanstackStart,
  react, tailwind, tsconfig‑paths (`@/*` path alias).

---

## 12. Recent work (from git history on `main`)

- **Reviewer school scoping (latest):** `reviewer_school_assignments` added;
  `can_review_case` and `apply_reviewer_case_decision` require assignment to the case's
  school; reviewer queue/detail load via authenticated server functions filtered by
  assigned schools. Added read‑scope tests + decision scope‑failure coverage.
- **Atomic manual extracted‑field review:** `saveManualExtractedFields` now prevalidates
  the full request, projects in‑memory state, computes reevaluation, and persists via a
  single `apply_manual_extracted_field_review` RPC (extracted‑field edits +
  extraction‑status repair + reevaluation in one transaction). Added rollback +
  mixed‑validity regressions.
- **Submit‑button gating realignment:** gating uses latest‑relevant document logic +
  unresolved extraction status; no longer blocks solely on a stale
  `needs_document_reevaluation` flag. The persistent reevaluation banner is now
  informational when latest relevant extractions are already resolved.
- **Stale extraction handling:** backfill migration for unresolved latest extractions;
  defined retry path for stale processing rows in both server and UI.
- **Supabase URL normalization:** `normalizeSupabaseUrl` for auth/API clients.

---

## 13. Known risks & fragile areas

1. **JS ↔ Postgres RPC coupling.** Several multi‑step mutations live partly in JS and
   partly in atomic RPCs (`apply_manual_extracted_field_review`,
   `apply_reviewer_case_decision`, `finalize_case_requirement_evaluation`,
   `register_case_document`). Changing the JS without updating the matching migration
   (or vice versa) can reintroduce partial‑state bugs or schema drift. RPC names are
   hardcoded constants in `workflows.server.ts`.
2. **`needs_document_reevaluation` flag.** Repeatedly reconciled across server truth,
   the persisted flag, and UI banners. Logic is duplicated client‑side (CaseDetailPage)
   and server‑side and must stay in sync.
3. **Shared pure logic runs on both client and server** (`src/lib/cases/`). A change
   there affects UI gating and server enforcement simultaneously; server remains the
   source of truth, but the client re‑derives the same predicates.
4. **Multi‑layered reviewer authorization** (JS scope filters + RLS policies + RPC
   internal checks) must all agree. The `school_templates!inner(school_id)` join +
   relation‑stripping pattern is easy to get subtly wrong.
5. **Two Supabase clients with very different trust levels.** `client.server.ts` uses
   the service role and bypasses RLS; it must never be reachable from client code.
6. **Document extraction is a stub** (`extractDocumentWithLocalStub`): a regex/text
   pattern matcher over the raw file bytes with a low fixed confidence (0.35) — no real
   OCR/AI, fails on non‑text/binary files (e.g. real PDFs/scans).
7. **Generated files** carry “do not edit” markers; schema types come from Supabase
   typegen and should be regenerated, not hand‑edited.

---

## 14. Known gaps / not implemented

- **No production document extraction** — only the local text‑pattern stub.
- **No front‑end/component tests**; no consolidated “run all tests” script.
- **`notifications` table exists** but no notification delivery flow was observed in the
  reviewed code paths (uncertain — not exhaustively traced).
- **`advisor` / `employer` roles** exist in the enum but no dedicated flows were
  observed (reviewer flows are `school_admin` only).
- **Process type** is effectively CPT (`process_type` column present; multi‑process
  support not evident).

---

## 15. Open questions / unknowns

These could not be determined from the code alone and should be confirmed:

1. **Package manager:** npm vs. Bun (`bunfig.toml` present, scripts assume npm).
2. **Local runnability:** whether migrations are applied and a Supabase instance is
   available for end‑to‑end runs, or whether this is currently code‑only.
3. **Full test scope:** whether `auth-redirect` / `url` tests are run anywhere, and the
   intended single command to run everything.
4. **`.env` state:** whether real credentials are configured in this environment or only
   `.env.example` exists.
5. **RPC change workflow:** the expected discipline for pairing JS workflow changes with
   new SQL migrations + `types.ts` regeneration.

---

_This document was generated from a read‑only inspection of the codebase on
2026-06-09. Counts marked “~” are approximate (derived from test declarations) and
items marked “uncertain” were not exhaustively verified._
