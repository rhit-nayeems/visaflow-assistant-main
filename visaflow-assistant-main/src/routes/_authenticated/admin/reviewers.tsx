import { createFileRoute } from "@tanstack/react-router";
import { ReviewerAdminPage } from "@/components/admin/ReviewerAdminPage";

export const Route = createFileRoute("/_authenticated/admin/reviewers")({
  component: ReviewerAdminPage,
});
