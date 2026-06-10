import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { buildSupabaseServerFnHeaders } from "@/lib/server-functions";
import {
  assignReviewerToSchoolAction,
  loadReviewerAdminDataAction,
  revokeReviewerFromSchoolAction,
} from "@/server/admin/actions";
import type { ReviewerAdminData } from "@/server/admin/reviewer-admin.server";
import { groupAssignmentsBySchool, reviewerDisplayName } from "@/lib/admin/reviewer-assignments";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_DATA: ReviewerAdminData = { assignments: [], reviewers: [], schools: [] };

export function ReviewerAdminPage() {
  const { isLoading: authLoading, isPlatformAdmin, session } = useAuth();
  const [data, setData] = useState<ReviewerAdminData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadData = useServerFn(loadReviewerAdminDataAction);
  const assignReviewer = useServerFn(assignReviewerToSchoolAction);
  const revokeReviewer = useServerFn(revokeReviewerFromSchoolAction);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await loadData({
        data: {},
        headers: buildSupabaseServerFnHeaders(session),
      });
      setData(result);
    } catch (loadError) {
      setData(EMPTY_DATA);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load reviewer assignments.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadData, session]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isPlatformAdmin) {
      setLoading(false);
      setData(EMPTY_DATA);
      return;
    }

    void refresh();
  }, [authLoading, isPlatformAdmin, refresh]);

  const groups = useMemo(() => groupAssignmentsBySchool(data.assignments), [data.assignments]);

  const handleAssign = async () => {
    if (!selectedReviewer || !selectedSchool) {
      setActionError("Choose both a reviewer and a school.");
      return;
    }

    setSubmitting(true);
    setActionError("");
    setNotice("");

    try {
      await assignReviewer({
        data: { userId: selectedReviewer, schoolId: selectedSchool },
        headers: buildSupabaseServerFnHeaders(session),
      });
      setNotice("Reviewer assigned.");
      setSelectedReviewer("");
      setSelectedSchool("");
      await refresh();
    } catch (assignError) {
      setActionError(
        assignError instanceof Error ? assignError.message : "Unable to assign reviewer.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (assignmentId: string) => {
    setRevokingId(assignmentId);
    setActionError("");
    setNotice("");

    try {
      await revokeReviewer({
        data: { assignmentId },
        headers: buildSupabaseServerFnHeaders(session),
      });
      setNotice("Reviewer assignment removed.");
      await refresh();
    } catch (revokeError) {
      setActionError(
        revokeError instanceof Error ? revokeError.message : "Unable to remove assignment.",
      );
    } finally {
      setRevokingId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5 text-muted-foreground" />}
          title="Platform admin access required"
          description="Reviewer administration is only available to platform administrators."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Reviewer Admin</h1>
        <p className="text-sm text-muted-foreground">
          Assign school administrators to the schools whose cases they may review.
        </p>
      </div>

      {error && (
        <AlertBanner variant="error" title="Could not load assignments" description={error} />
      )}
      {actionError && <AlertBanner variant="error" title={actionError} />}
      {notice && <AlertBanner variant="success" title={notice} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign a reviewer</CardTitle>
          <CardDescription>
            Reviewers must already have the school_admin role. Assignments are idempotent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.reviewers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No school administrators exist yet. Grant the school_admin role first.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select value={selectedReviewer} onValueChange={setSelectedReviewer}>
                <SelectTrigger className="sm:flex-1" aria-label="Reviewer">
                  <SelectValue placeholder="Select reviewer" />
                </SelectTrigger>
                <SelectContent>
                  {data.reviewers.map((reviewer) => (
                    <SelectItem key={reviewer.userId} value={reviewer.userId}>
                      {reviewerDisplayName(reviewer)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSchool} onValueChange={setSelectedSchool}>
                <SelectTrigger className="sm:flex-1" aria-label="School">
                  <SelectValue placeholder="Select school" />
                </SelectTrigger>
                <SelectContent>
                  {data.schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={handleAssign}
                disabled={submitting || !selectedReviewer || !selectedSchool}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Assign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Current assignments ({data.assignments.length})
        </h2>

        {groups.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5 text-muted-foreground" />}
            title="No reviewer assignments yet"
            description="Assign a school administrator above to scope them to a school's review queue."
          />
        ) : (
          groups.map((group) => (
            <Card key={group.schoolId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{group.schoolName}</CardTitle>
                <CardDescription>
                  {group.reviewers.length} reviewer{group.reviewers.length === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.reviewers.map((reviewer) => (
                  <div
                    key={reviewer.assignmentId}
                    className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {reviewerDisplayName(reviewer)}
                      </p>
                      {reviewer.email && reviewer.fullName && (
                        <p className="truncate text-xs text-muted-foreground">{reviewer.email}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={revokingId === reviewer.assignmentId}
                      onClick={() => handleRevoke(reviewer.assignmentId)}
                    >
                      {revokingId === reviewer.assignmentId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Remove
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
