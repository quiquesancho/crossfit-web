import { useEffect, useRef, useState } from "react";

import {
  findDraftForSession,
  getOrCreateDraftForSession,
  saveExecutionDraft,
  synchronizeExecutionDraft,
} from "../execution/drafts";
import { BlockRpeField, FeelingFields } from "../execution/FeelingFields";
import { MetricNumberInput } from "../execution/MetricNumberInput";
import { SetAttemptsEditor } from "../execution/SetAttemptsEditor";
import {
  BLOCK_STATUS_LABELS,
  BLOCK_STATUS_OPTIONS,
  SYNC_STATUS_LABELS,
  blockStatusLabel,
  effectiveBlockStatus,
  hasNoMetrics,
} from "../execution/status";
import { SubstitutionEditor } from "../execution/SubstitutionEditor";
import type {
  BlockExecutionMetrics,
  ExecutionDraft,
  Feeling,
  LoadStatus,
  PrescriptionExecutionMetric,
  Substitution,
  WeightValue,
} from "../execution/types";
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

const LOAD_DETAIL_KEYS = [
  "prescribedWeight",
  "prescribedWeightKg",
  "oneRepMaxPercentage",
  "loadGuidance",
  "weightUnit",
] as const;

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

const SET_ATTEMPT_BLOCK_TYPES = new Set([
  "strength",
  "technique",
  "weightlifting",
  "gymnastics",
]);

type LoadDisplay =
  | { kind: "guidance"; text: string }
  | {
      kind: "values";
      weight?: WeightValue;
      percentage?: number;
      compactPercentage: boolean;
    };

type DetailEntry = { key: string; label: string; value: string; load?: LoadDisplay };

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prescribedWeight(details: Record<string, unknown>): WeightValue | undefined {
  const structured = details.prescribedWeight;
  if (isObject(structured)) {
    const amount = structured.amount;
    const unit = structured.unit;
    if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) {
      return {
        amount,
        unit: typeof unit === "string" && unit.trim() ? unit.trim() : "kg",
      };
    }
  }
  if (
    typeof details.prescribedWeightKg === "number" &&
    Number.isFinite(details.prescribedWeightKg) &&
    details.prescribedWeightKg >= 0
  ) {
    return { amount: details.prescribedWeightKg, unit: "kg" };
  }
  return undefined;
}

function weightUnit(details: Record<string, unknown>): string {
  const load = prescribedWeight(details);
  if (load) return load.unit;
  if (typeof details.weightUnit === "string" && details.weightUnit.trim()) {
    return details.weightUnit.trim();
  }
  return "kg";
}

function loadDisplay(
  details: Record<string, unknown>,
  compactPercentage: boolean,
): LoadDisplay | null {
  const weight = prescribedWeight(details);
  const percentage =
    typeof details.oneRepMaxPercentage === "number" && Number.isFinite(details.oneRepMaxPercentage)
      ? details.oneRepMaxPercentage
      : undefined;
  if (weight || percentage !== undefined) {
    return { kind: "values", weight, percentage, compactPercentage };
  }
  if (typeof details.loadGuidance === "string" && details.loadGuidance.trim()) {
    return { kind: "guidance", text: details.loadGuidance };
  }
  return null;
}

