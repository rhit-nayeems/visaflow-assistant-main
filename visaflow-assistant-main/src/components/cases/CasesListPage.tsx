import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Search, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { CaseStatusKey } from "@/lib/constants";
import { CASE_STATUSES } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

type Case = Tables<"cases">;

export function CasesListPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("cases")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setCases(data || []);
        setLoading(false);
      });
  }, [user]);

  const filtered = cases.filter((c) => {
    const matchesSearch =
      !search ||
      (c.employer_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.role_title || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CPT Cases</h1>
          <p className="text-sm text-muted-foreground">{cases.length} total cases</p>
        </div>
        <Link to="/cases/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> New Case
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(CASE_STATUSES).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cases list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5 text-muted-foreground" />}
          title={cases.length === 0 ? "No cases yet" : "No matching cases"}
          description={cases.length === 0 ? "Create your first CPT case to get started." : "Try adjusting your filters."}
          action={
            cases.length === 0 ? (
              <Link to="/cases/new">
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create case
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to="/cases/$caseId"
              params={{ caseId: c.id }}
              className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {c.employer_name || "Untitled case"}
                  </p>
                  <StatusBadge status={c.status as CaseStatusKey} />
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                  {c.role_title && <span>{c.role_title}</span>}
                  {c.work_location && <span>{c.work_location}</span>}
                  {c.start_date && (
                    <span>Starts {new Date(c.start_date).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                Updated {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
