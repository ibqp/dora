const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** "14:05" for today, "23 Oct, 14:05" for other days. */
export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? timeFormat.format(date) : dateTimeFormat.format(date);
}

/** Full date and time, e.g. for tooltips: "23 Oct 2026, 14:05". */
export function formatFullDateTime(iso: string): string {
  return fullFormat.format(new Date(iso));
}
