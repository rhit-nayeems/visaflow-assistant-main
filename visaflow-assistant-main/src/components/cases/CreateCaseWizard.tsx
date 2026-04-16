import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ProgressTracker } from "@/components/shared/ProgressTracker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertBanner } from "@/components/shared/AlertBanner";
import {
  deriveCaseStatusFromRequirements,
  evaluateCaseRequirements,
} from "@/lib/cases/requirements";
import { assertValidCaseStatusTransition } from "@/lib/cases/status";
import { Loader2, ArrowLeft, ArrowRight, Check, Upload, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type School = Tables<"schools">;
type SchoolTemplate = Tables<"school_templates">;
type CaseRecord = Tables<"cases">;
type Document = Tables<"documents">;
type ExtractedField = Tables<"extracted_fields">;

const WIZARD_STEPS = [
  { label: "School" },
  { label: "Internship" },
  { label: "Documents" },
  { label: "Review" },
  { label: "Confirm" },
];

export function CreateCaseWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [templates, setTemplates] = useState<SchoolTemplate[]>([]);

  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [caseSummary, setCaseSummary] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    supabase
      .from("schools")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setSchools(data || []);
      });
  }, []);

  useEffect(() => {
    if (!selectedSchoolId) {
      setTemplates([]);
      setSelectedTemplateId("");
      return;
    }

    setTemplates([]);
    setSelectedTemplateId("");

    supabase
      .from("school_templates")
      .select("*")
      .eq("school_id", selectedSchoolId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .then(({ data }) => {
        setTemplates(data || []);
        if (data && data.length === 1) {
          setSelectedTemplateId(data[0].id);
        }
      });
  }, [selectedSchoolId]);

  const saveDraft = async () => {
    if (!user) return null;
    setError("");

    if (caseId) {
      const { error } = await supabase
        .from("cases")
        .update({
          school_template_id: selectedTemplateId || null,
          employer_name: employerName || null,
          role_title: roleTitle || null,
          work_location: workLocation || null,
          start_date: startDate || null,
          end_date: endDate || null,
          case_summary: caseSummary || null,
        })
        .eq("id", caseId);
      if (error) setError(error.message);
      return caseId;
    }

    const { data, error } = await supabase
      .from("cases")
      .insert({
        user_id: user.id,
        school_template_id: selectedTemplateId || null,
        employer_name: employerName || null,
        role_title: roleTitle || null,
        work_location: workLocation || null,
        start_date: startDate || null,
        end_date: endDate || null,
        case_summary: caseSummary || null,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    setCaseId(data.id);

    await supabase.from("case_timeline_events").insert({
      case_id: data.id,
      event_type: "case_created",
      title: "Case created",
      description: "CPT case draft created",
    });

    return data.id;
  };

  const handleNext = async () => {
    setLoading(true);
    const id = await saveDraft();
    setLoading(false);
    if (id || caseId) {
      setStep((currentStep) => Math.min(currentStep + 1, 4));
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !caseId || !user) return;
    setLoading(true);
    setError("");

    const filePath = `${user.id}/${caseId}/${uploadFile.name}`;
    const { error: uploadError } = await supabase.storage
      .from("case-documents")
      .upload(filePath, uploadFile, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setLoading(false);
      return;
    }

    await supabase.from("documents").insert({
      case_id: caseId,
      file_name: uploadFile.name,
      file_path: filePath,
      document_type: "offer_letter",
      upload_status: "uploaded",
    });

    await supabase.from("case_timeline_events").insert({
      case_id: caseId,
      event_type: "document_uploaded",
      title: "Offer letter uploaded",
      description: uploadFile.name,
    });

    setUploadFile(null);
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!caseId || !user) return;

    setLoading(true);
    setError("");

    try {
      const { data: caseData, error: caseError } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .single();

      if (caseError || !caseData) {
        throw new Error(caseError?.message || "Unable to load the current case.");
      }

      let templateConfig: unknown = null;
      if (selectedTemplateId) {
        const { data: template, error: templateError } = await supabase
          .from("school_templates")
          .select("config_json")
          .eq("id", selectedTemplateId)
          .single();

        if (templateError) {
          throw new Error(templateError.message);
        }

        templateConfig = template?.config_json;
      }

      const { data: documents, error: documentsError } = await supabase
        .from("documents")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });

      if (documentsError) {
        throw new Error(documentsError.message);
      }

      const documentIds = (documents || []).map((document) => document.id);
      let extractedFields: ExtractedField[] = [];

      if (documentIds.length > 0) {
        const { data: extractedData, error: extractedError } = await supabase
          .from("extracted_fields")
          .select("*")
          .in("document_id", documentIds);

        if (extractedError) {
          throw new Error(extractedError.message);
        }

        extractedFields = extractedData || [];
      }

      const evaluatedRequirements = evaluateCaseRequirements({
        caseData: caseData as CaseRecord,
        documents: (documents || []) as Document[],
        extractedFields,
        templateConfig,
      });

      const nextStatus = assertValidCaseStatusTransition(
        caseData.status,
        deriveCaseStatusFromRequirements(evaluatedRequirements),
      );

      const { error: deleteRequirementsError } = await supabase
        .from("case_requirements")
        .delete()
        .eq("case_id", caseId);

      if (deleteRequirementsError) {
        throw new Error(deleteRequirementsError.message);
      }

      if (evaluatedRequirements.length > 0) {
        const { error: insertRequirementsError } = await supabase
          .from("case_requirements")
          .insert(evaluatedRequirements);

        if (insertRequirementsError) {
          throw new Error(insertRequirementsError.message);
        }
      }

      const { error: updateCaseError } = await supabase
        .from("cases")
        .update({ status: nextStatus })
        .eq("id", caseId);

      if (updateCaseError) {
        throw new Error(updateCaseError.message);
      }

      const statusLabel = nextStatus.replace(/_/g, " ");
      const [timelineResult, auditResult] = await Promise.all([
        supabase.from("case_timeline_events").insert({
          case_id: caseId,
          event_type: "status_changed",
          title: `Status changed to ${statusLabel}`,
          description: "Initial requirement evaluation completed.",
        }),
        supabase.from("audit_logs").insert({
          case_id: caseId,
          actor_id: user.id,
          action_type: "status_changed",
          field_name: "status",
          old_value: caseData.status,
          new_value: nextStatus,
          reason: "Initial deterministic CPT requirement evaluation completed.",
        }),
      ]);

      if (timelineResult.error) {
        throw new Error(timelineResult.error.message);
      }

      if (auditResult.error) {
        throw new Error(auditResult.error.message);
      }

      navigate({ to: "/cases/$caseId", params: { caseId } });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to finalize this case.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Create CPT Case</h1>
        <p className="text-sm text-muted-foreground">Complete each step to set up your case</p>
      </div>

      <ProgressTracker steps={WIZARD_STEPS} currentStep={step} />

      {error && <AlertBanner variant="error" title={error} />}

      {step === 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Select your school</CardTitle>
            <CardDescription>Choose the university for this CPT application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {schools.length === 0 && (
              <AlertBanner
                variant="warning"
                title="No active school templates found"
                description="Apply the latest Supabase migration to seed the default CPT school and template."
              />
            )}
            <div>
              <Label className="text-xs">University</Label>
              <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a university" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {templates.length > 1 && (
              <div>
                <Label className="text-xs">CPT Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.process_type} v{template.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Internship details</CardTitle>
            <CardDescription>Enter information about your internship position</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Employer name *</Label>
                <Input
                  value={employerName}
                  onChange={(e) => setEmployerName(e.target.value)}
                  placeholder="Acme Corp"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Role title *</Label>
                <Input
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="Software Engineer Intern"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Work location</Label>
              <Input
                value={workLocation}
                onChange={(e) => setWorkLocation(e.target.value)}
                placeholder="San Francisco, CA"
                className="mt-1"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Start date *</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">End date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes / summary</Label>
              <textarea
                value={caseSummary}
                onChange={(e) => setCaseSummary(e.target.value)}
                placeholder="Any additional context about this internship..."
                className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Upload documents</CardTitle>
            <CardDescription>Upload your offer letter and any supporting documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-2 border-dashed p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Drag and drop, or click to select a file
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG, PNG, or Word - up to 25MB
              </p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="mt-3"
              />
            </div>
            {uploadFile && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{uploadFile.name}</span>
                </div>
                <Button size="sm" onClick={handleUpload} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              You can also upload documents later from the case detail page.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Review your case</CardTitle>
            <CardDescription>Make sure everything looks correct before confirming</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {[
                ["Employer", employerName],
                ["Role", roleTitle],
                ["Location", workLocation],
                ["Start date", startDate],
                ["End date", endDate],
                ["Notes", caseSummary],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-foreground">{value || "-"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Confirm and create</CardTitle>
            <CardDescription>
              Your case will be created and evaluated against the selected CPT template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertBanner
              variant="info"
              title="What happens next?"
              description="VisaFlow will run a deterministic requirement check, update your case status, and log the initial status change."
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() =>
            step === 0 ? navigate({ to: "/cases" }) : setStep((currentStep) => currentStep - 1)
          }
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 4 ? (
          <Button
            onClick={handleNext}
            disabled={loading || (step === 0 && !selectedSchoolId)}
            className="gap-1.5"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleConfirm} disabled={loading} className="gap-1.5">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <Check className="h-4 w-4" /> Create Case
          </Button>
        )}
      </div>
    </div>
  );
}
