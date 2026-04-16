import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ProgressTracker } from "@/components/shared/ProgressTracker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { Loader2, ArrowLeft, ArrowRight, Check, Upload, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type School = Tables<"schools">;
type SchoolTemplate = Tables<"school_templates">;

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

  // Form state
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
    supabase.from("schools").select("*").eq("active", true).then(({ data }) => {
      setSchools(data || []);
    });
  }, []);

  useEffect(() => {
    if (selectedSchoolId) {
      supabase
        .from("school_templates")
        .select("*")
        .eq("school_id", selectedSchoolId)
        .eq("is_active", true)
        .then(({ data }) => {
          setTemplates(data || []);
          if (data && data.length === 1) {
            setSelectedTemplateId(data[0].id);
          }
        });
    }
  }, [selectedSchoolId]);

  const saveDraft = async () => {
    if (!user) return null;
    setError("");
    if (caseId) {
      // Update existing draft
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
    } else {
      // Create new draft
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

      // Add timeline event
      await supabase.from("case_timeline_events").insert({
        case_id: data.id,
        event_type: "case_created",
        title: "Case created",
        description: "CPT case draft created",
      });

      return data.id;
    }
  };

  const handleNext = async () => {
    setLoading(true);
    const id = await saveDraft();
    setLoading(false);
    if (id || caseId) {
      setStep((s) => Math.min(s + 1, 4));
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
    if (!caseId) return;
    setLoading(true);

    // Generate requirements from template
    if (selectedTemplateId) {
      const { data: template } = await supabase
        .from("school_templates")
        .select("config_json")
        .eq("id", selectedTemplateId)
        .single();

      if (template?.config_json) {
        const config = template.config_json as { requirements?: Array<{ key: string; label: string; severity: string }> };
        if (config.requirements) {
          const reqs = config.requirements.map((r) => ({
            case_id: caseId,
            requirement_key: r.key,
            label: r.label,
            severity: r.severity as "blocker" | "warning" | "info",
            status: "pending" as const,
            explanation: `This requirement must be met before submission.`,
            source: "template",
          }));
          await supabase.from("case_requirements").insert(reqs);
        }
      }
    }

    // Evaluate basic status
    const newStatus = (!employerName || !roleTitle || !startDate) ? "missing_documents" as const : "in_progress" as const;

    await supabase.from("cases").update({ status: newStatus }).eq("id", caseId);

    await supabase.from("case_timeline_events").insert({
      case_id: caseId,
      event_type: "status_changed",
      title: `Status changed to ${newStatus.replace(/_/g, " ")}`,
      description: "Case submitted from wizard",
    });

    setLoading(false);
    navigate({ to: "/cases/$caseId", params: { caseId } });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Create CPT Case</h1>
        <p className="text-sm text-muted-foreground">Complete each step to set up your case</p>
      </div>

      <ProgressTracker steps={WIZARD_STEPS} currentStep={step} />

      {error && <AlertBanner variant="error" title={error} />}

      {/* Step 0: School */}
      {step === 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Select your school</CardTitle>
            <CardDescription>Choose the university for this CPT application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">University</Label>
              <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a university" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.process_type} v{t.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Internship details */}
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
                <Input value={employerName} onChange={(e) => setEmployerName(e.target.value)} placeholder="Acme Corp" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Role title *</Label>
                <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Software Engineer Intern" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Work location</Label>
              <Input value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} placeholder="San Francisco, CA" className="mt-1" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Start date *</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">End date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
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

      {/* Step 2: Documents */}
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
                PDF, JPG, PNG, or Word — up to 25MB
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

      {/* Step 3: Review */}
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
                  <dd className="font-medium text-foreground">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Confirm & create</CardTitle>
            <CardDescription>
              Your case will be created and requirements will be generated based on your school's CPT template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertBanner
              variant="info"
              title="What happens next?"
              description="We'll check your case against your school's requirements and let you know if anything is missing. You can always update your case later."
            />
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => step === 0 ? navigate({ to: "/cases" }) : setStep((s) => s - 1)}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 4 ? (
          <Button onClick={handleNext} disabled={loading || (step === 0 && !selectedSchoolId)} className="gap-1.5">
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