function loadDisplayText(display: LoadDisplay): string {
  if (display.kind === "guidance") return display.text;
  const parts: string[] = [];
  if (display.weight) parts.push(`${display.weight.amount} ${display.weight.unit}`);
  if (display.percentage !== undefined) {
    parts.push(
      display.compactPercentage
        ? `${display.percentage} %`
        : `${display.percentage} % de tu 1RM`,
    );
  }
  return parts.join(" · ");
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

  const load = loadDisplay(details, compactPercentage);
  if (load) {
    const repetitionsIndex = entries.findIndex((entry) => entry.key === "repetitions");
    entries.splice(repetitionsIndex >= 0 ? repetitionsIndex + 1 : 0, 0, {
      key: "load",
      label: "Carga",
      value: loadDisplayText(load),
      load,
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

/** Fallback while older API deployments do not expose `allowsActualWeight`. */
function hasStructuredLoad(details: Record<string, unknown>): boolean {
  return (
    prescribedWeight(details) !== undefined ||
    (typeof details.oneRepMaxPercentage === "number" &&
      Number.isFinite(details.oneRepMaxPercentage))
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
    (item) =>
      item.actualWeight !== undefined ||
      item.actualWeightKg !== undefined ||
      item.loadStatus !== undefined,
  );
  if (prescriptions && prescriptions.length > 0) next.prescriptions = prescriptions;
  return Object.keys(next).length > 0 ? next : undefined;
}

function metricActualWeight(
  metric: PrescriptionExecutionMetric | undefined,
): WeightValue | undefined {
  if (metric?.actualWeight) return metric.actualWeight;
  if (typeof metric?.actualWeightKg === "number" && Number.isFinite(metric.actualWeightKg)) {
    return { amount: metric.actualWeightKg, unit: "kg" };
  }
  return undefined;
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

function LoadPartView({
  amount,
  unit,
  suffix,
}: {
  amount: number;
  unit: string;
  suffix?: string;
}) {
  return (
    <span className="load-part">
      <span className="load-amount">{amount}</span>{" "}
      <span className="load-unit">{unit}</span>
      {suffix ? (
        <>
          {" "}
          <span className="load-suffix">{suffix}</span>
        </>
      ) : null}
    </span>
  );
}

function LoadValueView({ display }: { display: LoadDisplay }) {
  if (display.kind === "guidance") return <>{display.text}</>;
  return (
    <span className="load-value">
      {display.weight ? (
        <LoadPartView amount={display.weight.amount} unit={display.weight.unit} />
      ) : null}
      {display.weight && display.percentage !== undefined ? " · " : null}
      {display.percentage !== undefined ? (
        <LoadPartView
          amount={display.percentage}
          unit="%"
          suffix={display.compactPercentage ? undefined : "de tu 1RM"}
        />
      ) : null}
    </span>
  );
}

type PlannedBlock = PlannedSession["blocks"][number];
type ExecutionBlock = ExecutionDraft["snapshot"]["blocks"][number];

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
  const supportsAttempts = SET_ATTEMPT_BLOCK_TYPES.has(block.blockType.code);
  const prescriptionMetrics = executionBlock?.metrics?.prescriptions ?? [];
  const substitutions = executionBlock?.substitutions ?? [];
  const [substitutingId, setSubstitutingId] = useState<string | null>(null);
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

  function changePrescriptionMetric(
    plannedPrescriptionId: string,
    changes: Partial<PrescriptionExecutionMetric>,
  ) {
    if (!executionBlock) return;
    const current = executionBlock.metrics?.prescriptions ?? [];
    const existing = current.find((item) => item.plannedPrescriptionId === plannedPrescriptionId);
    const next: PrescriptionExecutionMetric = {
      ...existing,
      plannedPrescriptionId,
      ...changes,
    };
    if (next.actualWeight === undefined) delete next.actualWeight;
    if (next.actualWeightKg !== undefined) delete next.actualWeightKg;
    const prescriptions = current.filter(
      (item) => item.plannedPrescriptionId !== plannedPrescriptionId,
    );
    if (next.actualWeight !== undefined || next.loadStatus !== undefined) {
      prescriptions.push(next);
    }
    changeExecutionBlock({
      metrics: cleanMetrics({ ...executionBlock.metrics, prescriptions }),
    });
  }

  function changePrescriptionLoadStatus(
    plannedPrescriptionId: string,
    status: LoadStatus,
    prescribed: WeightValue | undefined,
    currentWeight: WeightValue | undefined,
  ) {
    if (status === "rx" && prescribed) {
      changePrescriptionMetric(plannedPrescriptionId, {
        loadStatus: "rx",
        actualWeight: prescribed,
      });
      return;
    }
    if (
      status === "scaled" &&
      prescribed &&
      currentWeight?.amount === prescribed.amount &&
      currentWeight.unit === prescribed.unit
    ) {
      changePrescriptionMetric(plannedPrescriptionId, {
        loadStatus: "scaled",
        actualWeight: undefined,
      });
      return;
    }
    changePrescriptionMetric(plannedPrescriptionId, { loadStatus: status });
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

  function changeSubstitution(
    plannedPrescriptionId: string,
    substitution: Substitution | undefined,
  ) {
    if (!executionBlock) return;
    const next = (executionBlock.substitutions ?? []).filter(
      (item) => item.plannedPrescriptionId !== plannedPrescriptionId,
    );
    if (substitution) next.push(substitution);
    changeExecutionBlock({ substitutions: next.length > 0 ? next : undefined });
  }

  function changeBlockFeeling(feeling: Feeling | undefined) {
    if (!executionBlock) return;
    changeExecutionBlock({ feeling });
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
                const substitution = substitutions.find(
                  (entry) => entry.plannedPrescriptionId === item.id,
                );
                const actualWeight = metricActualWeight(metric);
                const prescribed = prescribedWeight(item.details);
                const unit = weightUnit(item.details);
                const loadStatus: LoadStatus =
                  metric?.loadStatus ??
                  (actualWeight &&
                  prescribed &&
                  (actualWeight.amount !== prescribed.amount ||
                    actualWeight.unit !== prescribed.unit)
                    ? "scaled"
                    : "rx");
                const inputId = `load-${block.id}-${item.id}`;
                return (
                  <div className="prescription" key={item.id}>
                    {item.movement ? <strong>{item.movement.name}</strong> : null}
                    {item.complex ? (
                      <strong>
                        {item.complex.name} · v{item.complex.versionNumber}
                      </strong>
                    ) : null}
                    {entries.length > 0 ? (
                      <dl>
                        {entries.map((entry) => (
                          <div key={entry.key}>
                            <dt>{entry.label}</dt>
                            <dd>
                              {entry.load ? <LoadValueView display={entry.load} /> : entry.value}
                            </dd>
                          </div>
                        ))}
                        {showMetrics &&
                        (item.allowsActualWeight ?? hasStructuredLoad(item.details)) ? (
                          <div className="prescription-load-cell">
                            <dt>Peso usado</dt>
                            <dd className="prescription-load">
                              <MetricNumberInput
                                id={inputId}
                                ariaLabel={`Peso usado en ${name}`}
                                value={actualWeight?.amount}
                                placeholder={
                                  prescribed !== undefined ? String(prescribed.amount) : "0"
                                }
                                onCommit={(value) =>
                                  changePrescriptionMetric(item.id, {
                                    actualWeight:
                                      value === undefined
                                        ? undefined
                                        : { amount: value, unit },
                                  })
                                }
                              />
                              <span className="load-unit">{unit}</span>
                              <button
                                type="button"
                                className={`load-status-toggle load-status-toggle-${loadStatus}`}
                                aria-pressed={loadStatus === "rx"}
                                aria-label={`Tipo de carga en ${name}: ${
                                  loadStatus === "rx" ? "RX" : "Escalado"
                                }`}
                                onClick={() =>
                                  changePrescriptionLoadStatus(
                                    item.id,
                                    loadStatus === "rx" ? "scaled" : "rx",
                                    prescribed,
                                    actualWeight,
                                  )
                                }
                              >
                                {loadStatus === "rx" ? "RX" : "Escalado"}
                              </button>
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                    {item.notes ? <p className="prescription-note">{item.notes}</p> : null}
                    {showMetrics && supportsAttempts ? (
                      <SetAttemptsEditor
                        plannedPrescriptionId={item.id}
                        prescriptionName={name}
                        unit={unit}
                        prescribedWeight={prescribed}
                        defaultRepetitions={
                          numberDetail(item.details, "repetitions") ?? undefined
                        }
                        allAttempts={executionBlock?.attempts}
                        onChange={(attempts) => changeExecutionBlock({ attempts })}
                      />
                    ) : null}
                    {draft ? (
                      <div className="prescription-substitution">
                        {substitutingId === item.id ? (
                          <SubstitutionEditor
                            prescriptionId={item.id}
                            prescriptionName={name}
                            substitution={substitution}
                            onSave={(value) => changeSubstitution(item.id, value)}
                            onClose={() => setSubstitutingId(null)}
                          />
                        ) : (
                          <div className="prescription-substitution-summary">
                            <span>
                              {substitution ? "Sustitución registrada" : "¿No has podido hacerlo?"}
                            </span>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => setSubstitutingId(item.id)}
                            >
                              {substitution ? "Editar sustitución" : "Sustituir movimiento"}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
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
                {effectiveStatus === "completed" || effectiveStatus === "partial" ? (
                  <BlockRpeField
                    feeling={executionBlock.feeling}
                    onChange={changeBlockFeeling}
                  />
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

function SessionCard({
  session,
  initiallyOpen = false,
}: {
  session: PlannedSession;
  initiallyOpen?: boolean;
}) {
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draft, setDraft] = useState<ExecutionDraft | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initiallyOpen);
  const hydrationRequested = useRef(false);
  const latestDraft = useRef<ExecutionDraft | null>(null);

  useEffect(() => {
    if (!expanded || hydrationRequested.current) return;
    hydrationRequested.current = true;
    let active = true;
    findDraftForSession(session.id)
      .then((existing) => {
        if (!active || !existing || latestDraft.current) return;
        latestDraft.current = existing;
        setDraft(existing);
        setDraftState((current) => (current === "idle" ? "saved" : current));
      })
      .catch(() => {
        // Hydration is best effort; the user can still create the draft manually.
      });
    return () => {
      active = false;
    };
  }, [expanded, session.id]);

  async function startExecution() {
    setDraftState("saving");
    try {
      const executionDraft = await getOrCreateDraftForSession(session);
      latestDraft.current = executionDraft;
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
    latestDraft.current = pendingDraft;
    setDraft(pendingDraft);
    try {
      await saveExecutionDraft(pendingDraft);
      setDraftState("saved");
    } catch {
      setDraftState("error");
    }
  }

  async function synchronizeDraft() {
    const current = latestDraft.current;
    if (!current) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const persisted = await saveExecutionDraft(current);
      latestDraft.current = persisted;
      setDraft(persisted);
      const synchronized = await synchronizeExecutionDraft(persisted.id);
      latestDraft.current = synchronized;
      setDraft(synchronized);
      setDraftState("saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo sincronizar la sesión.";
      setSyncError(message);
      setDraftState("error");
      const failed: ExecutionDraft = {
        ...(latestDraft.current ?? current),
        syncStatus: "error",
        lastError: message,
        updatedAt: new Date().toISOString(),
      };
      latestDraft.current = failed;
      setDraft(failed);
    } finally {
      setSyncing(false);
    }
  }

  function changeFeeling(feeling: Feeling | undefined) {
    if (!draft) return;
    const snapshot = { ...draft.snapshot };
    if (feeling) snapshot.feeling = feeling;
    else delete snapshot.feeling;
    void updateDraft({ ...draft, snapshot });
  }

  return (
    <details
      className="session-card"
      open={expanded}
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setExpanded(isOpen);
        if (!isOpen) setOpenBlockId(null);
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
            <p>
              {draft
                ? draft.syncStatus === "synchronized"
                  ? "Registro sincronizado con el servidor."
                  : "Borrador guardado en este dispositivo. Sincronízalo cuando tengas conexión."
                : "Prepara un borrador local que podrás completar incluso sin conexión."}
            </p>
            {draft ? (
              <span className={`sync-badge sync-${draft.syncStatus}`}>
                {SYNC_STATUS_LABELS[draft.syncStatus]}
              </span>
            ) : null}
          </div>
          {draft ? (
            <button
              type="button"
              disabled={syncing || draft.snapshot.blocks.length === 0}
              onClick={() => void synchronizeDraft()}
            >
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </button>
          ) : (
            <button disabled={draftState === "saving"} onClick={startExecution}>
              {draftState === "saving" ? "Guardando…" : "Registrar sesión"}
            </button>
          )}
          {syncError ? <p role="alert">{syncError}</p> : null}
          {draftState === "error" && !syncError ? (
            <p role="alert">No se pudo guardar el borrador local.</p>
          ) : null}
        </div>

        {draft ? (
          <FeelingFields feeling={draft.snapshot.feeling} onChange={changeFeeling} />
        ) : null}

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

export function PlanningWeekScreen({
  initialWeekStart,
  focusSessionId,
}: {
  initialWeekStart?: string;
  focusSessionId?: string;
}) {
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
                <SessionCard
                  key={session.id}
                  session={session}
                  initiallyOpen={session.id === focusSessionId}
                />
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
