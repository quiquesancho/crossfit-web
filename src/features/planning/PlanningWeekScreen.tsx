import { useEffect, useState } from "react";

import { getOrCreateDraftForSession } from "../execution/drafts";
import { fetchPlanningWeek, type PlannedSession, type PlanningWeek } from "./api";
import { currentWeekStart, formatSessionDate, formatWeekRange, shiftWeek } from "./dates";

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; week: PlanningWeek };

const DETAIL_LABELS: Record<string, string> = {
  sets: "Series",
  repetitions: "Repeticiones",
  rounds: "Rondas",
  loadGuidance: "Carga",
  format: "Formato",
  durationSeconds: "Duración",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatDetail(key: string, value: unknown): string {
  if (key === "durationSeconds" && typeof value === "number") return formatDuration(value);
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function SessionCard({ session }: { session: PlannedSession }) {
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function startExecution() {
    setDraftState("saving");
    try {
      await getOrCreateDraftForSession(session);
      setDraftState("saved");
    } catch {
      setDraftState("error");
    }
  }

  return (
    <details className="session-card">
      <summary className="session-heading">
        <div>
          <p className="session-date">{formatSessionDate(session.plannedDate)}</p>
          <h3>{session.title}</h3>
        </div>
        <div className="session-metrics">
          {session.durationSeconds ? <span>{formatDuration(session.durationSeconds)}</span> : null}
          {session.targetRpe ? <span>RPE {session.targetRpe}</span> : null}
        </div>
      </summary>
      <div className="session-detail">
        {session.objective ? <p className="session-objective">{session.objective}</p> : null}

        <div className="execution-action">
          <div>
            <strong>Registro del entrenamiento</strong>
            <p>Prepara un borrador local que podrás completar incluso sin conexión.</p>
          </div>
          <button disabled={draftState === "saving" || draftState === "saved"} onClick={startExecution}>
            {draftState === "saving"
              ? "Guardando…"
              : draftState === "saved"
                ? "Borrador preparado"
                : "Registrar sesión"}
          </button>
          {draftState === "error" ? <p role="alert">No se pudo crear el borrador local.</p> : null}
        </div>

        <div className="block-list">
          {session.blocks.map((block) => (
            <section className="training-block" key={block.id}>
              <div className="block-order">{block.position}</div>
              <div className="block-content">
                <div className="block-heading">
                  <div>
                    <span className={`block-type block-type-${block.blockType.code}`}>
                      {block.blockType.description}
                    </span>
                    <h4>{block.title}</h4>
                  </div>
                  <div className="block-metrics">
                    {block.durationSeconds ? <span>{formatDuration(block.durationSeconds)}</span> : null}
                    {block.targetRpe ? <span>RPE {block.targetRpe}</span> : null}
                  </div>
                </div>
                {block.instructions ? <p>{block.instructions}</p> : null}
                {block.prescriptions.map((item) => (
                  <div className="prescription" key={item.id}>
                    {item.movement ? <strong>{item.movement.name}</strong> : null}
                    {item.complex ? (
                      <strong>
                        {item.complex.name} · v{item.complex.versionNumber}
                      </strong>
                    ) : null}
                    {Object.keys(item.details).length > 0 ? (
                      <dl>
                        {Object.entries(item.details).map(([key, value]) => (
                          <div key={key}>
                            <dt>{DETAIL_LABELS[key] ?? key}</dt>
                            <dd>{formatDetail(key, value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {item.notes ? <p className="prescription-note">{item.notes}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </details>
  );
}

export function PlanningWeekScreen({ initialWeekStart }: { initialWeekStart?: string }) {
  const thisWeek = currentWeekStart();
  const [weekStart, setWeekStart] = useState(initialWeekStart ?? thisWeek);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchPlanningWeek(weekStart, controller.signal)
      .then((week) => setState(week ? { status: "ready", week } : { status: "empty" }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "Error desconocido" });
      });
    return () => controller.abort();
  }, [weekStart]);

  return (
    <section aria-labelledby="planning-title">
      <div className="week-toolbar">
        <div>
          <p className="eyebrow">Planificación</p>
          <h2 id="planning-title">{formatWeekRange(weekStart)}</h2>
        </div>
        <nav aria-label="Navegación semanal" className="week-navigation">
          <button aria-label="Semana anterior" onClick={() => setWeekStart((value) => shiftWeek(value, -1))}>
            ←
          </button>
          <button disabled={weekStart === thisWeek} onClick={() => setWeekStart(thisWeek)}>
            Esta semana
          </button>
          <button aria-label="Semana siguiente" onClick={() => setWeekStart((value) => shiftWeek(value, 1))}>
            →
          </button>
        </nav>
      </div>

      {state.status === "loading" ? <p className="state-panel">Cargando planificación…</p> : null}
      {state.status === "empty" ? (
        <div className="state-panel">
          <h3>Semana sin planificación</h3>
          <p>Todavía no hay un plan publicado para estas fechas.</p>
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="state-panel state-error" role="alert">
          <h3>No se pudo cargar la planificación</h3>
          <p>{state.message}</p>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <>
          <div className="plan-summary">
            <div>
              <p className="eyebrow">{state.week.planTitle}</p>
              <h3>{state.week.title ?? "Plan semanal"}</h3>
            </div>
            <span>{state.week.sessions.length} sesiones</span>
            {state.week.priorities ? <p>{state.week.priorities}</p> : null}
          </div>
          {state.week.sessions.length > 0 ? (
            <div className="session-list">
              {state.week.sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <p className="state-panel">La semana está publicada, pero no contiene sesiones.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
