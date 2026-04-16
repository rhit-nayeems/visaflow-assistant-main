import { cn } from "@/lib/utils";
import { CASE_STATUSES, type CaseStatusKey } from "@/lib/constants";

const colorMap = {
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-secondary text-secondary-foreground border-border",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning-foreground border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/20",
};

export function StatusBadge({ status, className }: { status: CaseStatusKey; className?: string }) {
  const config = CASE_STATUSES[status];
  if (!config) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        colorMap[config.color],
        className
      )}
    >
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        config.color === "success" && "bg-success",
        config.color === "destructive" && "bg-destructive",
        config.color === "warning" && "bg-warning",
        config.color === "info" && "bg-info",
        config.color === "primary" && "bg-primary",
        config.color === "secondary" && "bg-muted-foreground",
      )} />
      {config.label}
    </span>
  );
}
