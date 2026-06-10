import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getUnreadCount,
  formatUnreadBadge,
  notificationDateGroup,
  groupNotificationsByDate,
  type NotificationRecord,
} from "./format.ts";

const mk = (id: string, createdAt: string, read = false): NotificationRecord =>
  ({
    id,
    user_id: "user-1",
    case_id: "case-1",
    type: "case_status",
    title: id,
    body: null,
    read,
    scheduled_for: null,
    created_at: createdAt,
  }) as NotificationRecord;

test("getUnreadCount counts only unread notifications", () => {
  assert.equal(getUnreadCount([]), 0);
  assert.equal(getUnreadCount([{ read: false }, { read: true }, { read: false }]), 2);
  assert.equal(getUnreadCount([{ read: true }, { read: true }]), 0);
});

test("formatUnreadBadge formats and caps the count", () => {
  assert.equal(formatUnreadBadge(0), "");
  assert.equal(formatUnreadBadge(-3), "");
  assert.equal(formatUnreadBadge(1), "1");
  assert.equal(formatUnreadBadge(9), "9");
  assert.equal(formatUnreadBadge(10), "9+");
  assert.equal(formatUnreadBadge(250, 99), "99+");
});

test("notificationDateGroup buckets timestamps relative to now", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0);
  assert.equal(notificationDateGroup(new Date(2026, 5, 9, 1, 0, 0).toISOString(), now), "Today");
  assert.equal(
    notificationDateGroup(new Date(2026, 5, 8, 23, 0, 0).toISOString(), now),
    "Yesterday",
  );
  assert.equal(notificationDateGroup(new Date(2026, 5, 1, 9, 0, 0).toISOString(), now), "Earlier");
});

test("notificationDateGroup is defensive about bad input and future dates", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0);
  assert.equal(notificationDateGroup("not-a-date", now), "Earlier");
  assert.equal(notificationDateGroup(new Date(2026, 5, 10, 9, 0, 0).toISOString(), now), "Today");
});

test("groupNotificationsByDate orders sections, preserves order, and skips empties", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0);
  const items = [
    mk("a", new Date(2026, 5, 9, 10, 0, 0).toISOString()),
    mk("b", new Date(2026, 5, 9, 8, 0, 0).toISOString()),
    mk("c", new Date(2026, 5, 1, 8, 0, 0).toISOString()),
  ];

  const groups = groupNotificationsByDate(items, now);

  // No "Yesterday" items → that section is omitted.
  assert.deepEqual(
    groups.map((group) => group.label),
    ["Today", "Earlier"],
  );
  assert.deepEqual(
    groups[0].items.map((item) => item.id),
    ["a", "b"],
  );
  assert.deepEqual(
    groups[1].items.map((item) => item.id),
    ["c"],
  );
});
