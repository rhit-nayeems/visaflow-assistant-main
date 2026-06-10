import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getUnreadCount, type NotificationRecord } from "@/lib/notifications/format";

export type { NotificationRecord };

const NOTIFICATION_FETCH_LIMIT = 50;
const NOTIFICATION_POLL_INTERVAL_MS = 60_000;

/**
 * Loads the signed-in user's notifications (RLS-scoped) and keeps them fresh via a Supabase
 * Realtime subscription, with window-focus and interval refetches as resilient fallbacks.
 * Reads/updates go through the browser client directly (same pattern AuthProvider uses for
 * roles); rows are only ever created server-side by the case-status trigger.
 */
export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_FETCH_LIMIT);

    if (error) {
      console.error("[notifications] failed to load", error);
    } else {
      setNotifications(data ?? []);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    void refresh();

    // Live updates: refetch whenever this user's notifications change.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();

    // Fallbacks in case Realtime is unavailable.
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", handleFocus);
    const intervalId = window.setInterval(() => {
      void refresh();
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(intervalId);
    };
  }, [userId, refresh]);

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification,
        ),
      );

      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);

      if (error) {
        console.error("[notifications] failed to mark read", error);
        void refresh();
      }
    },
    [refresh],
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId) {
      return;
    }

    setNotifications((prev) =>
      prev.map((notification) =>
        notification.read ? notification : { ...notification, read: true },
      ),
    );

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) {
      console.error("[notifications] failed to mark all read", error);
      void refresh();
    }
  }, [userId, refresh]);

  const unreadCount = getUnreadCount(notifications);

  return { notifications, unreadCount, isLoading, refresh, markAsRead, markAllAsRead };
}
