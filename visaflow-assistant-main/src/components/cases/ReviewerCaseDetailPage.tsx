import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, FileText, Loader2, AlertCircle, Shield, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { summarizeRequirementRows } from "@/lib/cases/requirements";
import { getDocumentTypeLabel, REQUIREMENT_STATUSES, type CaseStatusKey } from "@/lib/constants";
import { buildSupabaseServerFnHeaders } from "@/lib/server-functions";
import {
  approveCaseAction,
  denyCaseAction,
  requestCaseChangesAction,
} from "@/server/cases/actions";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TimelineItem } from "@/components/shared/TimelineItem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Case = Tables<"cases">;
type Document = Tables<"documents">;
type Requirement = Tables<"case_requirements">;
type TimelineEvent = Tables<"case_timeline_events">;
type AuditLog = Tables<"audit_logs">;

type ReviewAction = "approve" | "deny" | "request_changes";

interface ReviewerCaseDetailPageProps {
  caseId: string;
}

const formatShortId = (value: string) => `${value.slice(0, 8)}...`;

export function ReviewerCaseDetailPage({ caseId }: ReviewerCaseDetailPageProps) {
  const { isLoading: authLoading, isSchoolAdmin, session } = useAuth();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [actionLoading, setActionLoading] = useState<ReviewAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const approveCaseMutation = useServerFn(approveCaseAction);
  const denyCaseMutation = useServerFn(denyCaseAction);
  const requestCaseChangesMutation = useServerFn(requestCaseChangesAction);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const [caseRes, docsRes, reqsRes, timelineRes, auditRes] = await Promise.all([
      supabase.from("cases").select("*").eq("id", caseId).maybeSingle(),
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
    ]);

    const nextError =
      caseRes.error ?? docsRes.error ?? reqsRes.error ?? timelineRes.error ?? auditRes.error;

    setCaseData(caseRes.data ?? null);
    setDocuments(docsRes.data ?? []);
    setRequirements(reqsRes.data ?? []);
    setTimeline(timelineRes.data ?? []);
    setAuditLogs(auditRes.data ?? []);
    setLoadError(nextError?.message ?? "");
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isSchoolAdmin) {
      setLoading(false);
      return;
    }

    void load();
  }, [authLoading, isSchoolAdmin, load]);

  const submitReviewAction = async (action: ReviewAction) => {
    if (!caseData) {
      return;
    }

    const trimmedComment = reviewComment.trim();
    const requiresComment = action === "deny" || action === "request_changes";

    if (requiresComment && !trimmedComment) {
      setActionError("Add a reviewer comment before denying a case or requesting changes.");
      setActionNotice("");
      return;
    }

    setActionLoading(action);
    setActionError("");
    setActionNotice("");

    try {
      const headers = buildSupabaseServerFnHeaders(session);

      if (action === "approve") {
        await approveCaseMutation({
          data: {
            caseId,
            reviewerComment: trimmedComment || null,
          },
          headers,
        });
        setActionNotice("Case approved. The student-facing case status now reflects the approval.");
      }

      if (action === "deny") {
        await denyCaseMutation({
          data: {
            caseId,
            reviewerComment: trimmedComment,
          },
          headers,
        });
        setActionNotice("Case denied. The student-facing case status now reflects the denial.");
      }

      if (action === "request_changes") {
        await requestCaseChangesMutation({
          data: {
            caseId,
            reviewerComment: trimmedComment,
          },
          headers,
        });
        setActionNotice(
          "Changes requested. The student-facing case status now reflects that the case was sent back.",
        );
      }

      setReviewComment("");
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update this case.");
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSchoolAdmin) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <EmptyState
          title="Reviewer access required"
          description="This review detail page is only available to school administrators."
        />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        {loadError && (
          <AlertBanner variant="error" title="Case not available" description={loadError} />
        )}
        <EmptyState
          title="Review case not found"
          description="This case does not exist or is not available in the reviewer workflow."
          action={
            <Link to="/review/cases">
              <Button variant="outline">Back to review queue</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const requirementSummary = summarizeRequirementRows(requirements);
  const canReviewCase = caseData.status === "submitted";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/review/cases"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to review queue
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">
              {caseData.employer_name || "Untitled submitted case"}
            </h1>
            <StatusBadge status={caseData.status as CaseStatusKey} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {caseData.role_title || "Role pending"}
            {caseData.work_location ? ` - ${caseData.work_location}` : ""}
            {caseData.start_date
              ? ` - Starts ${new Date(caseData.start_date).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Case {formatShortId(caseData.id)}</p>
          <p>Owner {formatShortId(caseData.user_id)}</p>
          <p>Updated {formatDistanceToNow(new Date(caseData.updated_at), { addSuffix: true })}</p>
        </div>
      </div>

      {loadError && (
        <AlertBanner
          variant="error"
          title="Case detail partially unavailable"
          description={loadError}
        />
      )}
      {actionError && (
        <AlertBanner
          variant="error"
          title="Review action not completed"
          description={actionError}
        />
      )}
      {actionNotice && (
        <AlertBanner variant="success" title="Review action completed" description={actionNotice} />
      )}
      {!canReviewCase && (
        <AlertBanner
          variant="info"
          title="This case is no longer awaiting review"
          description="Reviewer decision buttons are only available while the case is still in submitted status."
        />
      )}

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-sm">Reviewer decision</CardTitle>
          <CardDescription>
            Approvals can include an optional note. Denials and change requests require a reviewer
            comment so the student can see what happened afterward.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={reviewComment}
            onChange={(event) => {
              setReviewComment(event.target.value);
              setActionError("");
            }}
            placeholder="Add a reviewer note. Denials and change requests require a comment."
            disabled={Boolean(actionLoading) || !canReviewCase}
            className="min-h-[120px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void submitReviewAction("approve")}
              disabled={Boolean(actionLoading) || !canReviewCase}
            >
              {actionLoading === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Approve case
            </Button>
            <Button
              variant="outline"
              onClick={() => void submitReviewAction("request_changes")}
              disabled={Boolean(actionLoading) || !canReviewCase}
            >
              {actionLoading === "request_changes" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Request changes
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitReviewAction("deny")}
              disabled={Boolean(actionLoading) || !canReviewCase}
            >
              {actionLoading === "deny" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Deny case
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
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
          {
            icon: FileText,
            label: "Documents",
            value: documents.length,
            color: "text-primary",
          },
          {
            icon: History,
            label: "Timeline",
            value: timeline.length,
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
        </TabsList>

        <TabsContent value="overview">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-sm">Case details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Employer", caseData.employer_name],
                  ["Role", caseData.role_title],
                  ["Location", caseData.work_location],
                  ["Process Type", caseData.process_type],
                  ["Risk Level", caseData.risk_level],
                  ["Owner ID", caseData.user_id],
                  [
                    "Start Date",
                    caseData.start_date ? new Date(caseData.start_date).toLocaleDateString() : null,
                  ],
                  [
                    "End Date",
                    caseData.end_date ? new Date(caseData.end_date).toLocaleDateString() : null,
                  ],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{(value as string) || "-"}</dd>
                  </div>
                ))}
              </dl>
              {caseData.case_summary && (
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs text-muted-foreground">Summary</p>
                  <p className="mt-1 text-sm">{caseData.case_summary}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements">
          {requirements.length === 0 ? (
            <EmptyState
              title="No requirement evaluation yet"
              description="Requirement rows will appear here after deterministic evaluation runs on the case."
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
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {statusConfig?.label || requirement.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents">
          {documents.length === 0 ? (
            <EmptyState
              title="No documents"
              description="Uploaded case documents will appear here for reviewer inspection."
            />
          ) : (
            <div className="space-y-2">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-card"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{document.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getDocumentTypeLabel(document.document_type)} - v{document.version_number}{" "}
                        - {document.upload_status}
                      </p>
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          {timeline.length === 0 ? (
            <EmptyState
              title="No timeline events"
              description="Timeline activity will appear here."
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
            <EmptyState title="No audit entries" description="Audit history will appear here." />
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
                      Reason
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
                      <td className="px-4 py-2 text-muted-foreground">{log.reason || "-"}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
