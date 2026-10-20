import { useEffect, useState } from "react";

import { getOrCreateDraftForSession, saveExecutionDraft } from "../execution/drafts";
import type { BlockExecutionStatus, ExecutionDraft } from "../execution/types";
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
  recommendedWeightKg: "Peso recomendado",
  oneRepMaxPercentage: "% de tu 1RM",
  fallbackOneRepMaxPercentage: "Si no puedes",
  format: "Formato",
  durationSeconds: "Duración",
};

const BLOCK_STATUS_OPTIONS: Array<{
  value: Exclude<BlockExecutionStatus, "draft" | "completed_without_metric" | "abandoned">;
  label: string;
}> = [
  { value: "completed", label: "Realizado" },
  { value: "partial", label: "Parcial" },
  { value: "skipped", label: "Omitido" },
];

const BLOCK_STATUS_LABELS: Record<BlockExecutionStatus, string> = {
  draft: "Sin registrar",
  completed: "Realizado",
  completed_without_metric: "Realizado sin métricas",
  partial: "Parcial",
  skipped: "Omitido",
  abandoned: "Abandonado",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatDetail(key: string, value: unknown): string {
  if (key === "durationSeconds" && typeof value === "number") return formatDuration(value);
  if (key === "recommendedWeightKg" && typeof value === "number") return `${value} kg`;
  if (key === "oneRepMaxPercentage" && typeof value === "number") return `${value} %`;
  if (key === "fallbackOneRepMaxPercentage" && typeof value === "number") return `${value} % de tu 1RM`;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function visibleDetails(details: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(details).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
}

type PlannedBlock = PlannedSession["blocks"][number];
type ExecutionBlock = ExecutionDraft["snapshot"]["blocks"][number];

function effectiveBlockStatus(block: ExecutionBlock): ExecutionBlock["status"] {
  return block.status === "completed_without_metric" ? "completed" : block.status;
}

function hasNoMetrics(block: ExecutionBlock): boolean {
  return block.withoutMetrics ?? block.status === "completed_without_metric";
}

function blockStatusLabel(block: ExecutionBlock): string {
  const status = effectiveBlockStatus(block);
  if (hasNoMetrics(block) && (status === "completed" || status === "partial")) {
    return `${BLOCK_STATUS_LABELS[status]} sin métricas`;
  }
  return BLOCK_STATUS_LABELS[status];
}

function BlockAccordion({
  block,
  open,
  draft,
  onToggle,
  onDraftChange,
}: {
  block: PlannedBlock;
  open: boolean;
  draft: ExecutionDraft | null;
  onToggle: () => void;
  onDraftChange: (draft: ExecutionDraft) => void;
}) {
  const executionBlock = draft?.snapshot.blocks.find((item) => item.plannedBlockId === block.id);
  const effectiveStatus = executionBlock ? effectiveBlockStatus(executionBlock) : null;
  const withoutMetrics = executionBlock ? hasNoMetrics(executionBlock) : false;

  function changeExecutionBlock(changes: Partial<ExecutionBlock>) {
    if (!draft || !executionBlock) return;
    onDraftChange({
      ...draft,
      snapshot: {
        ...draft.snapshot,
        blocks: draft.snapshot.blocks.map((item) =>
          item.id === executionBlock.id ? { ...item, ...changes } : item,
        ),
      },
    });
  }

  return (
    <section className={`training-block${open ? " training-block-open" : ""}`}>
      <button
        type="button"
        className="block-toggle"
        aria-expanded={open}
        aria-controls={`block-panel-${block.id}`}
        aria-label={`${block.blockType.description}: ${block.title}`}
        onClick={onToggle}
      >
        <span className="block-order">{block.position}</span>
        <span className="block-summary-content">
          <span className={`block-type block-type-${block.blockType.code}`}>{block.blockType.description}</span>
          <strong>{block.title}</strong>
        </span>
        <span className="block-metrics">
          {block.durationSeconds ? <span>{formatDuration(block.durationSeconds)}</span> : null}
          {block.targetRpe ? <span>RPE {block.targetRpe}</span> : null}
          {executionBlock && effectiveStatus !== "draft" ? (
            <span className={`block-status-badge block-status-${effectiveStatus}`}>
              {blockStatusLabel(executionBlock)}
            </span>
          ) : null}
        </span>
        <span className="block-expand" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="block-panel" id={`block-panel-${block.id}`}>
          <div className="planned-block-content">
            <p className="block-section-label">Entrenamiento previsto</p>
            {block.instructions ? <p className="block-instructions">{block.instructions}</p> : null}
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
                    {visibleDetails(item.details).map(([key, value]) => (
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

          <div className="block-registration">
            <p className="block-section-label">Tu registro</p>
            {draft && executionBlock ? (
              <>
                <fieldset className="block-status-fieldset">
                  <legend>Estado del bloque</legend>
                  <p className="block-status-current" aria-live="polite">
                    <span className={`block-status-badge block-status-${effectiveStatus ?? "draft"}`}>
                      {executionBlock ? blockStatusLabel(executionBlock) : BLOCK_STATUS_LABELS.draft}
                    </span>
                  </p>
                  <div className="block-status-options">
                    {BLOCK_STATUS_OPTIONS.map((option) => {
                      const active = effectiveStatus === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`block-status-option block-status-${option.value}${
                            active ? " block-status-option-active" : ""
                          }`}
                          aria-pressed={active}
                          onClick={() =>
                            changeExecutionBlock(
                              active
                                ? { status: "draft", withoutMetrics: undefined }
                                : {
                                    status: option.value,
                                    withoutMetrics:
                                      option.value === "skipped" ? undefined : withoutMetrics,
                                  },
                            )
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                    {effectiveStatus === "completed" || effectiveStatus === "partial" ? (
                      <label className="block-metrics-check">
                        <input
                          type="checkbox"
                          checked={withoutMetrics}
                          onChange={(event) =>
                            changeExecutionBlock({
                              status: effectiveStatus,
                              withoutMetrics: event.target.checked,
                            })
                          }
                        />
                        <span>Sin métricas</span>
                      </label>
                    ) : null}
                  </div>
                </fieldset>
                <div className="block-notes">
                  <label htmlFor={`block-notes-${block.id}`}>Mis notas para este bloque</label>
                  <textarea
                    id={`block-notes-${block.id}`}
                    value={executionBlock.notes ?? ""}
                    placeholder="Técnica, sensaciones, ajustes o cualquier detalle útil…"
                    rows={3}
                    onChange={(event) => changeExecutionBlock({ notes: event.target.value || undefined })}
                  />
                </div>
              </>
            ) : (
              <p className="block-registration-prompt">
                Inicia el registro de la sesión para indicar el estado y añadir notas sin conexión.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SessionCard({ session }: { session: PlannedSession }) {
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draft, setDraft] = useState<ExecutionDraft | null>(null);
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);

  async function startExecution() {
    setDraftState("saving");
    try {
      const executionDraft = await getOrCreateDraftForSession(session);
      setDraft(executionDraft);
      setDraftState("saved");
    } catch {
      setDraftState("error");
    }
  }

  async function updateDraft(nextDraft: ExecutionDraft) {
    const pendingDraft: ExecutionDraft = {
      ...nextDraft,
      syncStatus: "pending",
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    setDraft(pendingDraft);
    try {
      await saveExecutionDraft(pendingDraft);
      setDraftState("saved");
    } catch {
      setDraftState("error");
    }
  }

  return (
    <details
      className="session-card"
      onToggle={(event) => {
        if (!event.currentTarget.open) setOpenBlockId(null);
      }}
    >
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
          <button disabled={draftState === "saving" || draft !== null} onClick={startExecution}>
            {draftState === "saving"
              ? "Guardando…"
              : draft
                ? "Borrador preparado"
                : "Registrar sesión"}
          </button>
          {draftState === "error" ? <p role="alert">No se pudo guardar el borrador local.</p> : null}
        </div>

        <div className="block-list">
          {session.blocks.map((block) => (
            <BlockAccordion
              key={block.id}
              block={block}
              open={openBlockId === block.id}
              draft={draft}
              onToggle={() => setOpenBlockId((current) => (current === block.id ? null : block.id))}
              onDraftChange={updateDraft}
            />
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
