import { useEffect, useId, useRef, useState } from "react";

import { fetchCatalogEntries, type CatalogEntry } from "../catalog/api";
import type { Feeling } from "./types";
import { createUuidV7 } from "./uuid";

type CatalogState =
  | { status: "idle" | "loading" }
  | { status: "ready"; recovery: CatalogEntry[]; techniqueQuality: CatalogEntry[]; limitation: CatalogEntry[] }
  | { status: "error" };

function hasContent(feeling: Feeling): boolean {
  return (
    feeling.rpe !== undefined ||
    feeling.pain !== undefined ||
    feeling.recoveryId !== undefined ||
    feeling.techniqueQualityId !== undefined ||
    feeling.limitationId !== undefined ||
    (feeling.note !== undefined && feeling.note.trim().length > 0)
  );
}

function cleanFeeling(feeling: Feeling): Feeling | undefined {
  const next: Feeling = { ...feeling };
  if (next.note !== undefined && next.note.trim().length === 0) delete next.note;
  return hasContent(next) ? next : undefined;
}

function mergeFeeling(
  current: Feeling | undefined,
  changes: Partial<Feeling>,
): Feeling {
  const next: Feeling = { ...(current ?? { id: createUuidV7() }), ...changes };
  if (next.rpe === undefined) delete next.rpe;
  if (next.pain === undefined) delete next.pain;
  if (next.recoveryId === undefined) delete next.recoveryId;
  if (next.techniqueQualityId === undefined) delete next.techniqueQualityId;
  if (next.limitationId === undefined) delete next.limitationId;
  if (next.note === undefined) delete next.note;
  return next;
}

function FeelingNumberInput({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id?: string;
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? "");

  useEffect(() => {
    setDraft(value?.toString() ?? "");
  }, [value]);

  function commit() {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft("");
      onCommit(undefined);
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    setDraft(String(clamped));
    onCommit(clamped);
  }

  return (
    <label className="feeling-field feeling-field-number">
      <span>{label}</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function FeelingSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: CatalogEntry[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="feeling-field">
      <span>{label}</span>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">Sin especificar</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.description}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FeelingFields({
  feeling,
  onChange,
}: {
  feeling: Feeling | undefined;
  onChange: (feeling: Feeling | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [catalogs, setCatalogs] = useState<CatalogState>({ status: "idle" });
  const loaded = useRef(false);
  const fieldId = useId();

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    setCatalogs({ status: "loading" });
    Promise.all([
      fetchCatalogEntries("recovery"),
      fetchCatalogEntries("technique-quality"),
      fetchCatalogEntries("limitation"),
    ])
      .then(([recovery, techniqueQuality, limitation]) => {
        setCatalogs({
          status: "ready",
          recovery: recovery.entries,
          techniqueQuality: techniqueQuality.entries,
          limitation: limitation.entries,
        });
      })
      .catch(() => setCatalogs({ status: "error" }));
  }, [open]);

  function update(changes: Partial<Feeling>) {
    onChange(cleanFeeling(mergeFeeling(feeling, changes)));
  }

  const options = catalogs.status === "ready" ? catalogs : null;

  return (
    <details
      className="feeling-panel"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Sensaciones y RPE</summary>
      <div className="feeling-fields">
        <FeelingNumberInput
          id={`${fieldId}-rpe`}
          label="RPE de la sesión"
          value={feeling?.rpe}
          min={1}
          max={10}
          onCommit={(rpe) => update({ rpe })}
        />
        <FeelingNumberInput
          id={`${fieldId}-pain`}
          label="Dolor"
          value={feeling?.pain}
          min={0}
          max={10}
          onCommit={(pain) => update({ pain })}
        />
        <FeelingSelect
          id={`${fieldId}-recovery`}
          label="Recuperación"
          value={feeling?.recoveryId}
          options={options?.recovery ?? []}
          onChange={(recoveryId) => update({ recoveryId })}
        />
        <FeelingSelect
          id={`${fieldId}-technique`}
          label="Calidad técnica"
          value={feeling?.techniqueQualityId}
          options={options?.techniqueQuality ?? []}
          onChange={(techniqueQualityId) => update({ techniqueQualityId })}
        />
        <FeelingSelect
          id={`${fieldId}-limitation`}
          label="Limitante"
          value={feeling?.limitationId}
          options={options?.limitation ?? []}
          onChange={(limitationId) => update({ limitationId })}
        />
        <label className="feeling-field feeling-field-note">
          <span>Nota de la sesión</span>
          <textarea
            rows={3}
            value={feeling?.note ?? ""}
            placeholder="Cómo te has sentido, contexto o cualquier detalle que no cubran las escalas…"
            onChange={(event) => update({ note: event.target.value || undefined })}
          />
        </label>
        {catalogs.status === "loading" ? (
          <p className="feeling-hint">Cargando opciones…</p>
        ) : null}
        {catalogs.status === "error" ? (
          <p className="feeling-hint" role="status">
            No se pudieron cargar las escalas cualitativas. El RPE, el dolor y la nota se guardan
            igualmente.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function BlockRpeField({
  feeling,
  onChange,
}: {
  feeling: Feeling | undefined;
  onChange: (feeling: Feeling | undefined) => void;
}) {
  return (
    <div className="block-feeling">
      <FeelingNumberInput
        label="RPE del bloque"
        value={feeling?.rpe}
        min={1}
        max={10}
        onCommit={(rpe) => {
          const next = mergeFeeling(feeling, { rpe });
          onChange(cleanFeeling(next));
        }}
      />
    </div>
  );
}
