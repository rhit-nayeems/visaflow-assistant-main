import { cn } from "@/lib/utils";
import { REQUIREMENT_SEVERITIES } from "@/lib/constants";

const colorMap = {
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-warning/10 text-warning-foreground border-warning/20",
  info: "bg-info/10 text-info border-info/20",
};

type SeverityKey = keyof typeof REQUIREMENT_SEVERITIES;

export function SeverityBadge({ severity, className }: { severity: SeverityKey; className?: string }) {
  const config = REQUIREMENT_SEVERITIES[severity];
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      colorMap[config.color],
      className
    )}>
      {config.label}
    </span>
  );
}
