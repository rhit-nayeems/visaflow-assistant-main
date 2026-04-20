import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { FileText, Upload, CheckCircle, AlertCircle, Edit, Plus, Clock } from "lucide-react";

const eventIcons: Record<string, React.ElementType> = {
  case_created: Plus,
  document_uploaded: Upload,
  status_changed: Edit,
  requirement_met: CheckCircle,
  requirement_failed: AlertCircle,
  field_updated: Edit,
  note_added: FileText,
  case_evaluated: CheckCircle,
  default: Clock,
};

interface TimelineItemProps {
  eventType: string;
  title: string;
  description?: string | null;
  createdAt: string;
  className?: string;
}

export function TimelineItem({ eventType, title, description, createdAt, className }: TimelineItemProps) {
  const Icon = eventIcons[eventType] || eventIcons.default;

  return (
    <div className={cn("flex gap-3", className)}>
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="pb-6">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}