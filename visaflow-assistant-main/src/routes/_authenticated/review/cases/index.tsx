import { createFileRoute } from "@tanstack/react-router";
import { ReviewerCasesQueuePage } from "@/components/cases/ReviewerCasesQueuePage";

export const Route = createFileRoute("/_authenticated/review/cases/")({
  component: ReviewerCasesQueuePage,
});
