import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNotifications } from "@/hooks/use-notifications";
import {
  formatUnreadBadge,
  groupNotificationsByDate,
  type NotificationRecord,
} from "@/lib/notifications/format";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, refresh } =
    useNotifications();

  const badge = formatUnreadBadge(unreadCount);
  const groups = groupNotificationsByDate(notifications);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void refresh();
    }
  };

  const handleSelect = (notification: NotificationRecord) => {
    if (!notification.read) {
      void markAsRead(notification.id);
    }
    setOpen(false);
    if (notification.case_id) {
      void navigate({ to: "/cases/$caseId", params: { caseId: notification.case_id } });
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" />
        {badge && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {badge}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllAsRead()}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading && notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading notifications…
            </p>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">You&apos;re all caught up.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="sticky top-0 z-10 bg-popover px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                {group.items.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleSelect(notification)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent",
                      !notification.read && "bg-accent/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {notification.title}
                      </span>
                      {!notification.read && (
                        <span
                          aria-label="Unread"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </div>
                    {notification.body && (
                      <span className="text-xs text-muted-foreground">{notification.body}</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
