import type { Tables, TablesInsert } from "../../integrations/supabase/types.ts";

type CaseRecord = Tables<"cases">;
type DocumentRecord = Tables<"documents">;
type ExtractedFieldRecord = Tables<"extracted_fields">;
type RequirementRecord = Tables<"case_requirements">;
type RequirementInsert = TablesInsert<"case_requirements">;
type CaseStatus = Tables<"cases">["status"];

type CaseFieldKey =
  | "employer_name"
  | "role_title"
  | "work_location"
  | "start_date"
  | "end_date"
  | "case_summary";

type RequirementType = "document" | "case_field" | "extracted_field" | "lead_time";

export interface TemplateRequirementConfig {
  key: string;
  label: string;
  severity?: RequirementInsert["severity"];
  type: RequirementType;
  documentType?: string;
  field?: CaseFieldKey;
  extractedFieldName?: string;
  minDays?: number;
}

export interface CaseTemplateConfig {
  lead_time_warning_days?: number;
  requirements?: TemplateRequirementConfig[];
}

export interface RequirementSummary {
  blockers: RequirementRecord[];
  warnings: RequirementRecord[];
  blockerCount: number;
  warningCount: number;
  hasEvaluatedRequirements: boolean;
  readyForSubmission: boolean;
}

const DEFAULT_LEAD_TIME_WARNING_DAYS = 14;

const CASE_FIELD_LABELS: Record<CaseFieldKey, string> = {
  employer_name: "Employer name",
  role_title: "Job title",
  work_location: "Work location",
  start_date: "Start date",
  end_date: "End date",
  case_summary: "Case summary",
};

const DOCUMENT_LABELS: Record<string, string> = {
  offer_letter: "offer letter",
  advisor_approval: "advisor approval",
  course_registration: "course registration",
  i20: "I-20",
};

