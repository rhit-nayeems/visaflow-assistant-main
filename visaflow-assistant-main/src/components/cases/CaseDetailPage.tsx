import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  MessageSquare,
  History,
  Shield,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import {
  hasUnresolvedDocumentExtraction,
  STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES,
  canManuallyReviewDocumentExtraction,
  canRetryDocumentExtraction,
} from "@/lib/cases/document-extraction-state";
import { canRerunDeterministicEvaluation } from "@/lib/cases/status";
import {
  getCaseNextRecommendedAction,
  getLatestEditableExtractedFields,
  getLatestDocumentsBlockingSubmission,
  getLatestDocumentsByType,
  summarizeRequirementRows,
} from "@/lib/cases/requirements";
import {
  ACCEPTED_FILE_TYPES,
  DOCUMENT_TYPES,
  getDocumentTypeLabel,
  MAX_FILE_SIZE,
  REQUIREMENT_STATUSES,
  type CaseStatusKey,
} from "@/lib/constants";
import { buildSupabaseServerFnHeaders } from "@/lib/server-functions";
import {
  addCaseNoteAction,
  registerUploadedCaseDocumentAction,
  reevaluateCaseAfterUploadsAction,
  retryCaseDocumentExtractionAction,
  saveManualExtractedFieldsAction,
  submitCaseForReviewAction,
} from "@/server/cases/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { TimelineItem } from "@/components/shared/TimelineItem";

type Case = Tables<"cases">;
type Document = Tables<"documents">;
type ExtractedField = Tables<"extracted_fields">;
type Requirement = Tables<"case_requirements">;
type TimelineEvent = Tables<"case_timeline_events">;
type AuditLog = Tables<"audit_logs">;
type CaseNote = Tables<"case_notes">;

interface CaseDetailProps {
  caseId: string;
}

const DEFAULT_DOCUMENT_TYPE = DOCUMENT_TYPES[0]?.value ?? "offer_letter";
const DOCUMENT_UPLOAD_ACCEPT = Object.values(ACCEPTED_FILE_TYPES).flat().join(",");
const MAX_DOCUMENT_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE / (1024 * 1024));

const formatCaseStatusLabel = (status: string) => status.replace(/_/g, " ");
const formatExtractionStatusLabel = (status: Document["extraction_status"]) =>
  status.replace(/_/g, " ");
const buildEditableExtractedFieldKey = (documentId: string, fieldName: string) =>
  `${documentId}:${fieldName}`;
const normalizeExtractedFieldDraftValue = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};
const isDateLikeExtractedField = (fieldName: string) => fieldName.includes("date");
const isMultilineExtractedField = (fieldName: string, value: string) =>
  fieldName === "job_duties" || value.length > 80;

