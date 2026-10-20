import { useEffect, useState } from "react";

import { getOrCreateDraftForSession, saveExecutionDraft } from "../execution/drafts";
import type { BlockExecutionMetrics, BlockExecutionStatus, ExecutionDraft } from "../execution/types";
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
  distanceMeters: "Distancia",
  calories: "Calorías",
};

const DETAIL_ORDER = ["sets", "repetitions", "load", "rounds", "distanceMeters", "calories"];

const LOAD_DETAIL_KEYS = ["prescribedWeightKg", "oneRepMaxPercentage", "loadGuidance"] as const;

const FORMAT_DETAIL_KEYS = new Set([
  "format",
  "durationSeconds",
  "intervalSeconds",
  "timeCapSeconds",
  "rounds",
]);

const WORKOUT_FORMAT_LABELS: Record<string, string> = {
  amrap: "AMRAP",
  emom: "EMOM",
  e2mom: "E2MOM",
  e3mom: "E3MOM",
  e4mom: "E4MOM",
  for_time: "For Time",
  rounds_for_time: "Rounds For Time",
};

type DetailEntry = { key: string; label: string; value: string };

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
  if (
    (key === "durationSeconds" || key === "intervalSeconds" || key === "timeCapSeconds") &&
    typeof value === "number"
  ) {
    return formatDuration(value);
  }
  if (key === "distanceMeters" && typeof value === "number") return `${value} m`;
  if (key === "calories" && typeof value === "number") return `${value} cal`;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function loadDetail(
  details: Record<string, unknown>,
  compactPercentage = false,
): string | null {
  const parts: string[] = [];
  if (typeof details.prescribedWeightKg === "number" && Number.isFinite(details.prescribedWeightKg)) {
    parts.push(`${details.prescribedWeightKg} kg`);
  }
  if (typeof details.oneRepMaxPercentage === "number" && Number.isFinite(details.oneRepMaxPercentage)) {
    parts.push(
      compactPercentage
        ? `${details.oneRepMaxPercentage} %`
        : `${details.oneRepMaxPercentage} % de tu 1RM`,
    );
  }
  if (parts.length > 0) return parts.join(" · ");
  if (typeof details.loadGuidance === "string" && details.loadGuidance.trim()) {
    return details.loadGuidance;
  }
  return null;
}

function detailEntries(
  details: Record<string, unknown>,
  isFormatPrescription: boolean,
  compactPercentage = false,
): DetailEntry[] {
  const hidden = new Set<string>(["format", ...LOAD_DETAIL_KEYS]);
  if (isFormatPrescription) {
    for (const key of FORMAT_DETAIL_KEYS) hidden.add(key);
  }

  const entries: DetailEntry[] = Object.entries(details)
    .filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      label: DETAIL_LABELS[key] ?? key,
      value: formatDetail(key, value),
    }));

  const load = loadDetail(details, compactPercentage);
  if (load) {
    const repetitionsIndex = entries.findIndex((entry) => entry.key === "repetitions");
    entries.splice(repetitionsIndex >= 0 ? repetitionsIndex + 1 : 0, 0, {
      key: "load",
      label: "Carga",
      value: load,
    });
  }

  return entries.sort((a, b) => {
    const aOrder = DETAIL_ORDER.indexOf(a.key);
    const bOrder = DETAIL_ORDER.indexOf(b.key);
    if (aOrder === -1 && bOrder === -1) return a.key.localeCompare(b.key);
    if (aOrder === -1) return 1;
    if (bOrder === -1) return -1;
    return aOrder - bOrder;
  });
}

