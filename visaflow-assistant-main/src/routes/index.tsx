import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "VisaFlow — CPT Workflow Platform for F-1 Students" },
      { name: "description", content: "Manage your CPT authorization process with structured workflows, document tracking, and requirement validation." },
      { property: "og:title", content: "VisaFlow — CPT Workflow Platform" },
      { property: "og:description", content: "Structured CPT workflow management for international students." },
    ],
  }),
});
