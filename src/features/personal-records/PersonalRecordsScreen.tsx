import { useEffect, useMemo, useState, type FormEvent } from "react";

import { fetchMovements, type Movement } from "../catalog/api";
import { createUuidV7 } from "../execution/uuid";
import { formatShortDate } from "../history/dates";
import { todayIsoDate } from "../planning/dates";
import {
  createManualPersonalRecord,
  decidePersonalRecord,
  fetchComplexes,
  fetchCurrentPersonalRecords,
  fetchPersonalRecordSuggestions,
  fetchPersonalRecords,
  type ComplexCatalogEntry,
  type PersonalRecord,
  type PersonalRecordStatus,
} from "./api";

const HISTORY_PAGE_SIZE = 10;

const STATUS_LABELS: Record<PersonalRecordStatus, string> = {
  suggested: "Sugerida",
  confirmed: "Confirmada",
  discarded: "Descartada",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} (${error.message})` : fallback;
}

function formatLoad(loadKg: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(loadKg);
}

function anchorName(record: PersonalRecord): string {
  if (record.movement) return record.movement.name;
  if (record.complex) return `${record.complex.name} · v${record.complex.versionNumber}`;
  return "Marca personal";
}

function stepsForRecord(
  record: PersonalRecord,
  complexes: ComplexCatalogEntry[],
): string | null {
  if (!record.complex) return null;
  const found = findComplexVersion(complexes, record.complex.id);
  if (!found || found.version.steps.length === 0) return null;
  return stepsLabel(found.version.steps);
}

function complexVersionLabel(entry: ComplexCatalogEntry, versionNumber: number): string {
  return `${entry.name} · v${versionNumber}`;
}

function findComplexVersion(
  complexes: ComplexCatalogEntry[],
  versionId: string,
): { entry: ComplexCatalogEntry; version: ComplexCatalogEntry["versions"][number] } | null {
  for (const entry of complexes) {
    const version = entry.versions.find((candidate) => candidate.id === versionId);
    if (version) return { entry, version };
  }
  return null;
}

function stepsLabel(steps: ComplexCatalogEntry["versions"][number]["steps"]): string {
  return steps
    .map((step) => `${step.repetitions} ${step.movement.name}`)
    .join(" + ");
}

function sourceLabel(record: PersonalRecord): string {
  return record.sourceType === "manual_historical" ? "Registro manual" : "Desde un intento";
}

function SuggestionCard({
  record,
  steps,
  busy,
  onDecide,
}: {
  record: PersonalRecord;
  steps: string | null;
  busy: boolean;
  onDecide: (record: PersonalRecord, status: "confirmed" | "discarded") => void;
}) {
  return (
    <li className="pr-card pr-suggestion-card">
      <div className="pr-card-main">
        <p className="pr-anchor">{anchorName(record)}</p>
        <p className="pr-value">
          {formatLoad(record.loadKg)} kg <span>× {record.repetitions}</span>
        </p>
        <p className="pr-meta">
          {formatShortDate(record.achievedOn)} ·{" "}
          {record.previousLoadKg != null
            ? `Supera ${formatLoad(record.previousLoadKg)} kg`
            : "Primera marca"}
        </p>
        {steps ? <p className="pr-steps">{steps}</p> : null}
        {record.note ? <p className="pr-note">{record.note}</p> : null}
      </div>
      <div className="pr-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => onDecide(record, "confirmed")}
        >
          {busy ? "Guardando…" : "Confirmar"}
        </button>
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => onDecide(record, "discarded")}
        >
          Descartar
        </button>
      </div>
    </li>
  );
}

function CurrentRecordCard({ record, steps }: { record: PersonalRecord; steps: string | null }) {
  return (
    <li className="pr-card pr-current-card">
      <div className="pr-card-main">
        <p className="pr-anchor">{anchorName(record)}</p>
        <p className="pr-value">
          {formatLoad(record.loadKg)} kg <span>× {record.repetitions}</span>
        </p>
        <p className="pr-meta">
          {formatShortDate(record.achievedOn)} · {sourceLabel(record)}
        </p>
        {steps ? <p className="pr-steps">{steps}</p> : null}
        {record.note ? <p className="pr-note">{record.note}</p> : null}
      </div>
      <span className="pr-status pr-status-confirmed">{STATUS_LABELS.confirmed}</span>
    </li>
  );
}

function HistoryRecordCard({ record, steps }: { record: PersonalRecord; steps: string | null }) {
  return (
    <li className="pr-card pr-history-card">
      <div className="pr-card-main">
        <p className="pr-anchor">{anchorName(record)}</p>
        <p className="pr-value">
          {formatLoad(record.loadKg)} kg <span>× {record.repetitions}</span>
        </p>
        <p className="pr-meta">
          {formatShortDate(record.achievedOn)} · {sourceLabel(record)}
        </p>
        {steps ? <p className="pr-steps">{steps}</p> : null}
        {record.note ? <p className="pr-note">{record.note}</p> : null}
      </div>
      <span className={`pr-status pr-status-${record.status}`}>
        {STATUS_LABELS[record.status]}
      </span>
    </li>
  );
}

function ManualRecordForm({
  movements,
  complexes,
  onSaved,
  onCancel,
}: {
  movements: Movement[];
  complexes: ComplexCatalogEntry[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [anchorType, setAnchorType] = useState<"movement" | "complex">("movement");
  const [movementId, setMovementId] = useState("");
  const [complexVersionId, setComplexVersionId] = useState("");
  const [repetitions, setRepetitions] = useState("1");
  const [loadKg, setLoadKg] = useState("");
  const [achievedOn, setAchievedOn] = useState(todayIsoDate());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complexOptions = useMemo(
    () =>
      complexes.flatMap((entry) =>
        entry.versions.map((version) => ({
          id: version.id,
          label: complexVersionLabel(entry, version.versionNumber),
        })),
      ),
    [complexes],
  );

  const selectedComplex = complexVersionId
    ? findComplexVersion(complexes, complexVersionId)
    : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsedRepetitions = Number.parseInt(repetitions, 10);
    const parsedLoad = Number.parseFloat(loadKg);
    if (!Number.isInteger(parsedRepetitions) || parsedRepetitions <= 0) {
      setError("Indica un número de repeticiones mayor que cero.");
      return;
    }
    if (!Number.isFinite(parsedLoad) || parsedLoad < 0) {
      setError("Indica una carga válida en kilogramos.");
      return;
    }
    if (anchorType === "movement" && !movementId) {
      setError("Selecciona un movimiento.");
      return;
    }
    if (anchorType === "complex" && !complexVersionId) {
      setError("Selecciona una versión del complejo.");
      return;
    }

    setSaving(true);
    try {
      await createManualPersonalRecord(createUuidV7(), {
        ...(anchorType === "movement"
          ? { movementId }
          : { complexVersionId }),
        repetitions: parsedRepetitions,
        loadKg: parsedLoad,
        achievedOn,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (submitError) {
      setError(errorMessage(submitError, "No se pudo guardar la marca."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pr-form" onSubmit={(event) => void submit(event)}>
      <div className="pr-form-heading">
        <p className="eyebrow">Registro manual</p>
        <h3>Nueva marca personal</h3>
        <p>Úsala para recuperar una marca histórica que no está enlazada a un intento.</p>
      </div>

      <fieldset className="pr-anchor-toggle">
        <legend>Tipo de marca</legend>
        <label>
          <input
            type="radio"
            name="anchorType"
            value="movement"
            checked={anchorType === "movement"}
            onChange={() => setAnchorType("movement")}
          />
          Movimiento
        </label>
        <label>
          <input
            type="radio"
            name="anchorType"
            value="complex"
            checked={anchorType === "complex"}
            onChange={() => setAnchorType("complex")}
          />
          Complejo
        </label>
      </fieldset>

      {anchorType === "movement" ? (
        <label className="pr-form-field">
          <span>Movimiento</span>
          <select value={movementId} onChange={(event) => setMovementId(event.target.value)}>
            <option value="">Selecciona un movimiento</option>
            {movements.map((movement) => (
              <option value={movement.id} key={movement.id}>
                {movement.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="pr-form-field">
          <span>Complejo y versión</span>
          <select
            value={complexVersionId}
            onChange={(event) => setComplexVersionId(event.target.value)}
          >
            <option value="">Selecciona una versión</option>
            {complexOptions.map((option) => (
              <option value={option.id} key={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedComplex ? (
        <p className="pr-form-hint">
          {stepsLabel(selectedComplex.version.steps) || "Esta versión no tiene pasos publicados."}
        </p>
      ) : null}
      {anchorType === "complex" && complexes.length === 0 ? (
        <p className="pr-form-hint">
          Todavía no hay complejos publicados. Se mostrarán aquí cuando existan.
        </p>
      ) : null}

      <div className="pr-form-grid">
        <label className="pr-form-field">
          <span>Repeticiones</span>
          <input
            type="number"
            min="1"
            step="1"
            value={repetitions}
            onChange={(event) => setRepetitions(event.target.value)}
          />
        </label>
        <label className="pr-form-field">
          <span>Carga (kg)</span>
          <input
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={loadKg}
            onChange={(event) => setLoadKg(event.target.value)}
          />
        </label>
        <label className="pr-form-field">
          <span>Fecha</span>
          <input
            type="date"
            value={achievedOn}
            onChange={(event) => setAchievedOn(event.target.value)}
          />
        </label>
      </div>

      <label className="pr-form-field pr-form-note">
        <span>Observación</span>
        <textarea
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Opcional"
        />
      </label>

      {error ? (
        <p className="pr-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="pr-form-actions">
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? "Guardando…" : "Guardar marca"}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function PersonalRecordsScreen() {
  const [current, setCurrent] = useState<PersonalRecord[] | null>(null);
  const [suggestions, setSuggestions] = useState<PersonalRecord[] | null>(null);
  const [history, setHistory] = useState<PersonalRecord[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [complexes, setComplexes] = useState<ComplexCatalogEntry[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchCurrentPersonalRecords(controller.signal),
      fetchPersonalRecordSuggestions(controller.signal),
      fetchPersonalRecords({ limit: HISTORY_PAGE_SIZE }, controller.signal),
    ])
      .then(([currentRecords, pendingSuggestions, page]) => {
        setCurrent(currentRecords);
        setSuggestions(pendingSuggestions);
        setHistory(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(errorMessage(error, "No se pudieron cargar las marcas."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    Promise.all([fetchMovements(controller.signal), fetchComplexes(controller.signal)])
      .then(([movementCatalog, complexCatalog]) => {
        setMovements(movementCatalog.movements);
        setComplexes(complexCatalog);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMovements([]);
        setComplexes([]);
      });

    return () => controller.abort();
  }, [reload]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setActionError(null);
    try {
      const page = await fetchPersonalRecords({
        cursor: nextCursor,
        limit: HISTORY_PAGE_SIZE,
      });
      setHistory((items) => [...(items ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setActionError(errorMessage(error, "No se pudo cargar más historial."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function decide(record: PersonalRecord, status: "confirmed" | "discarded") {
    setBusyId(record.id);
    setActionError(null);
    try {
      await decidePersonalRecord(record.id, status);
      setReload((value) => value + 1);
    } catch (error) {
      setActionError(
        errorMessage(
          error,
          status === "confirmed" ? "No se pudo confirmar la marca." : "No se pudo descartar la marca.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="records-title">
      <div className="week-toolbar">
        <div>
          <p className="eyebrow">Marcas personales</p>
          <h2 id="records-title">Marcas</h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowForm((visible) => !visible)}
        >
          {showForm ? "Cerrar formulario" : "Añadir marca"}
        </button>
      </div>

      {showForm ? (
        <ManualRecordForm
          movements={movements}
          complexes={complexes}
          onSaved={() => {
            setShowForm(false);
            setReload((value) => value + 1);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {actionError ? (
        <p className="history-inline-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {loading && current === null ? <p className="state-panel">Cargando marcas…</p> : null}

      {loadError && current === null ? (
        <div className="state-panel state-error" role="alert">
          <h3>No se pudieron cargar las marcas</h3>
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {suggestions !== null && suggestions.length > 0 ? (
        <section className="pr-section" aria-labelledby="pr-suggestions-title">
          <div className="history-list-heading">
            <div>
              <p className="eyebrow">Pendientes</p>
              <h3 id="pr-suggestions-title">Sugerencias</h3>
            </div>
            <span className="pr-count">{suggestions.length}</span>
          </div>
          <ul className="pr-list">
            {suggestions.map((record) => (
              <SuggestionCard
                key={record.id}
                record={record}
                steps={stepsForRecord(record, complexes)}
                busy={busyId === record.id}
                onDecide={(item, status) => void decide(item, status)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="pr-section" aria-labelledby="pr-current-title">
        <div className="history-list-heading">
          <div>
            <p className="eyebrow">Vigentes</p>
            <h3 id="pr-current-title">Mejores marcas</h3>
          </div>
        </div>

        {current !== null && current.length === 0 ? (
          <div className="state-panel">
            <h3>Todavía no hay marcas confirmadas</h3>
            <p>
              Sincroniza una sesión con series completadas o añade una marca histórica manualmente.
            </p>
          </div>
        ) : null}

        {current !== null && current.length > 0 ? (
          <ul className="pr-list pr-current-list">
            {current.map((record) => (
              <CurrentRecordCard
                key={record.id}
                record={record}
                steps={stepsForRecord(record, complexes)}
              />
            ))}
          </ul>
        ) : null}
      </section>

      <section className="history-list-section" aria-labelledby="pr-history-title">
        <div className="history-list-heading">
          <div>
            <p className="eyebrow">Historial</p>
            <h3 id="pr-history-title">Marcas registradas</h3>
          </div>
        </div>

        {history !== null && history.length === 0 ? (
          <p className="history-empty">
            Las marcas confirmadas y descartadas aparecerán aquí.
          </p>
        ) : null}

        {history !== null && history.length > 0 ? (
          <ul className="pr-list">
            {history.map((record) => (
              <HistoryRecordCard
                key={record.id}
                record={record}
                steps={stepsForRecord(record, complexes)}
              />
            ))}
          </ul>
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
          Una marca confirmada conserva la fecha, la carga, las repeticiones y el intento que la
          originó. Las sugerencias solo se generan a partir de intentos completados.
        </p>
      </section>
    </section>
  );
}