const getExtractionStatusBadgeClassName = (status: Document["extraction_status"]) => {
  switch (status) {
    case "succeeded":
      return "bg-success/10 text-success";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "processing":
      return "bg-warning/10 text-warning";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export function CaseDetailPage({ caseId }: CaseDetailProps) {
  const { user, session } = useAuth();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [templateConfig, setTemplateConfig] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>(DEFAULT_DOCUMENT_TYPE);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRegistrationId, setUploadRegistrationId] = useState<string | null>(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [reevaluateLoading, setReevaluateLoading] = useState(false);
  const [reevaluateError, setReevaluateError] = useState("");
  const [reevaluateNotice, setReevaluateNotice] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [retryExtractionDocumentId, setRetryExtractionDocumentId] = useState<string | null>(null);
  const [manualExtractedFieldDrafts, setManualExtractedFieldDrafts] = useState<
    Record<string, string>
  >({});
  const [manualExtractedFieldLoading, setManualExtractedFieldLoading] = useState(false);
  const [manualExtractedFieldError, setManualExtractedFieldError] = useState("");
  const [manualExtractedFieldNotice, setManualExtractedFieldNotice] = useState("");

  const addCaseNoteMutation = useServerFn(addCaseNoteAction);
  const registerUploadedCaseDocumentMutation = useServerFn(registerUploadedCaseDocumentAction);
  const reevaluateCaseAfterUploadsMutation = useServerFn(reevaluateCaseAfterUploadsAction);
  const retryCaseDocumentExtractionMutation = useServerFn(retryCaseDocumentExtractionAction);
  const saveManualExtractedFieldsMutation = useServerFn(saveManualExtractedFieldsAction);
  const submitCaseForReviewMutation = useServerFn(submitCaseForReviewAction);

  const load = useCallback(async () => {
    const [caseRes, docsRes, reqsRes, tlRes, auditRes, notesRes] = await Promise.all([
      supabase.from("cases").select("*").eq("id", caseId).single(),
      supabase
        .from("documents")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false }),
      supabase.from("case_requirements").select("*").eq("case_id", caseId).order("severity"),
      supabase
        .from("case_timeline_events")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false }),
      supabase
        .from("case_notes")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false }),
    ]);
    const extractedFieldsRes =
      (docsRes.data?.length ?? 0) > 0
        ? await supabase
            .from("extracted_fields")
            .select("*")
            .in(
              "document_id",
              (docsRes.data ?? []).map((document) => document.id),
            )
        : { data: [] as ExtractedField[] };
    const caseRecord = caseRes.data;
    const templateRes = caseRecord?.school_template_id
      ? await supabase
          .from("school_templates")
          .select("config_json")
          .eq("id", caseRecord.school_template_id)
          .maybeSingle()
      : { data: null };

    setCaseData(caseRecord);
    setDocuments(docsRes.data || []);
    setExtractedFields(extractedFieldsRes.data || []);
    setRequirements(reqsRes.data || []);
    setTimeline(tlRes.data || []);
    setAuditLogs(auditRes.data || []);
    setNotes(notesRes.data || []);
    setTemplateConfig(templateRes.data?.config_json ?? null);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const nextDrafts = Object.fromEntries(
      getLatestEditableExtractedFields({
        documents,
        extractedFields,
        templateConfig,
      }).map((field) => [
        buildEditableExtractedFieldKey(field.document.id, field.fieldName),
        field.extractedField?.field_value ?? "",
      ]),
    );

    setManualExtractedFieldDrafts(nextDrafts);
  }, [documents, extractedFields, templateConfig]);

  const getServerFnHeaders = () => buildSupabaseServerFnHeaders(session);

  const resetUploadSelection = () => {
    setUploadFile(null);
    setUploadRegistrationId(null);
    setUploadInputKey((currentKey) => currentKey + 1);
  };

  const addNote = async () => {
    if (!newNote.trim() || !user) {
      return;
    }

    const noteId = pendingNoteId ?? crypto.randomUUID();

    setNoteLoading(true);
    setNoteError("");
    setPendingNoteId(noteId);

    try {
      await addCaseNoteMutation({
        data: {
          caseId,
          noteId,
          content: newNote.trim(),
        },
        headers: getServerFnHeaders(),
      });
      setNewNote("");
      setPendingNoteId(null);
      setNoteError("");
      await load();
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Unable to add this note right now.");
    } finally {
      setNoteLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !caseData || !user) {
      return;
    }

    setUploadLoading(true);
    setUploadError("");
    setUploadNotice("");
    setManualExtractedFieldError("");
    setManualExtractedFieldNotice("");
    setReevaluateError("");
    setReevaluateNotice("");
    setSubmitError("");
    setSubmitNotice("");

    const nextUploadRegistrationId = uploadRegistrationId ?? crypto.randomUUID();
    const filePath = `${user.id}/${caseData.id}/${nextUploadRegistrationId}/${uploadFile.name}`;

    setUploadRegistrationId(nextUploadRegistrationId);

    const { error: storageUploadError } = await supabase.storage
      .from("case-documents")
      .upload(filePath, uploadFile, { upsert: true });

    if (storageUploadError) {
      setUploadError(storageUploadError.message);
      setUploadLoading(false);
      return;
    }

    try {
      const registeredDocument = await registerUploadedCaseDocumentMutation({
        data: {
          caseId,
          fileName: uploadFile.name,
          filePath,
          documentType: selectedDocumentType,
          uploadRegistrationId: nextUploadRegistrationId,
        },
        headers: getServerFnHeaders(),
      });

      const documentLabel = getDocumentTypeLabel(registeredDocument.documentType);
      const uploadSummary = registeredDocument.createdNew
        ? registeredDocument.versionNumber > 1
          ? `${documentLabel} saved as version ${registeredDocument.versionNumber}.`
          : `${documentLabel} uploaded.`
        : `${documentLabel} upload confirmed. No duplicate version was created.`;
      const extractionSummary =
        registeredDocument.extractionStatus === "succeeded"
          ? registeredDocument.reevaluationStatus
            ? `Local extraction completed and deterministic evaluation refreshed the case.`
            : `Local extraction completed.`
          : registeredDocument.extractionStatus === "failed"
            ? `Local extraction failed for this version. Retry extraction from the document list or re-run evaluation if the case should still be cleared without new extracted values.`
            : `Document extraction is still pending.`;

      setUploadNotice(`${uploadSummary} ${extractionSummary}`);
      resetUploadSelection();
      await load();
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Unable to register this uploaded document.",
      );
    } finally {
      setUploadLoading(false);
    }
  };

  const handleReevaluate = async () => {
    if (!caseData) {
      return;
    }

    setReevaluateLoading(true);
    setReevaluateError("");
    setReevaluateNotice("");
    setManualExtractedFieldError("");
    setManualExtractedFieldNotice("");
    setSubmitError("");
    setSubmitNotice("");

    try {
      const previousStatus = caseData.status;
      const result = await reevaluateCaseAfterUploadsMutation({
        data: { caseId },
        headers: getServerFnHeaders(),
      });
      setUploadNotice("");
      setReevaluateNotice(
        result.status === previousStatus
          ? `Requirements re-evaluated. Status remains ${formatCaseStatusLabel(result.status)}.`
          : `Requirements re-evaluated. Case status updated to ${formatCaseStatusLabel(result.status)}.`,
      );
      await load();
    } catch (error) {
      setReevaluateError(
        error instanceof Error ? error.message : "Unable to re-run deterministic evaluation.",
      );
    } finally {
      setReevaluateLoading(false);
    }
  };

  const handleRetryExtraction = async (document: Document) => {
    setRetryExtractionDocumentId(document.id);
    setUploadError("");
    setUploadNotice("");
    setManualExtractedFieldError("");
    setManualExtractedFieldNotice("");
    setReevaluateError("");
    setReevaluateNotice("");
    setSubmitError("");
    setSubmitNotice("");

    try {
      const result = await retryCaseDocumentExtractionMutation({
        data: {
          caseId,
          documentId: document.id,
        },
        headers: getServerFnHeaders(),
      });

      const documentLabel = getDocumentTypeLabel(result.documentType);
      setUploadNotice(
        result.extractionStatus === "succeeded"
          ? result.reevaluationStatus
            ? `${documentLabel} extraction retried successfully. Deterministic evaluation refreshed the case.`
            : `${documentLabel} extraction retried successfully.`
          : `${documentLabel} extraction still failed. ${result.extractionError ?? "Retry the extraction again after updating the file."}`,
      );
      await load();
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Unable to retry document extraction.",
      );
    } finally {
      setRetryExtractionDocumentId(null);
    }
  };

  const handleSaveManualExtractedFields = async () => {
    if (!caseData) {
      return;
    }

    const editableFields = getLatestEditableExtractedFields({
      documents,
      extractedFields,
      templateConfig,
    });
    const changedFields = editableFields
      .filter((field) => {
        const fieldKey = buildEditableExtractedFieldKey(field.document.id, field.fieldName);

        return (
          normalizeExtractedFieldDraftValue(manualExtractedFieldDrafts[fieldKey]) !==
          normalizeExtractedFieldDraftValue(field.extractedField?.field_value ?? null)
        );
      })
      .filter((field) => canManuallyReviewDocumentExtraction(field.document));

    if (changedFields.length === 0) {
      setManualExtractedFieldError("Update at least one extracted field before saving.");
      return;
    }

    setManualExtractedFieldLoading(true);
    setManualExtractedFieldError("");
    setManualExtractedFieldNotice("");
    setUploadError("");
    setUploadNotice("");
    setReevaluateError("");
    setReevaluateNotice("");
    setSubmitError("");
    setSubmitNotice("");

    try {
      const previousStatus = caseData.status;
      const result = await saveManualExtractedFieldsMutation({
        data: {
          caseId,
          fields: changedFields.map((field) => ({
            documentId: field.document.id,
            fieldName: field.fieldName,
            fieldValue:
              manualExtractedFieldDrafts[
                buildEditableExtractedFieldKey(field.document.id, field.fieldName)
              ] ?? "",
          })),
        },
        headers: getServerFnHeaders(),
      });

      setManualExtractedFieldNotice(
        result.status === previousStatus
          ? `Reviewed extracted fields saved. Status remains ${formatCaseStatusLabel(result.status)}.`
          : `Reviewed extracted fields saved. Case status updated to ${formatCaseStatusLabel(result.status)}.`,
      );
      await load();
    } catch (error) {
      setManualExtractedFieldError(
        error instanceof Error ? error.message : "Unable to save the reviewed extracted fields.",
      );
    } finally {
      setManualExtractedFieldLoading(false);
    }
  };

  const prepareReupload = (documentType: string) => {
    setSelectedDocumentType(documentType);
    setUploadError("");
    setUploadNotice("");
    setManualExtractedFieldError("");
    setManualExtractedFieldNotice("");
    setReevaluateError("");
    setReevaluateNotice("");
    setSubmitError("");
    setSubmitNotice("");
    resetUploadSelection();
  };

  const handleSubmitForReview = async () => {
    if (!caseData) {
      return;
    }

    setSubmitLoading(true);
    setSubmitError("");
    setSubmitNotice("");
    setManualExtractedFieldError("");
    setManualExtractedFieldNotice("");

    try {
      const previousStatus = caseData.status;
      await submitCaseForReviewMutation({
        data: { caseId },
        headers: getServerFnHeaders(),
      });
      setSubmitNotice(
        previousStatus === "change_pending"
          ? "Case resubmitted for review. Your international office can now review the updated case."
          : "Case submitted for review. Your international office can now review it.",
      );
      await load();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to submit this case for review.",
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <EmptyState
        title="Case not found"
        description="This case does not exist or you do not have access."
        action={
          <Link to="/cases">
            <Button variant="outline">Back to cases</Button>
          </Link>
        }
      />
    );
  }

  const requirementSummary = summarizeRequirementRows(requirements);
  const blockers = requirementSummary.blockers;
  const warnings = requirementSummary.warnings;
  const isChangePending = caseData.status === "change_pending";
  const nextAction = getCaseNextRecommendedAction(caseData.status, requirementSummary);
  const canRerunEvaluation = canRerunDeterministicEvaluation(caseData.status);
  const latestDocuments = getLatestDocumentsByType(documents);
  const latestDocumentsBlockingSubmission = getLatestDocumentsBlockingSubmission({
    documents,
    templateConfig,
  });
  const latestRelevantDocumentsRequiringReevaluation = latestDocumentsBlockingSubmission.filter(
    (document) => hasUnresolvedDocumentExtraction(document.extraction_status),
  );
  const latestDocumentIds = new Set(latestDocuments.map((document) => document.id));
  const latestEditableExtractedFields = getLatestEditableExtractedFields({
    documents,
    extractedFields,
    templateConfig,
  });
  const editableExtractedFieldGroups: Array<{
    document: Document;
    fields: Array<(typeof latestEditableExtractedFields)[number]>;
  }> = [];
  const editableExtractedFieldGroupsById = new Map<
    string,
    (typeof editableExtractedFieldGroups)[number]
  >();

  for (const field of latestEditableExtractedFields) {
    const existingGroup = editableExtractedFieldGroupsById.get(field.document.id);

    if (existingGroup) {
      existingGroup.fields.push(field);
      continue;
    }

    const nextGroup = {
      document: field.document,
      fields: [field],
    };

    editableExtractedFieldGroupsById.set(field.document.id, nextGroup);
    editableExtractedFieldGroups.push(nextGroup);
  }

  const dirtyEditableExtractedFields = latestEditableExtractedFields.filter((field) => {
    const fieldKey = buildEditableExtractedFieldKey(field.document.id, field.fieldName);

    return (
      normalizeExtractedFieldDraftValue(manualExtractedFieldDrafts[fieldKey]) !==
      normalizeExtractedFieldDraftValue(field.extractedField?.field_value ?? null)
    );
  });
  const hasManualExtractedFieldChanges = dirtyEditableExtractedFields.length > 0;
  const latestRetryableExtractions = latestRelevantDocumentsRequiringReevaluation.filter(
    (document) => canRetryDocumentExtraction(document),
  );
  const latestFailedExtractions = latestRelevantDocumentsRequiringReevaluation.filter(
    (document) => document.extraction_status === "failed",
  );
  const latestRetryablePendingExtractions = latestRelevantDocumentsRequiringReevaluation.filter(
    (document) => document.extraction_status === "pending",
  );
  const latestStaleProcessingExtractions = latestRelevantDocumentsRequiringReevaluation.filter(
    (document) =>
      document.extraction_status === "processing" && canRetryDocumentExtraction(document),
  );
  const latestActiveProcessingExtractions = latestRelevantDocumentsRequiringReevaluation.filter(
    (document) =>
      document.extraction_status === "processing" && !canRetryDocumentExtraction(document),
  );
  const hasBlockingLatestExtractions = latestRelevantDocumentsRequiringReevaluation.length > 0;
  const documentsForSelectedType = documents.filter(
    (document) => document.document_type === selectedDocumentType,
  );
  const selectedTypeLatestVersion = documentsForSelectedType.reduce(
    (latestVersion, document) => Math.max(latestVersion, document.version_number),
    0,
  );
  const selectedTypeNextVersion = selectedTypeLatestVersion + 1;
  const isReadyForSubmission = caseData.status === "ready_for_submission";
  const isApproved = caseData.status === "approved";
  const isDenied = caseData.status === "denied";
  const canResubmitForReview = caseData.status === "change_pending";
  const needsDocumentReevaluation = caseData.needs_document_reevaluation;
  const canSubmitForReview =
    (isReadyForSubmission || canResubmitForReview) && !hasBlockingLatestExtractions;
  const submitButtonLabel = canResubmitForReview ? "Resubmit for review" : "Submit for review";
  const submitHelperText = (() => {
    if (latestRetryableExtractions.length > 0) {
      return "Retry unresolved document extraction before submitting this case.";
    }

    if (latestActiveProcessingExtractions.length > 0) {
      return "Wait for current document extraction to finish before submitting this case.";
    }

    if (isReadyForSubmission) {
      return "Submit this case to hand it off for school review.";
    }

    if (canResubmitForReview) {
      return "Address the requested or pending changes, then resubmit this case for review.";
    }

    if (caseData.status === "submitted") {
      return "This case has already been submitted and is waiting for review.";
    }

    if (isApproved) {
      return "This case has been approved. Review the timeline or audit log for any reviewer notes.";
    }

    if (isDenied) {
      return "This case has been denied. Review the timeline and audit log before starting another review cycle.";
    }

    return "Resolve blockers and re-run evaluation until the case is ready for submission.";
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/cases"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to cases
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">
              {caseData.employer_name || "Untitled Case"}
            </h1>
            <StatusBadge status={caseData.status as CaseStatusKey} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {caseData.role_title}
            {caseData.work_location ? ` - ${caseData.work_location}` : ""}
            {caseData.start_date
              ? ` - Starts ${new Date(caseData.start_date).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div className="flex max-w-xs flex-col items-end gap-2 text-right">
          <Button
            onClick={handleSubmitForReview}
            disabled={
              uploadLoading ||
              reevaluateLoading ||
              manualExtractedFieldLoading ||
              submitLoading ||
              retryExtractionDocumentId !== null ||
              !canSubmitForReview
            }
          >
            {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitButtonLabel}
          </Button>
          <p className="text-xs text-muted-foreground">{submitHelperText}</p>
          <Button
            variant="outline"
            onClick={handleReevaluate}
            disabled={
              reevaluateLoading ||
              manualExtractedFieldLoading ||
              submitLoading ||
              retryExtractionDocumentId !== null ||
              !canRerunEvaluation
            }
          >
            {reevaluateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Re-run evaluation
          </Button>
          <p className="text-xs text-muted-foreground">
            {canRerunEvaluation
              ? "After new uploads, re-run deterministic evaluation to refresh requirements and case status."
              : "This case status is managed outside the deterministic upload review flow."}
          </p>
        </div>
      </div>

      {isApproved && (
        <AlertBanner
          variant="success"
          title="Case approved"
          description="Your international office approved this case. Review the timeline or audit log for any reviewer notes."
        />
      )}
      {isDenied && (
        <AlertBanner
          variant="error"
          title="Case denied"
          description="Your international office denied this case. Review the timeline and audit log for the reviewer rationale."
        />
      )}
      {isChangePending && (
        <AlertBanner
          variant="warning"
          title="Changes pending"
          description="Your case needs another review cycle. Review the timeline and audit log, update the case, and resubmit when ready."
        />
      )}
      {blockers.length > 0 && !isChangePending && (
        <AlertBanner
          variant="error"
          title={`${blockers.length} blocker${blockers.length > 1 ? "s" : ""} preventing submission`}
          description="Resolve all blockers before your case can be marked ready for submission."
        />
      )}
      {nextAction && <AlertBanner variant="info" title="Next step" description={nextAction} />}
      {latestFailedExtractions.length > 0 && (
        <AlertBanner
          variant="error"
          title="Document extraction retry required"
          description={`Retry extraction for ${latestFailedExtractions
            .map((document) => getDocumentTypeLabel(document.document_type))
            .join(
              ", ",
            )}. This build uses a local text-pattern extractor, so unsupported or unreadable files stay blocked until you retry or explicitly clear the case with reevaluation.`}
        />
      )}
      {latestRetryablePendingExtractions.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Document extraction pending retry"
          description={`Retry extraction for ${latestRetryablePendingExtractions
            .map((document) => getDocumentTypeLabel(document.document_type))
            .join(
              ", ",
            )} from the document list if these legacy or interrupted rows do not clear automatically.`}
        />
      )}
      {latestStaleProcessingExtractions.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Document extraction appears stalled"
          description={`Retry extraction for ${latestStaleProcessingExtractions
            .map((document) => getDocumentTypeLabel(document.document_type))
            .join(
              ", ",
            )}. Processing rows become retryable after ${STALE_DOCUMENT_EXTRACTION_THRESHOLD_MINUTES} minutes if they stay stuck.`}
        />
      )}
      {latestActiveProcessingExtractions.length > 0 && (
        <AlertBanner
          variant="warning"
          title="Document extraction in progress"
          description={`VisaFlow is still processing ${latestActiveProcessingExtractions
            .map((document) => getDocumentTypeLabel(document.document_type))
            .join(", ")}.`}
        />
      )}
      {needsDocumentReevaluation && !hasBlockingLatestExtractions && canRerunEvaluation && (
        <AlertBanner
          variant="info"
          title="Evaluation refresh available"
          description="Latest required document extractions are already resolved. You can re-run deterministic evaluation now, or submit this case and VisaFlow will clear the leftover reevaluation flag automatically."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={handleReevaluate}
              disabled={reevaluateLoading || manualExtractedFieldLoading}
            >
              {reevaluateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Re-run now
            </Button>
          }
        />
      )}
      {uploadNotice && (
        <AlertBanner
          variant={
            latestFailedExtractions.length > 0
              ? "warning"
              : needsDocumentReevaluation
                ? "info"
                : "success"
          }
          title={
            latestFailedExtractions.length > 0
              ? "Document extraction requires attention"
              : "Document update recorded"
          }
          description={uploadNotice}
          action={
            needsDocumentReevaluation && canRerunEvaluation ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReevaluate}
                disabled={reevaluateLoading || manualExtractedFieldLoading}
              >
                {reevaluateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Re-run now
              </Button>
            ) : undefined
          }
        />
      )}
      {manualExtractedFieldError && (
        <AlertBanner
          variant="error"
          title="Extracted fields not saved"
          description={manualExtractedFieldError}
        />
      )}
      {manualExtractedFieldNotice && (
        <AlertBanner
          variant="success"
          title="Extracted fields saved"
          description={manualExtractedFieldNotice}
        />
      )}
      {reevaluateError && (
        <AlertBanner variant="error" title="Evaluation not updated" description={reevaluateError} />
      )}
      {reevaluateNotice && (
        <AlertBanner variant="success" title="Evaluation updated" description={reevaluateNotice} />
      )}
      {submitError && (
        <AlertBanner variant="error" title="Submission not completed" description={submitError} />
      )}
      {submitNotice && (
        <AlertBanner variant="success" title="Case submitted" description={submitNotice} />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            icon: AlertCircle,
            label: "Blockers",
            value: requirementSummary.blockerCount,
            color: "text-destructive",
          },
          {
            icon: Shield,
            label: "Warnings",
            value: requirementSummary.warningCount,
            color: "text-warning",
          },
          { icon: FileText, label: "Documents", value: documents.length, color: "text-primary" },
          {
            icon: Clock,
            label: "Days to start",
            value: caseData.start_date
              ? Math.max(
                  0,
                  Math.ceil((new Date(caseData.start_date).getTime() - Date.now()) / 86400000),
                )
              : "-",
            color: "text-muted-foreground",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-3 shadow-card">
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-sm">Internship Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                {[
                  ["Employer", caseData.employer_name],
                  ["Role", caseData.role_title],
                  ["Location", caseData.work_location],
                  [
                    "Start Date",
                    caseData.start_date ? new Date(caseData.start_date).toLocaleDateString() : null,
                  ],
                  [
                    "End Date",
                    caseData.end_date ? new Date(caseData.end_date).toLocaleDateString() : null,
                  ],
                  ["Process Type", caseData.process_type],
                  ["Risk Level", caseData.risk_level],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{(value as string) || "-"}</dd>
                  </div>
                ))}
              </dl>
              {caseData.case_summary && (
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="mt-1 text-sm">{caseData.case_summary}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements">
          {!requirementSummary.hasEvaluatedRequirements ? (
            <EmptyState
              icon={<CheckCircle className="h-5 w-5 text-muted-foreground" />}
              title="No requirement evaluation yet"
              description="Requirements will appear after the case is evaluated against its CPT template."
            />
          ) : (
            <div className="space-y-2">
              {requirements.map((requirement) => {
                const statusConfig =
                  REQUIREMENT_STATUSES[requirement.status as keyof typeof REQUIREMENT_STATUSES];
                return (
                  <div
                    key={requirement.id}
                    className="flex items-start justify-between rounded-lg border bg-card p-4 shadow-card"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{requirement.label}</p>
                        <SeverityBadge severity={requirement.severity} />
                      </div>
                      {requirement.explanation && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {requirement.explanation}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusConfig
                          ? requirement.status === "met"
                            ? "bg-success/10 text-success"
                            : requirement.status === "not_met"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {statusConfig?.label || requirement.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents">
          <div className="space-y-4">
            {uploadError && (
              <AlertBanner
                variant="error"
                title="Document not uploaded"
                description={uploadError}
              />
            )}

            <Card className="shadow-card">
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-sm">Upload or re-upload documents</CardTitle>
                  <CardDescription>
                    Use a new upload to create the next document version. Retrying the same failed
                    upload keeps the same registration ID and avoids duplicates. This build uses a
                    local text-pattern extractor, not production OCR.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleReevaluate}
                  disabled={
                    reevaluateLoading ||
                    manualExtractedFieldLoading ||
                    submitLoading ||
                    retryExtractionDocumentId !== null ||
                    !canRerunEvaluation
                  }
                >
                  {reevaluateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Re-run evaluation
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div>
                    <Label className="text-xs">Document type</Label>
                    <Select
                      value={selectedDocumentType}
                      onValueChange={(value) => {
                        setSelectedDocumentType(value);
                        setUploadError("");
                        setUploadNotice("");
                        setUploadRegistrationId(uploadFile ? crypto.randomUUID() : null);
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((documentType) => (
                          <SelectItem key={documentType.value} value={documentType.value}>
                            {documentType.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border-2 border-dashed p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Upload className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {documentsForSelectedType.length > 0
                            ? `${getDocumentTypeLabel(selectedDocumentType)} currently has ${documentsForSelectedType.length} version${documentsForSelectedType.length === 1 ? "" : "s"}.`
                            : `Upload the first ${getDocumentTypeLabel(selectedDocumentType)} for this case.`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {documentsForSelectedType.length > 0
                            ? `Uploading again will create version ${selectedTypeNextVersion}.`
                            : "Choose a file to add this required document to the case."}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          PDF, JPG, PNG, or Word up to {MAX_DOCUMENT_FILE_SIZE_MB}MB.
                        </p>
                        <input
                          key={uploadInputKey}
                          type="file"
                          accept={DOCUMENT_UPLOAD_ACCEPT}
                          disabled={uploadLoading}
                          onChange={(event) => {
                            const nextFile = event.target.files?.[0] || null;

                            setUploadError("");
                            setUploadNotice("");

                            if (nextFile && nextFile.size > MAX_FILE_SIZE) {
                              setUploadFile(null);
                              setUploadRegistrationId(null);
                              setUploadInputKey((currentKey) => currentKey + 1);
                              setUploadError(
                                `Files must be ${MAX_DOCUMENT_FILE_SIZE_MB}MB or smaller.`,
                              );
                              return;
                            }

                            setUploadFile(nextFile);
                            setUploadRegistrationId(nextFile ? crypto.randomUUID() : null);
                          }}
                          className="mt-3 block w-full text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {uploadFile && (
                  <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {uploadFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getDocumentTypeLabel(selectedDocumentType)} -{" "}
                        {uploadFile.size.toLocaleString()} bytes
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={resetUploadSelection}
                        disabled={uploadLoading}
                      >
                        Clear
                      </Button>
                      <Button
                        onClick={handleUpload}
                        disabled={uploadLoading || manualExtractedFieldLoading}
                      >
                        {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {selectedTypeLatestVersion > 0 ? "Upload new version" : "Upload document"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {editableExtractedFieldGroups.length > 0 && (
              <Card className="shadow-card">
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-sm">Review extracted fields</CardTitle>
                    <CardDescription>
                      Edit only the blocker-level extracted fields tied to the latest relevant
                      document versions. Superseded versions stay read-only and do not drive
                      submission.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleSaveManualExtractedFields}
                    disabled={
                      !hasManualExtractedFieldChanges ||
                      manualExtractedFieldLoading ||
                      uploadLoading ||
                      reevaluateLoading ||
                      submitLoading ||
                      retryExtractionDocumentId !== null
                    }
                  >
                    {manualExtractedFieldLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Save extracted field review
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editableExtractedFieldGroups.map((group) => {
                    const canReviewDocument = canManuallyReviewDocumentExtraction(group.document);

                    const documentReviewDescription =
                      group.document.extraction_status === "failed"
                        ? "Local extraction failed on this latest version. Add or correct the required values manually to keep the case moving."
                        : group.document.extraction_status === "pending"
                          ? "This latest version is still marked pending from a prior interrupted run. Saving reviewed values resolves the extraction gate for this document."
                          : group.document.extraction_status === "processing" && canReviewDocument
                            ? "This latest version appears stalled in processing. You can save reviewed values manually instead of waiting on the local stub."
                            : group.document.extraction_status === "processing"
                              ? "Extraction is still running for this latest version. Wait for it to finish before editing these fields."
                              : "Review the local stub output and correct anything incomplete or incorrect.";

                    return (
                      <div
                        key={group.document.id}
                        className="space-y-4 rounded-lg border bg-muted/20 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {getDocumentTypeLabel(group.document.document_type)} - v
                              {group.document.version_number}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {documentReviewDescription}
                            </p>
                          </div>
                          <span
                            className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${getExtractionStatusBadgeClassName(group.document.extraction_status)}`}
                          >
                            {formatExtractionStatusLabel(group.document.extraction_status)}
                          </span>
                        </div>

                        <div className="space-y-4">
                          {group.fields.map((field) => {
                            const fieldKey = buildEditableExtractedFieldKey(
                              group.document.id,
                              field.fieldName,
                            );
                            const currentValue =
                              manualExtractedFieldDrafts[fieldKey] ??
                              field.extractedField?.field_value ??
                              "";
                            const isManualValue = field.extractedField?.manually_corrected ?? false;
                            const sourceLabel = isManualValue
                              ? "Manual correction"
                              : field.extractedField
                                ? "Local extraction"
                                : "Missing";
                            const sourceClassName = isManualValue
                              ? "bg-primary/10 text-primary"
                              : field.extractedField
                                ? "bg-success/10 text-success"
                                : "bg-muted text-muted-foreground";
                            const helperText = isManualValue
                              ? "This saved value came from manual review on the latest version."
                              : field.extractedField
                                ? "This value came from the local extraction stub. Edit it if it is incomplete or incorrect."
                                : "No value is saved for this latest version yet. Add it manually if the document contains it.";
                            const disabled =
                              !canReviewDocument ||
                              manualExtractedFieldLoading ||
                              uploadLoading ||
                              reevaluateLoading ||
                              submitLoading ||
                              retryExtractionDocumentId !== null;

                            return (
                              <div key={fieldKey} className="space-y-2">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <Label htmlFor={fieldKey} className="text-sm font-medium">
                                    {field.label}
                                  </Label>
                                  <span
                                    className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${sourceClassName}`}
                                  >
                                    {sourceLabel}
                                  </span>
                                </div>

                                {isMultilineExtractedField(field.fieldName, currentValue) ? (
                                  <Textarea
                                    id={fieldKey}
                                    value={currentValue}
                                    disabled={disabled}
                                    onChange={(event) => {
                                      setManualExtractedFieldDrafts((currentDrafts) => ({
                                        ...currentDrafts,
                                        [fieldKey]: event.target.value,
                                      }));
                                      setManualExtractedFieldError("");
                                      setManualExtractedFieldNotice("");
                                    }}
                                  />
                                ) : (
                                  <Input
                                    id={fieldKey}
                                    type={
                                      isDateLikeExtractedField(field.fieldName) &&
                                      /^\d{4}-\d{2}-\d{2}$/.test(currentValue)
                                        ? "date"
                                        : "text"
                                    }
                                    value={currentValue}
                                    disabled={disabled}
                                    onChange={(event) => {
                                      setManualExtractedFieldDrafts((currentDrafts) => ({
                                        ...currentDrafts,
                                        [fieldKey]: event.target.value,
                                      }));
                                      setManualExtractedFieldError("");
                                      setManualExtractedFieldNotice("");
                                    }}
                                  />
                                )}

                                <p className="text-xs text-muted-foreground">{helperText}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {documents.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5 text-muted-foreground" />}
                title="No documents"
                description="Upload documents to support your CPT case."
              />
            ) : (
              <div className="space-y-2">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-card"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{document.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {getDocumentTypeLabel(document.document_type)} - v
                          {document.version_number} -{" "}
                          {latestDocumentIds.has(document.id)
                            ? "current version"
                            : "superseded version"}{" "}
                          -{" "}
                          {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Upload: {document.upload_status} - Extraction:{" "}
                          {formatExtractionStatusLabel(document.extraction_status)}
                        </p>
                        {document.extraction_error && (
                          <p className="mt-1 text-xs text-destructive">
                            {document.extraction_error}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${getExtractionStatusBadgeClassName(document.extraction_status)}`}
                      >
                        {formatExtractionStatusLabel(document.extraction_status)}
                      </span>
                      {latestDocumentIds.has(document.id) &&
                        canRetryDocumentExtraction(document) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleRetryExtraction(document)}
                            disabled={
                              retryExtractionDocumentId === document.id ||
                              uploadLoading ||
                              manualExtractedFieldLoading ||
                              reevaluateLoading ||
                              submitLoading
                            }
                          >
                            {retryExtractionDocumentId === document.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Retry extraction
                          </Button>
                        )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => prepareReupload(document.document_type)}
                        disabled={
                          retryExtractionDocumentId === document.id || manualExtractedFieldLoading
                        }
                      >
                        Re-upload
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          {timeline.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5 text-muted-foreground" />}
              title="No events"
              description="Timeline events will appear as you work on this case."
            />
          ) : (
            <div className="py-2">
              {timeline.map((event) => (
                <TimelineItem
                  key={event.id}
                  eventType={event.event_type}
                  title={event.title}
                  description={event.description}
                  createdAt={event.created_at}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit">
          {auditLogs.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5 text-muted-foreground" />}
              title="No audit entries"
              description="Changes to this case will be logged here."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Action
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Field
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Old {"->"} New
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-2 font-medium">{log.action_type}</td>
                      <td className="px-4 py-2 text-muted-foreground">{log.field_name || "-"}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {log.old_value || "-"} {"->"} {log.new_value || "-"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <div className="space-y-4">
            {noteError && (
              <AlertBanner variant="error" title="Note not saved" description={noteError} />
            )}
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={(e) => {
                  setNewNote(e.target.value);
                  setNoteError("");
                  setPendingNoteId(null);
                }}
                placeholder="Add a note..."
                className="flex-1 min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                onClick={addNote}
                disabled={!newNote.trim() || noteLoading}
                className="self-end"
              >
                {noteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </div>
            {notes.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-5 w-5 text-muted-foreground" />}
                title="No notes"
                description="Add notes to track decisions and context."
              />
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border bg-card p-3 shadow-card">
                    <p className="text-sm">{note.content}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
