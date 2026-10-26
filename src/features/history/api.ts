import { apiGet } from "../../shared/api/client";

export type ExecutionSummary = {
  id: string;
  executionDate: string;
  status: "draft" | "completed";
  origin: "planned" | "free";
  title: string;
  plannedSessionId: string | null;
  blockCount: number;
  rpe: number | null;
  revision: number;
  updatedAt: string;
};

export type CalendarPlannedSession = {
  id: string;
  title: string;
  objective: string | null;
};

export type CalendarDay = {
  date: string;
  planned: CalendarPlannedSession[];
  executions: ExecutionSummary[];
};

export type CalendarResponse = {
  days: CalendarDay[];
};

export type ExecutionHistoryPage = {
  items: ExecutionSummary[];
  nextCursor: string | null;
};

export function fetchCalendar(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<CalendarResponse> {
  const query = new URLSearchParams({ from, to });
  return apiGet<CalendarResponse>(`/calendar?${query.toString()}`, signal);
}

export function fetchExecutionHistory(
  options: { from?: string; to?: string; cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ExecutionHistoryPage> {
  const query = new URLSearchParams();
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  const serialized = query.toString();
  const suffix = serialized ? `?${serialized}` : "";
  return apiGet<ExecutionHistoryPage>(`/session-executions${suffix}`, signal);
}
