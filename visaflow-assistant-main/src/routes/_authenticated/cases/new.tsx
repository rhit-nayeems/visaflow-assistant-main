import { createFileRoute } from "@tanstack/react-router";
import { CreateCaseWizard } from "@/components/cases/CreateCaseWizard";

export const Route = createFileRoute("/_authenticated/cases/new")({
  component: CreateCaseWizard,
});
