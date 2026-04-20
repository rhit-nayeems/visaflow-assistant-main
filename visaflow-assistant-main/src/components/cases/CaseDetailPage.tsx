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
import { canRerunDeterministicEvaluation } from "@/lib/cases/status";
import { getCaseNextRecommendedAction, summarizeRequirementRows } from "@/lib/cases/requirements";
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
} from "@/server/cases/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { TimelineItem } from "@/components/shared/TimelineItem";

type Case = Tables<"cases">;
type Document = Tables<"documents">;
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

export function CaseDetailPage({ caseId }: CaseDetailProps) {
  const { user, session } = useAuth();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notes, setNotes] = useState<CaseNote[]>([]);
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
  const [hasPendingDocumentChanges, setHasPendingDocumentChanges] = useState(false);

  const addCaseNoteMutation = useServerFn(addCaseNoteAction);
  const registerUploadedCaseDocumentMutation = useServerFn(registerUploadedCaseDocumentAction);
  const reevaluateCaseAfterUploadsMutation = useServerFn(reevaluateCaseAfterUploadsAction);

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
    setCaseData(caseRes.data);
    setDocuments(docsRes.data || []);
    setRequirements(reqsRes.data || []);
    setTimeline(tlRes.data || []);
    setAuditLogs(auditRes.data || []);
    setNotes(notesRes.data || []);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

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
    setReevaluateError("");
    setReevaluateNotice("");

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
          ? `${documentLabel} saved as version ${registeredDocument.versionNumber}. Re-run evaluation to refresh requirements and case status.`
          : `${documentLabel} uploaded. Re-run evaluation to refresh requirements and case status.`
        : `${documentLabel} upload confirmed. No duplicate version was created.`;

      setUploadNotice(uploadSummary);
      setHasPendingDocumentChanges(true);
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

    try {
      const previousStatus = caseData.status;
      const result = await reevaluateCaseAfterUploadsMutation({
        data: { caseId },
        headers: getServerFnHeaders(),
      });

      setHasPendingDocumentChanges(false);
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

  const prepareReupload = (documentType: string) => {
    setSelectedDocumentType(documentType);
    setUploadError("");
    setUploadNotice("");
    setReevaluateError("");
    setReevaluateNotice("");
    resetUploadSelection();
    setHasPendingDocumentChanges(false);
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
  const documentsForSelectedType = documents.filter(
    (document) => document.document_type === selectedDocumentType,
  );
  const selectedTypeLatestVersion = documentsForSelectedType.reduce(
    (latestVersion, document) => Math.max(latestVersion, document.version_number),
    0,
  );
  const selectedTypeNextVersion = selectedTypeLatestVersion + 1;

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
            variant="outline"
            onClick={handleReevaluate}
            disabled={reevaluateLoading || !canRerunEvaluation}
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

      {isChangePending && (
        <AlertBanner
          variant="warning"
          title="Changes detected - reapproval may be needed"
          description="Core case fields were modified after approval. Contact your DSO to verify if resubmission is required."
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
      {uploadNotice && (
        <AlertBanner
          variant={hasPendingDocumentChanges ? "info" : "success"}
          title="Document update recorded"
          description={uploadNotice}
          action={
            hasPendingDocumentChanges && canRerunEvaluation ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReevaluate}
                disabled={reevaluateLoading}
              >
                {reevaluateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Re-run now
              </Button>
            ) : undefined
          }
        />
      )}
      {reevaluateError && (
        <AlertBanner variant="error" title="Evaluation not updated" description={reevaluateError} />
      )}
      {reevaluateNotice && (
        <AlertBanner variant="success" title="Evaluation updated" description={reevaluateNotice} />
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
                    upload keeps the same registration ID and avoids duplicates.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleReevaluate}
                  disabled={reevaluateLoading || !canRerunEvaluation}
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
                      <Button onClick={handleUpload} disabled={uploadLoading}>
                        {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {selectedTypeLatestVersion > 0 ? "Upload new version" : "Upload document"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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
                          {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-success">
                        {document.upload_status}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => prepareReupload(document.document_type)}
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
