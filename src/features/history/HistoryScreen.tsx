import { useEffect, useMemo, useState } from "react";

import { todayIsoDate } from "../planning/dates";
import {
  fetchCalendar,
  fetchExecutionHistory,
  type CalendarDay,
  type ExecutionSummary,
} from "./api";
import {
  WEEKDAY_LABELS,
  formatDayLong,
  formatMonthTitle,
  formatShortDate,
  formatUpdatedAt,
  isSameMonth,
  isToday,
  monthGrid,
  monthStartOf,
  shiftMonth,
} from "./dates";

const HISTORY_PAGE_SIZE = 10;

const EXECUTION_STATUS_LABELS = {
  draft: "Borrador",
  completed: "Finalizada",
} as const;

const ORIGIN_LABELS = {
  planned: "Desde la planificación",
  free: "Entrenamiento libre",
} as const;

type CalendarState =
  | { status: "loading" }
  | { status: "ready"; days: Map<string, CalendarDay> }
  | { status: "error"; message: string };

type HistoryStatus = "loading" | "ready" | "error";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} (${error.message})` : fallback;
}

function blockCountLabel(count: number): string {
  return count === 1 ? "1 bloque" : `${count} bloques`;
}

function executionCountLabel(count: number): string {
  return count === 1 ? "1 registro" : `${count} registros`;
}

function plannedCountLabel(count: number): string {
  return count === 1 ? "1 sesión planificada" : `${count} sesiones planificadas`;
}

function calendarDayLabel(date: string, day: CalendarDay | undefined): string {
  const parts = [formatDayLong(date)];
  if (day) {
    if (day.planned.length > 0) parts.push(plannedCountLabel(day.planned.length));
    if (day.executions.length > 0) parts.push(executionCountLabel(day.executions.length));
  }
  return parts.join(". ");
}

function ExecutionCard({
  execution,
  showDate = true,
  onOpenPlannedSession,
}: {
  execution: ExecutionSummary;
  showDate?: boolean;
  onOpenPlannedSession: (plannedSessionId: string, executionDate: string) => void;
}) {
  const plannedSessionId = execution.plannedSessionId;

  return (
    <article className="history-card">
      <div className="history-card-main">
        {showDate ? (
          <p className="session-date">
            {formatShortDate(execution.executionDate)} · {ORIGIN_LABELS[execution.origin]}
          </p>
        ) : (
          <p className="history-card-origin">{ORIGIN_LABELS[execution.origin]}</p>
        )}
        <h3>{execution.title}</h3>
        <p className="record-meta">
          <span>{blockCountLabel(execution.blockCount)}</span>
          {execution.rpe !== null ? <span>RPE {execution.rpe}</span> : null}
          <span>Actualizado {formatUpdatedAt(execution.updatedAt)}</span>
        </p>
      </div>
      <span className={`history-status history-status-${execution.status}`}>
        {EXECUTION_STATUS_LABELS[execution.status]}
      </span>
      <div className="history-card-actions">
        {plannedSessionId ? (
          <button
            type="button"
            className="link-button"
            onClick={() => onOpenPlannedSession(plannedSessionId, execution.executionDate)}
          >
            Abrir en la planificación
          </button>
        ) : (
          <span className="history-card-note">Entrenamiento libre</span>
        )}
      </div>
    </article>
  );
}

function DayPanel({
  date,
  day,
  calendarStatus,
  onOpenPlannedSession,
  onRetry,
}: {
  date: string;
  day: CalendarDay | undefined;
  calendarStatus: CalendarState["status"];
  onOpenPlannedSession: (plannedSessionId: string, executionDate: string) => void;
  onRetry: () => void;
}) {
  return (
    <section className="day-panel" aria-labelledby="day-panel-title">
      <p className="eyebrow">Día seleccionado</p>
      <h3 id="day-panel-title">{formatDayLong(date)}</h3>

      {calendarStatus === "loading" ? <p className="history-empty">Cargando el calendario…</p> : null}
      {calendarStatus === "error" ? (
        <div className="history-inline-error" role="alert">
          <p>No se pudo cargar el calendario.</p>
          <button type="button" className="link-button" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : null}

      {calendarStatus === "ready" ? (
        <>
          <h4 className="history-subtitle">Planificado</h4>
          {day && day.planned.length > 0 ? (
            <ul className="day-session-list">
              {day.planned.map((session) => (
                <li className="day-session" key={session.id}>
                  <div>
                    <strong>{session.title}</strong>
                    {session.objective ? <p>{session.objective}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onOpenPlannedSession(session.id, date)}
                  >
                    Ver sesión
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="history-empty">Sin sesión planificada para este día.</p>
          )}

          <h4 className="history-subtitle">Registrado</h4>
          {day && day.executions.length > 0 ? (
            <ul className="day-execution-list">
              {day.executions.map((execution) => (
                <li key={execution.id}>
                  <ExecutionCard
                    execution={execution}
                    showDate={false}
                    onOpenPlannedSession={onOpenPlannedSession}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="history-empty">Todavía no hay ejecuciones registradas este día.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

export function HistoryScreen({
  initialDate = todayIsoDate(),
  onOpenPlannedSession,
}: {
  initialDate?: string;
  onOpenPlannedSession: (plannedSessionId: string, executionDate: string) => void;
}) {
  const [monthStart, setMonthStart] = useState(() => monthStartOf(initialDate));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [calendar, setCalendar] = useState<CalendarState>({ status: "loading" });
  const [calendarReload, setCalendarReload] = useState(0);

  const [historyItems, setHistoryItems] = useState<ExecutionSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyReload, setHistoryReload] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const grid = useMemo(() => monthGrid(monthStart), [monthStart]);
  const from = grid[0]!;
  const to = grid[grid.length - 1]!;

  useEffect(() => {
    const controller = new AbortController();
    setCalendar({ status: "loading" });
    fetchCalendar(from, to, controller.signal)
      .then((response) => {
        setCalendar({
          status: "ready",
          days: new Map(response.days.map((day) => [day.date, day])),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCalendar({ status: "error", message: errorMessage(error, "No se pudo cargar el calendario.") });
      });
    return () => controller.abort();
  }, [from, to, calendarReload]);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryStatus("loading");
    setHistoryError(null);
    setHistoryItems(null);
    fetchExecutionHistory({ limit: HISTORY_PAGE_SIZE }, controller.signal)
      .then((page) => {
        setHistoryItems(page.items);
        setNextCursor(page.nextCursor);
        setHistoryStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHistoryStatus("error");
        setHistoryError(errorMessage(error, "No se pudo cargar el historial."));
      });
    return () => controller.abort();
  }, [historyReload]);

  function goToMonth(nextMonthStart: string) {
    setMonthStart(nextMonthStart);
    const today = todayIsoDate();
    setSelectedDate(isSameMonth(today, nextMonthStart) ? today : nextMonthStart);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setHistoryError(null);
    try {
      const page = await fetchExecutionHistory({
        cursor: nextCursor,
        limit: HISTORY_PAGE_SIZE,
      });
      setHistoryItems((current) => [...(current ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
      setHistoryStatus("ready");
    } catch (error) {
      setHistoryError(errorMessage(error, "No se pudo cargar más historial."));
      setHistoryStatus("error");
    } finally {
      setLoadingMore(false);
    }
  }

  const selectedDay = calendar.status === "ready" ? calendar.days.get(selectedDate) : undefined;
  const today = todayIsoDate();
  const currentMonth = monthStartOf(today);

  return (
    <section aria-labelledby="history-title">
      <div className="week-toolbar">
        <div>
          <p className="eyebrow">Evolución</p>
          <h2 id="history-title">Historial</h2>
        </div>
        <nav aria-label="Navegación mensual" className="week-navigation">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => goToMonth(shiftMonth(monthStart, -1))}
          >
            ←
          </button>
          <button
            type="button"
            disabled={monthStart === currentMonth}
            onClick={() => goToMonth(currentMonth)}
          >
            Este mes
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => goToMonth(shiftMonth(monthStart, 1))}
          >
            →
          </button>
        </nav>
      </div>

      <div className="history-layout">
        <section className="calendar-panel" aria-label={`Calendario de ${formatMonthTitle(monthStart)}`}>
          <div className="calendar-heading">
            <h3>{formatMonthTitle(monthStart)}</h3>
            {calendar.status === "error" ? (
              <button
                type="button"
                className="link-button"
                onClick={() => setCalendarReload((value) => value + 1)}
              >
                Reintentar
              </button>
            ) : null}
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="calendar-grid" aria-label="Días del mes">
            {grid.map((date) => {
              const day = calendar.status === "ready" ? calendar.days.get(date) : undefined;
              const outside = !isSameMonth(date, monthStart);
              const selected = date === selectedDate;
              return (
                <button
                  type="button"
                  key={date}
                  className={`calendar-day${outside ? " calendar-day-outside" : ""}${
                    selected ? " calendar-day-selected" : ""
                  }${isToday(date) ? " calendar-day-today" : ""}`}
                  aria-label={calendarDayLabel(date, day)}
                  aria-pressed={selected}
                  onClick={() => setSelectedDate(date)}
                >
                  <span className="calendar-day-number">{Number(date.slice(8))}</span>
                  <span className="calendar-day-markers">
                    {day && day.planned.length > 0 ? (
                      <span className="calendar-marker calendar-marker-planned" aria-hidden="true" />
                    ) : null}
                    {day && day.executions.length > 0 ? (
                      <span className="calendar-marker calendar-marker-done" aria-hidden="true" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="calendar-legend">
            <span>
              <span className="calendar-marker calendar-marker-planned" aria-hidden="true" /> Planificado
            </span>
            <span>
              <span className="calendar-marker calendar-marker-done" aria-hidden="true" /> Registrado
            </span>
          </p>
        </section>

        <DayPanel
          date={selectedDate}
          day={selectedDay}
          calendarStatus={calendar.status}
          onOpenPlannedSession={onOpenPlannedSession}
          onRetry={() => setCalendarReload((value) => value + 1)}
        />
      </div>

      <section className="history-list-section" aria-labelledby="history-list-title">
        <div className="history-list-heading">
          <div>
            <p className="eyebrow">Ejecuciones sincronizadas</p>
            <h3 id="history-list-title">Últimos registros</h3>
          </div>
        </div>

        {historyStatus === "loading" ? <p className="state-panel">Cargando historial…</p> : null}

        {historyStatus === "error" && historyItems === null ? (
          <div className="state-panel state-error" role="alert">
            <h3>No se pudo cargar el historial</h3>
            <p>{historyError}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setHistoryReload((value) => value + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {historyStatus === "ready" && historyItems !== null && historyItems.length === 0 ? (
          <div className="state-panel">
            <h3>Todavía no hay ejecuciones sincronizadas</h3>
            <p>
              Registra una sesión desde la planificación y pulsa «Sincronizar» para verla en el
              historial.
            </p>
          </div>
        ) : null}

        {historyItems !== null && historyItems.length > 0 ? (
          <ul className="history-list">
            {historyItems.map((execution) => (
              <li key={execution.id}>
                <ExecutionCard
                  execution={execution}
                  onOpenPlannedSession={onOpenPlannedSession}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {historyItems !== null && historyStatus === "error" ? (
          <p className="history-inline-error" role="alert">
            {historyError}
          </p>
        ) : null}

        {nextCursor ? (
          <div className="history-more">
            <button
              type="button"
              className="secondary-button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        ) : null}

        <p className="history-hint">
          El historial muestra las ejecuciones sincronizadas con el servidor. Los borradores que
          solo existen en este dispositivo aparecen en «Mis registros».
        </p>
      </section>
    </section>
  );
}
