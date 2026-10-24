function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function currentWeekStart(now = new Date()): string {
  const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  localDate.setDate(localDate.getDate() - ((localDate.getDay() + 6) % 7));
  return [localDate.getFullYear(), localDate.getMonth() + 1, localDate.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

export function todayIsoDate(now = new Date()): string {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

export function weekStartOf(value: string): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return toIsoDate(date);
}

export function shiftWeek(weekStart: string, weeks: number): string {
  const date = dateFromIso(weekStart);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return toIsoDate(date);
}

export function formatWeekRange(weekStart: string): string {
  const start = dateFromIso(weekStart);
  const end = dateFromIso(shiftWeek(weekStart, 1));
  end.setUTCDate(end.getUTCDate() - 1);
  const formatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(dateFromIso(value));
}