const buildDefaultRequirements = (
  leadTimeWarningDays = DEFAULT_LEAD_TIME_WARNING_DAYS,
): TemplateRequirementConfig[] => [
  {
    key: "offer_letter_uploaded",
    label: "Offer letter uploaded",
    severity: "blocker",
    type: "document",
    documentType: "offer_letter",
  },
  {
    key: "employer_name_provided",
    label: "Employer name provided",
    severity: "blocker",
    type: "case_field",
    field: "employer_name",
  },
  {
    key: "job_title_provided",
    label: "Job title provided",
    severity: "blocker",
    type: "case_field",
    field: "role_title",
  },
  {
    key: "job_duties_available",
    label: "Job duties available",
    severity: "blocker",
    type: "extracted_field",
    documentType: "offer_letter",
    extractedFieldName: "job_duties",
  },
  {
    key: "start_date_provided",
    label: "Start date provided",
    severity: "blocker",
    type: "case_field",
    field: "start_date",
  },
  {
    key: "end_date_provided",
    label: "End date provided",
    severity: "blocker",
    type: "case_field",
    field: "end_date",
  },
  {
    key: "advisor_approval_uploaded",
    label: "Advisor approval uploaded",
    severity: "blocker",
    type: "document",
    documentType: "advisor_approval",
  },
  {
    key: "course_registration_uploaded",
    label: "Course registration uploaded",
    severity: "blocker",
    type: "document",
    documentType: "course_registration",
  },
  {
    key: "lead_time_warning",
    label: "Lead time before start date",
    severity: "warning",
    type: "lead_time",
    minDays: leadTimeWarningDays,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPresent = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
};

const normalizeSeverity = (
  severity: unknown,
  fallbackType: RequirementType,
): RequirementInsert["severity"] => {
  if (severity === "blocker" || severity === "warning" || severity === "info") {
    return severity;
  }

  return fallbackType === "lead_time" ? "warning" : "blocker";
};

const normalizeRequirement = (
  value: unknown,
  leadTimeWarningDays: number,
): TemplateRequirementConfig | null => {
  if (!isRecord(value) || !isNonEmptyString(value.key) || !isNonEmptyString(value.label)) {
    return null;
  }

  const type = value.type;
  if (
    type !== "document" &&
    type !== "case_field" &&
    type !== "extracted_field" &&
    type !== "lead_time"
  ) {
    return null;
  }

  const requirement: TemplateRequirementConfig = {
    key: value.key.trim(),
    label: value.label.trim(),
    severity: normalizeSeverity(value.severity, type),
    type,
  };

  if (type === "document" || type === "extracted_field") {
    requirement.documentType = isNonEmptyString(value.documentType)
      ? value.documentType.trim()
      : "offer_letter";
  }

  if (type === "case_field") {
    requirement.field =
      value.field === "employer_name" ||
      value.field === "role_title" ||
      value.field === "work_location" ||
      value.field === "start_date" ||
      value.field === "end_date" ||
      value.field === "case_summary"
        ? value.field
        : undefined;

    if (!requirement.field) {
      return null;
    }
  }

  if (type === "extracted_field") {
    requirement.extractedFieldName = isNonEmptyString(value.extractedFieldName)
      ? value.extractedFieldName.trim()
      : undefined;

    if (!requirement.extractedFieldName) {
      return null;
    }
  }

  if (type === "lead_time") {
    requirement.minDays =
      typeof value.minDays === "number" && Number.isFinite(value.minDays)
        ? value.minDays
        : leadTimeWarningDays;
  }

  return requirement;
};

export const normalizeCaseTemplateConfig = (rawConfig: unknown): CaseTemplateConfig => {
  const leadTimeWarningDays =
    isRecord(rawConfig) &&
    typeof rawConfig.lead_time_warning_days === "number" &&
    Number.isFinite(rawConfig.lead_time_warning_days)
      ? rawConfig.lead_time_warning_days
      : DEFAULT_LEAD_TIME_WARNING_DAYS;

  const requirements =
    isRecord(rawConfig) && Array.isArray(rawConfig.requirements)
      ? rawConfig.requirements
          .map((requirement) => normalizeRequirement(requirement, leadTimeWarningDays))
          .filter((requirement): requirement is TemplateRequirementConfig => requirement !== null)
      : [];

  return {
    lead_time_warning_days: leadTimeWarningDays,
    requirements:
      requirements.length > 0 ? requirements : buildDefaultRequirements(leadTimeWarningDays),
  };
};

const getDocumentLabel = (documentType: string) =>
  DOCUMENT_LABELS[documentType] ?? documentType.replace(/_/g, " ");

const evaluateDocumentRequirement = (
  caseId: string,
  requirement: TemplateRequirementConfig,
  documents: DocumentRecord[],
): RequirementInsert => {
  const documentType = requirement.documentType ?? "offer_letter";
  const hasDocument = documents.some((document) => document.document_type === documentType);
  const documentLabel = getDocumentLabel(documentType);

  return {
    case_id: caseId,
    requirement_key: requirement.key,
    label: requirement.label,
    severity: requirement.severity ?? "blocker",
    status: hasDocument ? "met" : "not_met",
    explanation: hasDocument
      ? `The ${documentLabel} has been uploaded.`
      : `Upload the ${documentLabel} to continue this CPT case.`,
    source: "template:document",
  };
};

const evaluateCaseFieldRequirement = (
  caseId: string,
  requirement: TemplateRequirementConfig,
  caseData: CaseRecord,
): RequirementInsert => {
  const field = requirement.field!;
  const label = CASE_FIELD_LABELS[field];
  const value = caseData[field];
  const isMet = isPresent(value);

  return {
    case_id: caseId,
    requirement_key: requirement.key,
    label: requirement.label,
    severity: requirement.severity ?? "blocker",
    status: isMet ? "met" : "not_met",
    explanation: isMet
      ? `${label} is recorded on this case.`
      : `Add the ${label.toLowerCase()} before submission.`,
    source: "template:case_field",
  };
};

const evaluateExtractedFieldRequirement = (
  caseId: string,
  requirement: TemplateRequirementConfig,
  documents: DocumentRecord[],
  extractedFields: ExtractedFieldRecord[],
): RequirementInsert => {
  const documentType = requirement.documentType ?? "offer_letter";
  const documentLabel = getDocumentLabel(documentType);
  const matchingDocumentIds = documents
    .filter((document) => document.document_type === documentType)
    .map((document) => document.id);

  const extractedValue = extractedFields.find(
    (field) =>
      matchingDocumentIds.includes(field.document_id) &&
      field.field_name === requirement.extractedFieldName &&
      isPresent(field.field_value),
  );

  let status: RequirementInsert["status"] = "not_met";
  let explanation = `Add ${requirement.label.toLowerCase()} so this case can be reviewed.`;

  if (matchingDocumentIds.length === 0) {
    explanation = `Upload the ${documentLabel} so ${requirement.label.toLowerCase()} can be tracked.`;
  } else if (extractedValue) {
    status = "met";
    explanation = `${requirement.label} is available in the extracted-field placeholder data.`;
  } else {
    explanation = `${requirement.label} is still missing from the extracted-field placeholder data.`;
  }

  return {
    case_id: caseId,
    requirement_key: requirement.key,
    label: requirement.label,
    severity: requirement.severity ?? "blocker",
    status,
    explanation,
    source: "template:extracted_field",
  };
};

const evaluateLeadTimeRequirement = (
  caseId: string,
  requirement: TemplateRequirementConfig,
  caseData: CaseRecord,
): RequirementInsert => {
  const minDays = requirement.minDays ?? DEFAULT_LEAD_TIME_WARNING_DAYS;

  if (!caseData.start_date) {
    return {
      case_id: caseId,
      requirement_key: requirement.key,
      label: requirement.label,
      severity: requirement.severity ?? "warning",
      status: "pending",
      explanation: "Add a start date before lead-time guidance can be evaluated.",
      source: "template:lead_time",
    };
  }

  const startDate = new Date(caseData.start_date);
  const now = new Date();
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / millisecondsPerDay);
  const hasEnoughLeadTime = daysUntilStart >= minDays;

  return {
    case_id: caseId,
    requirement_key: requirement.key,
    label: requirement.label,
    severity: requirement.severity ?? "warning",
    status: hasEnoughLeadTime ? "met" : "not_met",
    explanation: hasEnoughLeadTime
      ? `The start date leaves ${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"} of lead time.`
      : `The start date is only ${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"} away, below the ${minDays}-day warning threshold.`,
    source: "template:lead_time",
  };
};

