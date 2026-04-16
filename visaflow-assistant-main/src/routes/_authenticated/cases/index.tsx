import { createFileRoute } from "@tanstack/react-router";
import { CasesListPage } from "@/components/cases/CasesListPage";

export const Route = createFileRoute("/_authenticated/cases/")({
  component: CasesListPage,
});
