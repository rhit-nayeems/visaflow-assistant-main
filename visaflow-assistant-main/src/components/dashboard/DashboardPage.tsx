import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { TimelineItem } from "@/components/shared/TimelineItem";
import {
  FileText, Plus, AlertCircle, Clock, CheckCircle, BarChart3, Loader2,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { CaseStatusKey } from "@/lib/constants";

type Case = Tables<"cases">;
type TimelineEvent = Tables<"case_timeline_events">;

export function DashboardPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [casesRes, eventsRes] = await Promise.all([
        supabase.from("cases").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("case_timeline_events").select("*").order("created_at", { ascending: false }).limit(10),
      ]);
      setCases(casesRes.data || []);
      setEvents(eventsRes.data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeCases = cases.filter(c => !["completed", "denied"].includes(c.status));
  const blockedCases = cases.filter(c => c.status === "blocked" || c.status === "missing_documents");
  const readyCases = cases.filter(c => c.status === "ready_for_submission");
  const upcomingDeadlines = cases.filter(c => {
    if (!c.start_date) return false;
    const days = Math.ceil((new Date(c.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 && days <= 14;
  });

  const statCards = [
    { label: "Active Cases", value: activeCases.length, icon: FileText, color: "text-primary" },
    { label: "Blocked", value: blockedCases.length, icon: AlertCircle, color: "text-destructive" },
    { label: "Upcoming Deadlines", value: upcomingDeadlines.length, icon: Clock, color: "text-warning" },
    { label: "Ready to Submit", value: readyCases.length, icon: CheckCircle, color: "text-success" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your CPT workflow at a glance</p>
        </div>
        <Link to="/cases/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> New Case
          </Button>
        </Link>
      </div>

      {/* Alerts */}
      {blockedCases.length > 0 && (
        <AlertBanner
          variant="error"
          title={`${blockedCases.length} case${blockedCases.length > 1 ? "s" : ""} need${blockedCases.length === 1 ? "s" : ""} attention`}
          description="Missing documents or requirements are preventing progress. Review blocked cases."
          action={
            <Link to="/cases">
              <Button variant="outline" size="sm">View cases</Button>
            </Link>
          }
        />
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent cases */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Cases</CardTitle>
              <Link to="/cases" className="text-xs text-primary hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {cases.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5 text-muted-foreground" />}
                title="No cases yet"
                description="Create your first CPT case to get started."
                action={
                  <Link to="/cases/new">
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Create case
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {cases.slice(0, 5).map((c) => (
                  <Link
                    key={c.id}
                    to="/cases/$caseId"
                    params={{ caseId: c.id }}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {c.employer_name || "Untitled case"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.role_title || "No role specified"}
                      </p>
                    </div>
                    <StatusBadge status={c.status as CaseStatusKey} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="h-5 w-5 text-muted-foreground" />}
                title="No activity yet"
                description="Activity will appear here as you work on your cases."
              />
            ) : (
              <div>
                {events.slice(0, 6).map((event) => (
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