export const evaluateCaseRequirements = ({
  caseData,
  documents,
  extractedFields,
  templateConfig,
}: {
  caseData: CaseRecord;
  documents: DocumentRecord[];
  extractedFields: ExtractedFieldRecord[];
  templateConfig: unknown;
}): RequirementInsert[] => {
  const normalizedConfig = normalizeCaseTemplateConfig(templateConfig);

  return (normalizedConfig.requirements ?? []).map((requirement) => {
    switch (requirement.type) {
      case "document":
        return evaluateDocumentRequirement(caseData.id, requirement, documents);
      case "case_field":
        return evaluateCaseFieldRequirement(caseData.id, requirement, caseData);
      case "extracted_field":
        return evaluateExtractedFieldRequirement(
          caseData.id,
          requirement,
          documents,
          extractedFields,
        );
      case "lead_time":
        return evaluateLeadTimeRequirement(caseData.id, requirement, caseData);
      default:
        return {
          case_id: caseData.id,
          requirement_key: requirement.key,
          label: requirement.label,
          severity: requirement.severity ?? "info",
          status: "pending",
          explanation: "This requirement is configured but not yet evaluated.",
          source: "template:unknown",
        };
    }
  });
};

export const summarizeRequirementRows = (requirements: RequirementRecord[]): RequirementSummary => {
  const blockers = requirements.filter(
    (requirement) =>
      requirement.severity === "blocker" &&
      requirement.status !== "met" &&
      requirement.status !== "waived",
  );
  const warnings = requirements.filter(
    (requirement) => requirement.severity === "warning" && requirement.status === "not_met",
  );

  return {
    blockers,
    warnings,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    hasEvaluatedRequirements: requirements.length > 0,
    readyForSubmission: requirements.length > 0 && blockers.length === 0,
  };
};

export const deriveCaseStatusFromRequirements = (
  requirements: Array<RequirementRecord | RequirementInsert>,
): CaseStatus => {
  if (requirements.length === 0) {
    return "draft";
  }

  const blockers = requirements.filter(
    (requirement) =>
      requirement.severity === "blocker" &&
      requirement.status !== "met" &&
      requirement.status !== "waived",
  );

  if (blockers.length === 0) {
    return "ready_for_submission";
  }

  const hasMissingDocumentBlockers = blockers.some(
    (requirement) =>
      typeof requirement.source === "string" && requirement.source.includes("document"),
  );

  return hasMissingDocumentBlockers ? "missing_documents" : "blocked";
};

export const getCaseNextRecommendedAction = (
  status: CaseStatus,
  summary: RequirementSummary,
): string => {
  if (status === "draft") {
    return "Complete the case setup flow to evaluate your CPT requirements.";
  }

  if (status === "missing_documents") {
    return "Upload the required documents so the case can move forward.";
  }

  if (status === "change_pending") {
    return "Review the requested or pending changes, update the case, and resubmit when ready.";
  }

  if (summary.blockerCount > 0) {
    return `Resolve ${summary.blockerCount} blocker${summary.blockerCount === 1 ? "" : "s"} to move forward.`;
  }

  if (status === "ready_for_submission" || summary.readyForSubmission) {
    return "Your case is ready for submission.";
  }

  if (status === "submitted") {
    return "Wait for review from your international office.";
  }

  if (status === "approved") {
    return "Keep approved case details stable unless reapproval is required.";
  }

  return "";
};