function normalizeWorkoutFormat(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function workoutFormatLabel(format: string): string {
  return (
    WORKOUT_FORMAT_LABELS[format] ??
    format.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function numberDetail(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emomIntervalSeconds(format: string): number | null {
  if (format === "emom") return 60;
  const match = /^e(\d+)mom$/.exec(format);
  return match ? Number(match[1]) * 60 : null;
}

function workoutFormatMeta(
  format: string,
  details: Record<string, unknown>,
  blockDurationSeconds: number | null,
): string[] {
  const duration = numberDetail(details, "durationSeconds") ?? blockDurationSeconds;
  const timeCap = numberDetail(details, "timeCapSeconds");
  const rounds = numberDetail(details, "rounds");
  const interval = numberDetail(details, "intervalSeconds") ?? emomIntervalSeconds(format);

  if (format === "amrap") {
    return duration ? [formatDuration(duration)] : [];
  }
  if (format === "for_time") {
    return [timeCap ? `Cap ${formatDuration(timeCap)}` : "Sin límite"];
  }
  if (format === "rounds_for_time") {
    return [
      ...(rounds ? [`${rounds} rondas`] : []),
      timeCap ? `Cap ${formatDuration(timeCap)}` : "Sin límite",
    ];
  }
  if (interval) {
    const totalRounds = rounds ?? (duration ? Math.max(1, Math.round(duration / interval)) : null);
    return [
      ...(totalRounds ? [`${totalRounds} rondas`] : []),
      `cada ${formatDuration(interval)}`,
    ];
  }
  return duration ? [formatDuration(duration)] : [];
}

function findWorkoutFormat(block: PlannedBlock): {
  prescriptionId: string;
  format: string;
  details: Record<string, unknown>;
} | null {
  for (const item of block.prescriptions) {
    const value = item.details.format;
    if (typeof value === "string" && value.trim()) {
      return {
        prescriptionId: item.id,
        format: normalizeWorkoutFormat(value),
        details: item.details,
      };
    }
  }
  return null;
}

function isFormatOnlyPrescription(item: PlannedBlock["prescriptions"][number]): boolean {
  if (item.movement || item.complex || item.notes) return false;
  const keys = Object.keys(item.details);
  return keys.length > 0 && keys.every((key) => FORMAT_DETAIL_KEYS.has(key));
}

function hasStructuredLoad(details: Record<string, unknown>): boolean {
  return (
    typeof details.prescribedWeightKg === "number" ||
    typeof details.oneRepMaxPercentage === "number"
  );
}

function prescriptionDisplayName(item: PlannedBlock["prescriptions"][number]): string {
  if (item.movement) return item.movement.name;
  if (item.complex) return `${item.complex.name} · v${item.complex.versionNumber}`;
  return "Ejercicio";
}

function cleanMetrics(metrics: BlockExecutionMetrics): BlockExecutionMetrics | undefined {
  const next: BlockExecutionMetrics = {};
  if (metrics.rounds !== undefined) next.rounds = metrics.rounds;
  if (metrics.extraRepetitions !== undefined) next.extraRepetitions = metrics.extraRepetitions;
  const prescriptions = metrics.prescriptions?.filter(
    (item) => item.actualWeightKg !== undefined,
  );
  if (prescriptions && prescriptions.length > 0) next.prescriptions = prescriptions;
  return Object.keys(next).length > 0 ? next : undefined;
}

function amrapResultSummary(metrics: BlockExecutionMetrics | undefined): string | null {
  if (!metrics || (metrics.rounds === undefined && metrics.extraRepetitions === undefined)) {
    return null;
  }
  const parts: string[] = [];
  if (metrics.rounds !== undefined) {
    parts.push(`${metrics.rounds} ${metrics.rounds === 1 ? "ronda" : "rondas"}`);
  }
  if (metrics.extraRepetitions !== undefined && metrics.extraRepetitions > 0) {
    parts.push(
      `${metrics.extraRepetitions} ${
        metrics.extraRepetitions === 1 ? "repetición" : "repeticiones"
      }`,
    );
  }
  return parts.length > 0 ? parts.join(" + ") : null;
}

function MetricNumberInput({
  id,
  ariaLabel,
  value,
  placeholder,
  integer = false,
  onCommit,
}: {
  id: string;
  ariaLabel: string;
  value: number | undefined;
  placeholder?: string;
  integer?: boolean;
  onCommit: (value: number | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));

  useEffect(() => {
    setText(value === undefined ? "" : String(value));
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") {
      onCommit(undefined);
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
      setText(value === undefined ? "" : String(value));
      return;
    }
    onCommit(parsed);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
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
  const workoutFormat = findWorkoutFormat(block);
  const formatMeta = workoutFormat
    ? workoutFormatMeta(workoutFormat.format, workoutFormat.details, block.durationSeconds)
    : [];
  const showHeaderDuration = Boolean(block.durationSeconds) && formatMeta.length === 0;
  const isStrengthBlock = block.blockType.code === "strength";
  const prescriptionMetrics = executionBlock?.metrics?.prescriptions ?? [];
  const showMetrics =
    Boolean(executionBlock) &&
    (effectiveStatus === "completed" || effectiveStatus === "partial") &&
    !withoutMetrics;
  const isAmrap = workoutFormat?.format === "amrap";
  const amrapSummary = executionBlock ? amrapResultSummary(executionBlock.metrics) : null;

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

  function changePrescriptionWeight(
    plannedPrescriptionId: string,
    actualWeightKg: number | undefined,
  ) {
    if (!executionBlock) return;
    const current = executionBlock.metrics?.prescriptions ?? [];
    const prescriptions =
      actualWeightKg === undefined
        ? current.filter((item) => item.plannedPrescriptionId !== plannedPrescriptionId)
        : [
            ...current.filter((item) => item.plannedPrescriptionId !== plannedPrescriptionId),
            { plannedPrescriptionId, actualWeightKg },
          ];
    changeExecutionBlock({
      metrics: cleanMetrics({ ...executionBlock.metrics, prescriptions }),
    });
  }

  function changeAmrapMetric(
    key: "rounds" | "extraRepetitions",
    value: number | undefined,
  ) {
    if (!executionBlock) return;
    changeExecutionBlock({
      metrics: cleanMetrics({ ...executionBlock.metrics, [key]: value }),
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
          {showHeaderDuration && block.durationSeconds ? (
            <span>{formatDuration(block.durationSeconds)}</span>
          ) : null}
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
            {workoutFormat ? (
              <div className="workout-format">
                <span className="workout-format-name">
                  {workoutFormatLabel(workoutFormat.format)}
                </span>
                {formatMeta.map((item, index) => (
                  <span className="workout-format-meta" key={`${item}-${index}`}>
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
            {block.instructions ? <p className="block-instructions">{block.instructions}</p> : null}
            {block.prescriptions
              .filter((item) => !isFormatOnlyPrescription(item))
              .map((item) => {
                const entries = detailEntries(
                  item.details,
                  item.id === workoutFormat?.prescriptionId,
                  isStrengthBlock,
                );
                if (!item.movement && !item.complex && entries.length === 0 && !item.notes) {
                  return null;
                }
                const name = prescriptionDisplayName(item);
                const metric = prescriptionMetrics.find(
                  (entry) => entry.plannedPrescriptionId === item.id,
                );
                const actualWeight = metric?.actualWeightKg;
                const prescribedWeight =
                  typeof item.details.prescribedWeightKg === "number"
                    ? item.details.prescribedWeightKg
                    : undefined;
                const loadStatus =
                  actualWeight !== undefined && prescribedWeight !== undefined
                    ? actualWeight === prescribedWeight
                      ? "RX"
                      : "Escalado"
                    : null;
                const inputId = `load-${block.id}-${item.id}`;
                return (
                  <div className="prescription" key={item.id}>
                    <div className="prescription-heading">
                      {item.movement ? <strong>{item.movement.name}</strong> : null}
                      {item.complex ? (
                        <strong>
                          {item.complex.name} · v{item.complex.versionNumber}
                        </strong>
                      ) : null}
                      {showMetrics && hasStructuredLoad(item.details) ? (
                        <div className="prescription-load">
                          <label htmlFor={inputId}>Peso usado</label>
                          <MetricNumberInput
                            id={inputId}
                            ariaLabel={`Peso usado en ${name}`}
                            value={actualWeight}
                            placeholder={
                              prescribedWeight !== undefined ? String(prescribedWeight) : "0"
                            }
                            onCommit={(value) => changePrescriptionWeight(item.id, value)}
                          />
                          <span className="load-unit">kg</span>
                          {loadStatus ? (
                            <span
                              className={`load-badge load-badge-${
                                loadStatus === "RX" ? "rx" : "scaled"
                              }`}
                            >
                              {loadStatus}
                            </span>
                          ) : null}
                          {prescribedWeight !== undefined && actualWeight !== prescribedWeight ? (
                            <button
                              type="button"
                              className="load-rx-button"
                              aria-label={`Usar RX en ${name}`}
                              onClick={() => changePrescriptionWeight(item.id, prescribedWeight)}
                            >
                              Usar RX
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {entries.length > 0 ? (
                      <dl>
                        {entries.map((entry) => (
                          <div key={entry.key}>
                            <dt>{entry.label}</dt>
                            <dd>{entry.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {item.notes ? <p className="prescription-note">{item.notes}</p> : null}
                  </div>
                );
              })}
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
                {showMetrics && isAmrap ? (
                  <div className="block-amrap-result">
                    <p className="block-section-label">Resultado del AMRAP</p>
                    <div className="amrap-fields">
                      <div className="amrap-field">
                        <label htmlFor={`amrap-rounds-${block.id}`}>Rondas completadas</label>
                        <MetricNumberInput
                          id={`amrap-rounds-${block.id}`}
                          ariaLabel="Rondas completadas"
                          value={executionBlock.metrics?.rounds}
                          placeholder="0"
                          integer
                          onCommit={(value) => changeAmrapMetric("rounds", value)}
                        />
                      </div>
                      <div className="amrap-field">
                        <label htmlFor={`amrap-extra-${block.id}`}>
                          Repeticiones de la ronda en curso
                        </label>
                        <MetricNumberInput
                          id={`amrap-extra-${block.id}`}
                          ariaLabel="Repeticiones de la ronda en curso"
                          value={executionBlock.metrics?.extraRepetitions}
                          placeholder="0"
                          integer
                          onCommit={(value) => changeAmrapMetric("extraRepetitions", value)}
                        />
                      </div>
                    </div>
                    <p className="amrap-hint">
                      Si empezaste otra ronda, indica solo las repeticiones completadas.
                    </p>
                    {amrapSummary ? <p className="amrap-summary">{amrapSummary}</p> : null}
                  </div>
                ) : null}
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
