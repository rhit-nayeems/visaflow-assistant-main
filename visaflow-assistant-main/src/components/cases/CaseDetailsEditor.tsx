import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { canEditCaseDetails } from "@/lib/cases/details";
import { buildSupabaseServerFnHeaders } from "@/lib/server-functions";
import { updateCaseDetailsAction } from "@/server/cases/actions";
import { validateUpdateCaseDetailsInput } from "@/server/cases/validation";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CaseDetailsEditor({
  caseData,
  onSaved,
}: {
  caseData: Tables<"cases">;
  onSaved: () => Promise<void>;
}) {
  const { session } = useAuth();
  const updateDetails = useServerFn(updateCaseDetailsAction);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({
    employerName: caseData.employer_name ?? "",
    roleTitle: caseData.role_title ?? "",
    workLocation: caseData.work_location ?? "",
    startDate: caseData.start_date ?? "",
    endDate: caseData.end_date ?? "",
    caseSummary: caseData.case_summary ?? "",
  });
  if (!canEditCaseDetails(caseData.status)) return null;
  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      {error && <AlertBanner variant="error" title="Details not saved" description={error} />}
      {notice && <AlertBanner variant="success" title="Details saved" description={notice} />}
      {!editing ? (
        <Button
          variant="outline"
          onClick={() => {
            setDraft({
              employerName: caseData.employer_name ?? "",
              roleTitle: caseData.role_title ?? "",
              workLocation: caseData.work_location ?? "",
              startDate: caseData.start_date ?? "",
              endDate: caseData.end_date ?? "",
              caseSummary: caseData.case_summary ?? "",
            });
            setNotice("");
            setError("");
            setEditing(true);
          }}
        >
          Edit internship details
        </Button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError("");
            try {
              const data = validateUpdateCaseDetailsInput({
                ...draft,
                caseId: caseData.id,
                expectedUpdatedAt: caseData.updated_at,
              });
              const result = await updateDetails({
                data,
                headers: buildSupabaseServerFnHeaders(session),
              });
              await onSaved();
              setEditing(false);
              setNotice(
                result.needsReapproval
                  ? "Employment details changed. The case now needs reapproval; review the documents and resubmit when ready."
                  : "Internship details saved and requirements refreshed.",
              );
            } catch (saveError) {
              setError(
                saveError instanceof Error ? saveError.message : "Unable to save these details.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {caseData.status === "approved" && (
            <AlertBanner
              variant="warning"
              title="Changes may require reapproval"
              description="Changing the employer, work location, start date, or end date moves this approved case to Changes Pending."
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["employerName", "Employer", "text"],
                ["roleTitle", "Role title", "text"],
                ["workLocation", "Work location", "text"],
                ["startDate", "Start date", "date"],
                ["endDate", "End date", "date"],
              ] as const
            ).map(([key, label, type]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`case-edit-${key}`}>{label}</Label>
                <Input
                  id={`case-edit-${key}`}
                  type={type}
                  value={draft[key]}
                  disabled={saving}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="case-edit-summary">Notes</Label>
            <Textarea
              id="case-edit-summary"
              value={draft.caseSummary}
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, caseSummary: event.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save details
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
