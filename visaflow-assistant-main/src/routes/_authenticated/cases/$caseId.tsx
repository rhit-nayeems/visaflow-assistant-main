import { createFileRoute } from "@tanstack/react-router";
import { CaseDetailPage } from "@/components/cases/CaseDetailPage";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  component: CaseDetailRoute,
});

function CaseDetailRoute() {
  const { caseId } = Route.useParams();
  return <CaseDetailPage caseId={caseId} />;
}
