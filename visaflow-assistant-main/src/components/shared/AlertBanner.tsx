import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

type AlertVariant = "warning" | "error" | "info" | "success";

const variants: Record<AlertVariant, { icon: React.ElementType; classes: string }> = {
  warning: {
    icon: AlertTriangle,
    classes: "border-warning/30 bg-warning/5 text-warning-foreground",
  },
  error: {
    icon: AlertCircle,
    classes: "border-destructive/30 bg-destructive/5 text-destructive",
  },
  info: {
    icon: Info,
    classes: "border-info/30 bg-info/5 text-info",
  },
  success: {
    icon: CheckCircle,
    classes: "border-success/30 bg-success/5 text-success",
  },
};

interface AlertBannerProps {
  variant: AlertVariant;
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
}

export function AlertBanner({ variant, title, description, className, action }: AlertBannerProps) {
  const config = variants[variant];
  const Icon = config.icon;

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", config.classes, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-xs opacity-80">{description}</p>}
      </div>
      {action}
    </div>
  );
}
