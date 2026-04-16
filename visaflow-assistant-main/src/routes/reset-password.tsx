import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordForm,
});
