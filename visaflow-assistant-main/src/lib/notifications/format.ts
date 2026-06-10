import type { Tables } from "../../integrations/supabase/types.ts";

export type NotificationRecord = Tables<"notifications">;

export type NotificationDateGroupLabel = "Today" | "Yesterday" | "Earlier";

/** Count unread notifications. */
export function getUnreadCount(
  notifications: ReadonlyArray<Pick<NotificationRecord, "read">>,
): number {
  return notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0);
}

/** Badge text for an unread count: "" when none, capped as "{max}+" beyond `max`. */
export function formatUnreadBadge(count: number, max = 9): string {
  if (count <= 0) {
    return "";
  }
  return count > max ? `${max}+` : String(count);
}

const startOfLocalDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Bucket a notification's timestamp into a human date group, relative to `now`. */
export function notificationDateGroup(
  createdAtIso: string,
  now: Date = new Date(),
): NotificationDateGroupLabel {
  const created = new Date(createdAtIso);
  if (Number.isNaN(created.getTime())) {
    return "Earlier";
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfLocalDay(now) - startOfLocalDay(created)) / dayMs);

  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return "Earlier";
}

export interface NotificationDateGroup {
  label: NotificationDateGroupLabel;
  items: NotificationRecord[];
}

const GROUP_ORDER: NotificationDateGroupLabel[] = ["Today", "Yesterday", "Earlier"];

/**
 * Group notifications (assumed already sorted newest-first) into ordered date sections,
 * preserving input order within each section and omitting empty sections.
 */
export function groupNotificationsByDate(
  notifications: NotificationRecord[],
  now: Date = new Date(),
): NotificationDateGroup[] {
  const buckets = new Map<NotificationDateGroupLabel, NotificationRecord[]>();

  for (const notification of notifications) {
    const label = notificationDateGroup(notification.created_at, now);
    const items = buckets.get(label) ?? [];
    items.push(notification);
    buckets.set(label, items);
  }

  return GROUP_ORDER.flatMap((label) => {
    const items = buckets.get(label);
    return items && items.length > 0 ? [{ label, items }] : [];
  });
}
