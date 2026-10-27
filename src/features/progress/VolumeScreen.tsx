import { useEffect, useMemo, useState } from "react";

import { formatShortDate } from "../history/dates";
import { todayIsoDate } from "../planning/dates";
import {
  fetchVolume,
  type VolumeAggregate,
  type VolumeGroupBy,
  type VolumeItem,
  type VolumeResponse,
} from "./api";
import {
  rangeForPreset,
  VOLUME_RANGE_LABELS,
  type VolumeRangePreset,
} from "./dates";

type RangeMode = VolumeRangePreset | "custom";

const NUMBER_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Sin tiempo";
  if (seconds < 60) return `${formatNumber(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return remaining === 0
    ? `${minutes} min`
    : `${minutes} min ${String(remaining).padStart(2, "0")} s`;
}

function technicalShare(aggregate: VolumeAggregate): number {
  if (aggregate.repetitions <= 0) return 0;
  return Math.min(100, Math.round((aggregate.technicalRepetitions / aggregate.repetitions) * 100));
}

function itemName(item: VolumeItem, groupBy: VolumeGroupBy): string {
  if (groupBy === "family") return item.family.name;
  return item.movement?.name ?? "Movimiento";
}

function itemKey(item: VolumeItem, groupBy: VolumeGroupBy): string {
  return groupBy === "family" ? `family:${item.family.id}` : `movement:${item.movement?.id}`;
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="volume-stat">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function VolumeCard({ item, groupBy }: { item: VolumeItem; groupBy: VolumeGroupBy }) {
  const share = technicalShare(item);
  const name = itemName(item, groupBy);
  const subtitle = groupBy === "movement" ? item.family.name : "Familia de movimientos";

  return (
    <li className="volume-card">
      <div className="volume-card-heading">
        <div>
          <p className="volume-name">{name}</p>
          <p className="volume-family">{subtitle}</p>
        </div>
        <span className="volume-share">{share}% técnico</span>
      </div>
      <div className="volume-bar" aria-hidden="true">
        <span style={{ width: `${share}%` }} />
      </div>
      <dl className="volume-metrics">
        <div>
          <dt>Reps</dt>
          <dd>{formatNumber(item.repetitions)}</dd>
        </div>
        <div>
          <dt>Técnicas</dt>
          <dd>{formatNumber(item.technicalRepetitions)}</dd>
        </div>
        <div>
          <dt>Volumen</dt>
          <dd>{formatNumber(item.volumeKg)} kg</dd>
        </div>
        <div>
          <dt>Técnico</dt>
          <dd>{formatNumber(item.technicalVolumeKg)} kg</dd>
        </div>
        <div>
          <dt>Tiempo</dt>
          <dd>{formatDuration(item.durationSeconds)}</dd>
        </div>
        <div>
          <dt>Sesiones</dt>
          <dd>{formatNumber(item.sessions)}</dd>
        </div>
      </dl>
    </li>
  );
}

export function VolumeScreen() {
  const today = todayIsoDate();
  const initialRange = rangeForPreset("4w", today);
  const [rangeMode, setRangeMode] = useState<RangeMode>("4w");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [groupBy, setGroupBy] = useState<VolumeGroupBy>("movement");
  const [data, setData] = useState<VolumeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const invalidRange = from > to;
  const periodLabel = useMemo(
    () => `${formatShortDate(from)} — ${formatShortDate(to)}`,
    [from, to],
  );

  useEffect(() => {
    if (invalidRange) {
      setLoading(false);
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchVolume({ from, to, groupBy }, controller.signal)
      .then((response) => {
        setData(response);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("No se pudo cargar el volumen. Inténtalo de nuevo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [from, to, groupBy, invalidRange, reload]);

  function choosePreset(preset: VolumeRangePreset) {
    const range = rangeForPreset(preset, today);
    setRangeMode(preset);
    setFrom(range.from);
    setTo(range.to);
  }

  const totals = data?.totals;
  const items = data?.items ?? [];

  return (
    <section aria-labelledby="volume-title">
      <div className="week-toolbar">
        <div>
          <p className="eyebrow">Progreso</p>
          <h2 id="volume-title">Volumen</h2>
        </div>
        <span className="volume-period">{periodLabel}</span>
      </div>

      <div className="volume-controls">
        <div className="volume-presets" role="group" aria-label="Periodo de volumen">
          {(Object.keys(VOLUME_RANGE_LABELS) as VolumeRangePreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={rangeMode === preset}
              onClick={() => choosePreset(preset)}
            >
              {VOLUME_RANGE_LABELS[preset]}
            </button>
          ))}
        </div>
        <div className="volume-group-toggle" role="group" aria-label="Agrupar volumen por">
          <button
            type="button"
            aria-pressed={groupBy === "movement"}
            onClick={() => setGroupBy("movement")}
          >
            Por movimiento
          </button>
          <button
            type="button"
            aria-pressed={groupBy === "family"}
            onClick={() => setGroupBy("family")}
          >
            Por familia
          </button>
        </div>
      </div>

      <div className="volume-custom-range">
        <label>
          <span>Desde</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => {
              setRangeMode("custom");
              setFrom(event.target.value);
            }}
          />
        </label>
        <label>
          <span>Hasta</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => {
              setRangeMode("custom");
              setTo(event.target.value);
            }}
          />
        </label>
      </div>

      {error ? (
        <div className="state-panel state-error" role="alert">
          <h3>No se pudo cargar el volumen</h3>
          <p>{error}</p>
          {!invalidRange ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setReload((value) => value + 1)}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      {loading && !data ? <p className="state-panel">Cargando volumen…</p> : null}

      {!error && totals ? (
        <>
          <div className="volume-summary" aria-label="Totales del periodo">
            <StatCard
              label="Repeticiones"
              value={formatNumber(totals.repetitions)}
              detail={`${formatNumber(totals.technicalRepetitions)} en práctica técnica`}
            />
            <StatCard
              label="Volumen"
              value={`${formatNumber(totals.volumeKg)} kg`}
              detail={`${formatNumber(totals.technicalVolumeKg)} kg técnicos`}
            />
            <StatCard
              label="Tiempo técnico"
              value={formatDuration(totals.technicalDurationSeconds)}
              detail={`${formatDuration(totals.durationSeconds)} registrados`}
            />
            <StatCard
              label="Sesiones"
              value={formatNumber(totals.sessions)}
              detail={
                totals.lastPracticedOn
                  ? `Última: ${formatShortDate(totals.lastPracticedOn)}`
                  : "Sin registros"
              }
            />
          </div>

          <section className="volume-section" aria-labelledby="volume-breakdown-title">
            <div className="history-list-heading">
              <div>
                <p className="eyebrow">Desglose</p>
                <h3 id="volume-breakdown-title">
                  {groupBy === "movement" ? "Por movimiento" : "Por familia"}
                </h3>
              </div>
              <span className="pr-count">{items.length}</span>
            </div>

            {items.length === 0 ? (
              <div className="state-panel">
                <h3>Sin volumen en este periodo</h3>
                <p>Registra series completadas en sesiones finalizadas para verlas aquí.</p>
              </div>
            ) : (
              <ul className="volume-list">
                {items.map((item) => (
                  <VolumeCard key={itemKey(item, groupBy)} item={item} groupBy={groupBy} />
                ))}
              </ul>
            )}
          </section>

          <p className="volume-note">
            Solo se incluyen sesiones finalizadas y series completadas. El volumen de complejos no se
            atribuye a un movimiento.
          </p>
        </>
      ) : null}

      {loading && data ? <p className="volume-updating">Actualizando…</p> : null}
    </section>
  );
}
