import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ClipboardCheck, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import type { CaseStatusKey } from "@/lib/constants";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";

type ReviewQueueCase = Pick<
  Tables<"cases">,
  | "id"
  | "user_id"
  | "employer_name"
  | "role_title"
  | "work_location"
  | "start_date"
  | "updated_at"
  | "status"
>;

const formatShortId = (value: string) => `${value.slice(0, 8)}...`;

export function ReviewerCasesQueuePage() {
  const { isLoading: authLoading, isSchoolAdmin } = useAuth();
  const [cases, setCases] = useState<ReviewQueueCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isSchoolAdmin) {
      setLoading(false);
      setCases([]);
      return;
    }

    setLoading(true);
    setError("");

    void supabase
      .from("cases")
      .select(
        "id, user_id, employer_name, role_title, work_location, start_date, updated_at, status",
      )
      .eq("status", "submitted")
      .order("updated_at", { ascending: false })
      .then(({ data, error: queueError }) => {
        setCases((data ?? []) as ReviewQueueCase[]);
        setError(queueError?.message ?? "");
        setLoading(false);
      });
  }, [authLoading, isSchoolAdmin]);

  const filteredCases = cases.filter((caseItem) => {
    const searchValue = search.toLowerCase();

    if (!searchValue) {
      return true;
    }

    return [
      caseItem.employer_name,
      caseItem.role_title,
      caseItem.work_location,
      caseItem.id,
      caseItem.user_id,
    ].some((value) => value?.toLowerCase().includes(searchValue));
  });

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
          icon={<ClipboardCheck className="h-5 w-5 text-muted-foreground" />}
          title="Reviewer access required"
          description="This queue is only available to school administrators with reviewer permissions."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
        <p className="text-sm text-muted-foreground">
          {cases.length} submitted case{cases.length === 1 ? "" : "s"} awaiting review
        </p>
      </div>

      {error && <AlertBanner variant="error" title="Queue not available" description={error} />}

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search submitted cases"
          className="pl-9"
        />
      </div>

      {filteredCases.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5 text-muted-foreground" />}
          title={cases.length === 0 ? "No submitted cases" : "No matching submitted cases"}
          description={
            cases.length === 0
              ? "Submitted CPT cases will appear here once students hand them off for review."
              : "Try a different employer, role, or case ID search."
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredCases.map((caseItem) => (
            <Link
              key={caseItem.id}
              to="/review/cases/$caseId"
              params={{ caseId: caseItem.id }}
              className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {caseItem.employer_name || "Untitled submitted case"}
                  </p>
                  <StatusBadge status={caseItem.status as CaseStatusKey} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {caseItem.role_title && <span>{caseItem.role_title}</span>}
                  {caseItem.work_location && <span>{caseItem.work_location}</span>}
                  {caseItem.start_date && (
                    <span>Starts {new Date(caseItem.start_date).toLocaleDateString()}</span>
                  )}
                  <span>Case {formatShortId(caseItem.id)}</span>
                  <span>Owner {formatShortId(caseItem.user_id)}</span>
                </div>
              </div>
              <span className="ml-4 whitespace-nowrap text-xs text-muted-foreground">
                Updated {formatDistanceToNow(new Date(caseItem.updated_at), { addSuffix: true })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
