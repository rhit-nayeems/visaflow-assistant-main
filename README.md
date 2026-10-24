# VisaFlow

Live app: [visaflow-assistant.ledgerly-benefits.workers.dev](https://visaflow-assistant.ledgerly-benefits.workers.dev).
Published to Cloudflare Workers on 2026-10-08. The landing page and guest login redirect were verified then;
the selected Supabase project still needs restoration, configuration, and migrations before
the full v1 workflow can be verified live. Deployment preserves the existing backend URL/key pair.

The application is in [`visaflow-assistant-main/`](./visaflow-assistant-main/README.md).
The root package delegates commands to that application so there is one dependency tree.

Use Node.js 24 and npm:

```bash
npm install
npm run dev
npm test
npm run test:database
npm run lint
npm run build
```

Configure environment variables in `visaflow-assistant-main/.env`, using its `.env.example`.
Apply migrations from `visaflow-assistant-main/supabase/migrations` before using the app.
See [REPO_AUDIT.md](./REPO_AUDIT.md) for verified behavior, release setup, and remaining limitations.

The v1 implementation is locally verified. Hosted release verification is pending restoration
of the linked `visaflow-assistant` Supabase project. The 2026-10-08 restoration attempt failed
because the organization had reached its two-active-free-project limit. Documentation was
synchronized on 2026-10-11; this sync did not rerun the hosted backend checks.

## Documentation

| Document                                                           | Purpose                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| [Application README](./visaflow-assistant-main/README.md)          | Setup, scripts, and v1 workflow behavior             |
| [SPEC.md](./SPEC.md)                                               | Product scope and acceptance criteria                |
| [ROADMAP.md](./ROADMAP.md)                                         | Phases and progress                                  |
| [TASKS.md](./TASKS.md)                                             | Implementation checklist and remaining hosted checks |
| [REPO_AUDIT.md](./REPO_AUDIT.md)                                   | Canonical implementation and verification audit      |
| [Project status](./visaflow-assistant-main/PROJECT_STATUS.md)      | Release status and limitations                       |
| [Architecture](./visaflow-assistant-main/ARCHITECTURE.md)          | Layers, data model, and workflow diagrams            |
| [Deployment guide](./visaflow-assistant-main/DEPLOY-CLOUDFLARE.md) | Cloudflare publishing and Supabase setup             |

The root SPEC.md, ROADMAP.md, and TASKS.md link to the canonical application documents.
The application REPO_AUDIT.md links to the canonical root audit. Historical
portfolio illustrations are labeled in their [README](./visaflow-assistant-main/public/projects/visaflow/README.md).


Reconciled with GitHub main on 2026-10-24. All 117 tests, production build/typecheck,
and lint pass (seven existing warnings). No hosted migration or deployment was performed.
