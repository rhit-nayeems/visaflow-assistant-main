# VisaFlow

Live app: [VisaFlow](https://visaflow-assistant.ledgerly-benefits.workers.dev), published on
2026-10-08. Public pages and the guest dashboard redirect were verified; the selected Supabase
backend still needs restoration, matching configuration, migrations, and authenticated checks.
Documentation synchronized on 2026-10-11; test/deployment evidence is from 2026-10-08.

A CPT (Curricular Practical Training) workflow and case-management platform for
international students and their school reviewers. Students assemble a case (employment
details + supporting documents), a **deterministic requirements engine** derives the case
status across a 10-state lifecycle, and **school-admin reviewers** approve / deny / request
changes through an audited, database-enforced decision path scoped to the schools they are
assigned to. Student CPT workflows are the v1 scope; the existing reviewer/admin and optional
extraction-provider features are extensions rather than new v1 commitments.

> Full design docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (Mermaid diagrams of the runtime,
> data model, and lifecycles) and [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) (current status,
> risks, and gaps).

## Tech stack

- **Frontend:** React 19, TanStack Router (file-based), TanStack React Query, Tailwind CSS v4,
  Radix UI / shadcn-style components.
- **Full-stack framework:** TanStack Start with typed server functions (`createServerFn`).
- **Runtime / deploy:** Cloudflare Workers (`nodejs_compat`) via Wrangler.
- **Backend:** Supabase — Postgres (Row-Level Security + atomic RPCs), Auth, and private
  Storage.
- **Tooling:** TypeScript (strict), Vite 7, ESLint 9 + Prettier, Node's built-in test runner.

## Getting started

### Prerequisites

- **Node.js 24** (the test scripts use Node's native TypeScript type-stripping).
- **npm** (the repo is pinned with `package-lock.json`).
- A **Supabase** project (for running the app end-to-end).

### Install

```bash
npm install
```

### Configure environment

Copy the example file and fill in your Supabase values:

```bash
cp .env.example .env
```

| Variable                                              | Used by                        | Notes                                                                                                                  |
| ----------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser client                 | Build-time inlined                                                                                                     |
| `VITE_AUTH_REDIRECT_ORIGIN`, `APP_URL`                | Auth redirects                 |                                                                                                                        |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`           | Server (auth middleware)       | RLS applies                                                                                                            |
| `SUPABASE_SERVICE_ROLE_KEY`                           | Server admin client (optional) | **Bypasses RLS — server-only**                                                                                         |
| `ANTHROPIC_API_KEY`                                   | Document extraction (optional) | Enables Claude-powered extraction (native PDF / image parsing, text fallback); falls back to the local stub when unset |
| `ANTHROPIC_EXTRACTION_MODEL`                          | Document extraction (optional) | Overrides the model (default `claude-haiku-4-5`)                                                                       |

### Database

Apply the SQL migrations in [`supabase/migrations/`](./supabase/migrations) to your Supabase
project (e.g. with the Supabase CLI). These create the schema, RLS policies, the storage
bucket, and the atomic RPCs the server functions depend on.

### Bootstrapping a platform admin

Reviewer assignments are managed by users with the `platform_admin` role (see the **Reviewer
Admin** screen). A role can only attach to a real user, and users are created by signup, so the
first platform admin is granted after that user signs up. Two options:

- **Explicit (one command):** after signing up, run this once in the Supabase SQL editor:

  ```sql
  select public.grant_platform_admin('you@example.com');
  ```

- **Automatic:** configure the bootstrap email once, and the matching user is promoted on signup:

  ```sql
  alter database postgres set app.bootstrap_admin_email = 'you@example.com';
  ```

Both are idempotent. Ordinary users cannot self-promote — `grant_platform_admin` is not granted to
`authenticated`, and the automatic path only matches the configured email.

### Run

```bash
npm run dev        # start the Vite dev server
```

## Scripts

| Script                  | Description                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`           | Start the dev server                                                                       |
| `npm run build`         | Production build + type-check (`vite build && tsc --noEmit`)                               |
| `npm run preview`       | Preview the production build                                                               |
| `npm run typecheck`     | Type-check only (`tsc --noEmit`)                                                           |
| `npm test`              | Run the full test suite (Node test runner)                                                 |
| `npm run test:database` | Apply all migrations and test real PostgreSQL behavior with PGlite; Docker is not required |
| `npm run test:cases`    | Run only the `src/server/cases` suite                                                      |
| `npm run lint`          | ESLint                                                                                     |
| `npm run format`        | Prettier (write)                                                                           |
| `npm run deploy`        | Build and deploy to Cloudflare Workers                                                     |

## Testing

Tests use Node's built-in runner with native TypeScript support:

```bash
npm test
```

Coverage focuses on the server-side domain logic: the requirements engine and status
transitions, document registration/extraction lifecycle, manual extracted-field review
(including atomic-RPC rollback), reviewer decisions and school-scoping, database-error
normalization, and auth-redirect/URL helpers.

The database suite applies every migration to an isolated PostgreSQL engine with a minimal
Supabase auth/storage fixture. It verifies ownership, invalid transitions, stale-write rejection,
atomic history rollback, and the server edit workflow against the actual SQL RPC. It does not
replace a live Supabase Auth/Storage browser check.

## V1 case editing and revalidation

Students can edit internship details from the case overview while the case is editable.
Changing employer, work location, start date, or end date on an approved case moves it to
`change_pending`. The update, requirement evaluation, timeline, and field audit entries are
committed together. Submitted, denied, and completed cases cannot use this edit flow.
Concurrent edits report a conflict instead of overwriting the newer record.

The default template requires reviewed offer-letter employer, job title, start date, end date,
and job duties. Populating the case form alone does not satisfy missing letter fields. Warnings
remain separate from blockers. A case needs satisfied blockers before submission, including
resubmission after approval-sensitive changes.

Apply `20261008214723_complete_v1_case_editing_and_revalidation.sql` along with the preceding
migrations. It adds the atomic edit RPC and database guards, extends the default school template,
and blocks existing ready cases that lack the newly required letter fields. Custom templates
and previously approved/submitted cases keep their existing requirements until reevaluation.
The temporary additive RPC type is in `src/integrations/supabase/workflow-schema.ts`; regenerate
the underlying Supabase types after applying the migration to the hosted database.

The authorized hosted target is `visaflow-assistant` (`cryimllpsevwelcsagih`). Restore it, verify
its migration history, and run `supabase db push --linked` from this application directory.
Then obtain that project's publishable key and set both browser and server URL/key pairs in
`.env` to the same project. The existing `.env` points to a different project and is not a
verified v1 environment. At the last live check, restoration was blocked by Supabase's free-project limit;
no other project has been paused to resolve that limit.

## Project structure

```
src/
├── routes/                 # File-based routes (auth-gated under _authenticated/)
├── server/cases/           # Typed server actions + workflows, authz, validation, RPCs
├── lib/cases/              # Pure shared logic (requirements engine, status, extraction state)
├── components/             # Feature UI + shared/ui components
└── integrations/supabase/  # Auth middleware + generated client/types
supabase/migrations/        # Schema, RLS policies, atomic RPCs
```

## Deployment

The app targets Cloudflare Workers (see [`wrangler.jsonc`](./wrangler.jsonc)):

```bash
npm run build
npx wrangler deploy --keep-vars
```

Configure runtime bindings separately from browser build-time variables. See
[DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md) for first-deployment settings, safe credential
handling, auth redirects, and the remaining backend release checks.

## CI

GitHub Actions runs lint, type-check, and the test suite on every push and pull request to
`main` (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) at the repository root).


## Main reconciliation - 2026-10-24

The previously local case editor, atomic edit/revalidation migration, required offer-letter fields, dashboard/deadline helpers, and PostgreSQL tests are now included in main. Existing reviewer/admin, notification, and optional extraction-provider work is preserved. The full suite passes 117 tests after a clean dependency installation. Earlier deployment, account-limit, and browser observations above are historical; no hosted migration, deployment, or authenticated Auth/Storage check was performed in this reconciliation.
