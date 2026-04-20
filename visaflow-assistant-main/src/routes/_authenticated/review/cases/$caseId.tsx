import { createFileRoute } from "@tanstack/react-router";
import { ReviewerCaseDetailPage } from "@/components/cases/ReviewerCaseDetailPage";

export const Route = createFileRoute("/_authenticated/review/cases/$caseId")({
  component: ReviewerCaseDetailRoute,
});

function ReviewerCaseDetailRoute() {
  const { caseId } = Route.useParams();
  return <ReviewerCaseDetailPage caseId={caseId} />;
}
