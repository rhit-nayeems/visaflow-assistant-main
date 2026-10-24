import type { Tables } from "../../integrations/supabase/types.ts";

export const caseFixture = (overrides: Partial<Tables<"cases">> = {}): Tables<"cases"> => ({
  id: "case-1",
  user_id: "user-1",
  school_template_id: null,
  employer_name: "Acme",
  role_title: "Intern",
  work_location: "Remote",
  start_date: "2099-06-01",
  end_date: "2099-08-01",
  case_summary: null,
  needs_document_reevaluation: false,
  process_type: "CPT",
  risk_level: null,
  status: "draft",
  created_at: "2026-10-08T00:00:00Z",
  updated_at: "2026-10-08T00:00:00Z",
  ...overrides,
});

export const requirementFixture = (
  overrides: Partial<Tables<"case_requirements">> = {},
): Tables<"case_requirements"> => ({
  id: "req-1",
  case_id: "case-1",
  requirement_key: "employer",
  label: "Employer provided",
  severity: "blocker",
  status: "met",
  explanation: "Employer is present.",
  source: "template:case_field",
  created_at: "2026-10-08T00:00:00Z",
  updated_at: "2026-10-08T00:00:00Z",
  ...overrides,
});
