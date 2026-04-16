import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { TimelineItem } from "@/components/shared/TimelineItem";
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
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { CaseStatusKey } from "@/lib/constants";
import { REQUIREMENT_STATUSES } from "@/lib/constants";
import { getCaseNextRecommendedAction, summarizeRequirementRows } from "@/lib/cases/requirements";
import { formatDistanceToNow } from "date-fns";

type Case = Tables<"cases">;
type Document = Tables<"documents">;
type Requirement = Tables<"case_requirements">;
type TimelineEvent = Tables<"case_timeline_events">;
type AuditLog = Tables<"audit_logs">;
type CaseNote = Tables<"case_notes">;

interface CaseDetailProps {
  caseId: string;
}

export function CaseDetailPage({ caseId }: CaseDetailProps) {
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

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

  const addNote = async () => {
    if (!newNote.trim() || !user) return;
    setNoteLoading(true);
    await supabase.from("case_notes").insert({
      case_id: caseId,
      user_id: user.id,
      content: newNote.trim(),
    });
    await supabase.from("case_timeline_events").insert({
      case_id: caseId,
      event_type: "note_added",
      title: "Note added",
      description: newNote.trim().slice(0, 100),
    });
    setNewNote("");
    setNoteLoading(false);
    load();
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
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
                        {document.document_type.replace(/_/g, " ")} - v{document.version_number} -{" "}
                        {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-success">{document.upload_status}</span>
                </div>
              ))}
            </div>
          )}
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
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
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
