import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Shield,
  Clock,
  CheckCircle,
  ArrowRight,
  BarChart3,
  Bell,
} from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "Document Tracking",
    description: "Upload and manage offer letters, I-20s, and advisor approvals with version control and validation status.",
  },
  {
    icon: Shield,
    title: "Requirement Validation",
    description: "Automatically check your case against your school's CPT requirements. Clear blocker and warning explanations.",
  },
  {
    icon: Clock,
    title: "Deadline Management",
    description: "Never miss a deadline. Track lead times, submission windows, and program start dates in one view.",
  },
  {
    icon: BarChart3,
    title: "Case Dashboard",
    description: "See all your cases at a glance — status, blockers, progress, and what needs attention next.",
  },
  {
    icon: Bell,
    title: "Smart Alerts",
    description: "Get notified when requirements change, documents expire, or action is needed on your case.",
  },
  {
    icon: CheckCircle,
    title: "Submission Readiness",
    description: "Know exactly when your case is ready for submission. No guesswork, no missed steps.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md gradient-hero">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">VisaFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
          <Shield className="h-3 w-3" />
          Built for F-1 students
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Your CPT workflow,
          <br />
          <span className="text-primary">under control.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          VisaFlow is a structured workflow platform for international students managing CPT authorization. Track requirements, upload documents, and know exactly when you're ready to submit.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/signup">
            <Button size="lg" className="gap-2">
              Start your case <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="lg">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-surface/50">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-foreground">Everything you need for CPT</h2>
            <p className="mt-2 text-muted-foreground">
              Stop juggling spreadsheets and emails. VisaFlow gives you a clear, structured path to CPT authorization.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-foreground">
            Ready to simplify your CPT process?
          </h2>
          <p className="mt-2 text-muted-foreground">
            Create your free account and start your first CPT case in minutes.
          </p>
          <Link to="/signup">
            <Button size="lg" className="mt-6 gap-2">
              Get started free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded gradient-hero">
                <FileText className="h-3 w-3 text-primary-foreground" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">VisaFlow</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Not legal advice. VisaFlow helps organize your CPT workflow — consult your DSO for official guidance.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
