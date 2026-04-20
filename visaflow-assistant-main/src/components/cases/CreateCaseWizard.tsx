import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { buildSupabaseServerFnHeaders } from "@/lib/server-functions";
import {
  finalizeCaseCreationAndEvaluateAction,
  registerUploadedCaseDocumentAction,
  saveCaseDraftAction,
} from "@/server/cases/actions";
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
  const { user, session } = useAuth();
  const [draftId] = useState(() => crypto.randomUUID());
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
  const [uploadRegistrationId, setUploadRegistrationId] = useState<string | null>(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");

  const saveCaseDraftMutation = useServerFn(saveCaseDraftAction);
  const registerUploadedCaseDocumentMutation = useServerFn(registerUploadedCaseDocumentAction);
  const finalizeCaseCreationAndEvaluateMutation = useServerFn(
    finalizeCaseCreationAndEvaluateAction,
  );

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

  const getServerFnHeaders = () => buildSupabaseServerFnHeaders(session);

  const saveDraft = async () => {
    if (!user) {
      return null;
    }

    const result = await saveCaseDraftMutation({
      data: {
        caseId: caseId ?? undefined,
        draftId,
        schoolId: selectedSchoolId,
        schoolTemplateId: selectedTemplateId || null,
        employerName: employerName || null,
        roleTitle: roleTitle || null,
        workLocation: workLocation || null,
        startDate: startDate || null,
        endDate: endDate || null,
        caseSummary: caseSummary || null,
      },
      headers: getServerFnHeaders(),
    });

    setCaseId(result.caseId);
    return result.caseId;
  };

  const handleNext = async () => {
    setLoading(true);
    setError("");

    try {
      const id = await saveDraft();
      if (id || caseId) {
        setStep((currentStep) => Math.min(currentStep + 1, 4));
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save this case draft.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !caseId || !user) {
      return;
    }

    setLoading(true);
    setError("");
    setUploadNotice("");
    setUploadWarning("");

    const nextUploadRegistrationId = uploadRegistrationId ?? crypto.randomUUID();
    const filePath = `${user.id}/${caseId}/${nextUploadRegistrationId}/${uploadFile.name}`;

    setUploadRegistrationId(nextUploadRegistrationId);

    const { error: uploadError } = await supabase.storage
      .from("case-documents")
      .upload(filePath, uploadFile, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setLoading(false);
      return;
    }

    try {
      const result = await registerUploadedCaseDocumentMutation({
        data: {
          caseId,
          fileName: uploadFile.name,
          filePath,
          documentType: "offer_letter",
          uploadRegistrationId: nextUploadRegistrationId,
        },
        headers: getServerFnHeaders(),
      });

      setUploadNotice(
        result.extractionStatus === "succeeded"
          ? result.reevaluationStatus
            ? "Offer letter uploaded, extracted, and re-evaluated successfully."
            : "Offer letter uploaded and extracted successfully."
          : "",
      );
      setUploadWarning(
        result.extractionStatus === "failed"
          ? `Offer letter uploaded, but local extraction failed. ${result.extractionError ?? "Retry extraction from the case detail page after creation."}`
          : "",
      );

      setUploadFile(null);
      setUploadRegistrationId(null);
      setUploadInputKey((currentKey) => currentKey + 1);
    } catch (uploadMutationError) {
      setError(
        uploadMutationError instanceof Error
          ? uploadMutationError.message
          : "Unable to register this uploaded document.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!caseId || !user) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await finalizeCaseCreationAndEvaluateMutation({
        data: { caseId },
        headers: getServerFnHeaders(),
      });

      navigate({ to: "/cases/$caseId", params: { caseId: result.caseId } });
    } catch (confirmError) {
      setError(
        confirmError instanceof Error ? confirmError.message : "Unable to finalize this case.",
      );
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
            <CardDescription>
              Upload your offer letter and any supporting documents. This build uses a local
              text-pattern extractor, not production OCR.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {uploadWarning && (
              <AlertBanner
                variant="warning"
                title="Document extraction needs attention"
                description={uploadWarning}
              />
            )}
            {uploadNotice && (
              <AlertBanner
                variant="success"
                title="Document upload completed"
                description={uploadNotice}
              />
            )}
            <div className="rounded-lg border-2 border-dashed p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Drag and drop, or click to select a file
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG, PNG, or Word - up to 25MB
              </p>
              <input
                key={uploadInputKey}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  const nextFile = e.target.files?.[0] || null;

                  setUploadNotice("");
                  setUploadWarning("");
                  setUploadFile(nextFile);
                  setUploadRegistrationId(nextFile ? crypto.randomUUID() : null);
                }}
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
