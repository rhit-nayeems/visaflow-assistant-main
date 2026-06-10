# VisaFlow

A CPT (Curricular Practical Training) workflow and case-management platform for
international students and their school reviewers. Students assemble a case (employment
details + supporting documents), a **deterministic requirements engine** derives the case
status across a 10-state lifecycle, and **school-admin reviewers** approve / deny / request
changes through an audited, database-enforced decision path scoped to the schools they are
assigned to.

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

| Variable | Used by | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser client | Build-time inlined |
| `VITE_AUTH_REDIRECT_ORIGIN`, `APP_URL` | Auth redirects | |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Server (auth middleware) | RLS applies |
| `SUPABASE_SERVICE_ROLE_KEY` | Server admin client (optional) | **Bypasses RLS — server-only** |
| `ANTHROPIC_API_KEY` | Document extraction (optional) | Enables Claude-powered extraction (native PDF / image parsing, text fallback); falls back to the local stub when unset |
| `ANTHROPIC_EXTRACTION_MODEL` | Document extraction (optional) | Overrides the model (default `claude-haiku-4-5`) |

### Database

Apply the SQL migrations in [`supabase/migrations/`](./supabase/migrations) to your Supabase
project (e.g. with the Supabase CLI). These create the schema, RLS policies, the storage
bucket, and the atomic RPCs the server functions depend on.

### Run

```bash
npm run dev        # start the Vite dev server
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build + type-check (`vite build && tsc --noEmit`) |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Type-check only (`tsc --noEmit`) |
| `npm test` | Run the full test suite (Node test runner) |
| `npm run test:cases` | Run only the `src/server/cases` suite |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (write) |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

## Testing

Tests use Node's built-in runner with native TypeScript support:

```bash
npm test
```

Coverage focuses on the server-side domain logic: the requirements engine and status
transitions, document registration/extraction lifecycle, manual extracted-field review
(including atomic-RPC rollback), reviewer decisions and school-scoping, database-error
normalization, and auth-redirect/URL helpers.

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
npm run deploy
```

## CI

GitHub Actions runs lint, type-check, and the test suite on every push and pull request to
`main` (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) at the repository root).
