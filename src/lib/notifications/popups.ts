import type { NotificationInboxResponse, StudyNotification } from '@/lib/types';

export interface PopupCursor { since: string; seen: Set<string> }

// A receipt, not a changed unread count, is the signal for a new alert.
export function collectNotificationPopups(result: NotificationInboxResponse, cursor: PopupCursor | null) {
  const seen = cursor?.seen ?? new Set<string>();
  const items = cursor && result.preferences.popups ? result.items.filter(item =>
    !seen.has(item.id) && !item.readAt && !item.archivedAt && Date.parse(item.receivedAt) >= Date.parse(cursor.since),
  ) : [];
  for (const item of result.items) seen.add(item.id);
  return { items, cursor: { since: cursor?.since ?? result.checkedAt, seen } };
}

export function appendNotificationPopups(current: StudyNotification[], incoming: StudyNotification[]) {
  return [...current, ...incoming.filter(item => !current.some(existing => existing.id === item.id))].slice(-3);
}

export function notifyStudyEvent() {
  window.dispatchEvent(new Event('sabaq:study-event'));
}
