# VisaFlow

VisaFlow is a CPT workflow and case-management platform for international students.
The application, migrations, and project docs live in
[visaflow-assistant-main/](./visaflow-assistant-main/README.md).

Run commands inside the application directory; main has no root npm package:

```powershell
Set-Location visaflow-assistant-main
npm ci
npm run dev
```

Configure Supabase using the application README first. Use Node.js 24 and npm.

| Document                                                               | Purpose                                  |
| ---------------------------------------------------------------------- | ---------------------------------------- |
| [Application README](./visaflow-assistant-main/README.md)              | Setup, scripts, environment, testing     |
| [SPEC.md](./visaflow-assistant-main/SPEC.md)                           | Student CPT v1 product contract          |
| [ROADMAP.md](./visaflow-assistant-main/ROADMAP.md)                     | Phase status and priorities              |
| [TASKS.md](./visaflow-assistant-main/TASKS.md)                         | Implemented work and open checks         |
| [REPO_AUDIT.md](./visaflow-assistant-main/REPO_AUDIT.md)               | Implementation and verification evidence |
| [PROJECT_STATUS.md](./visaflow-assistant-main/PROJECT_STATUS.md)       | Release gaps and existing extensions     |
| [ARCHITECTURE.md](./visaflow-assistant-main/ARCHITECTURE.md)           | Runtime, data model, workflow diagrams   |
| [DEPLOY-CLOUDFLARE.md](./visaflow-assistant-main/DEPLOY-CLOUDFLARE.md) | Deployment and backend configuration     |

Reviewed on 2026-10-20 against published source at `71fa5b1`.
Documentation distinguishes committed behavior from unpublished local v1 work and live checks.
