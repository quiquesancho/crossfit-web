function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"] as const;

export function monthStartOf(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function shiftMonth(monthStart: string, months: number): string {
  const date = dateFromIso(monthStart);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toIsoDate(date);
}

export function monthGrid(monthStart: string): string[] {
  const first = dateFromIso(monthStart);
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - offset);

  return Array.from({ length: total }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return toIsoDate(date);
  });
}

export function isSameMonth(date: string, monthStart: string): boolean {
  return date.slice(0, 7) === monthStart.slice(0, 7);
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatMonthTitle(monthStart: string): string {
  return capitalizeFirst(
    new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(dateFromIso(monthStart)),
  );
}

export function formatDayLong(value: string): string {
  return capitalizeFirst(
    new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(dateFromIso(value)),
  );
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateFromIso(value));
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function isToday(value: string, now = new Date()): boolean {
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
  return value === today;
}
