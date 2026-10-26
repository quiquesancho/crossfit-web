import { useEffect, useState } from "react";

import { MetricNumberInput } from "./MetricNumberInput";
import {
  attemptSummaryText,
  attemptValueText,
  attemptMatchesAnchor,
  attemptsForAnchor,
  createAttempt,
  duplicateAttempt,
  removeAttempt,
  updateAttempt,
  type AttemptAnchor,
} from "./attempts";
import type { SetAttempt, SetAttemptStatus, WeightValue } from "./types";

const ATTEMPT_STATUS_OPTIONS: Array<{ value: SetAttemptStatus; label: string }> = [
  { value: "completed", label: "Completada" },
  { value: "partial", label: "Parcial" },
  { value: "failed", label: "Fallida" },
];

const ATTEMPT_STATUS_LABELS: Record<SetAttemptStatus, string> = {
  completed: "Completada",
  partial: "Parcial",
  failed: "Fallida",
  skipped: "Omitida",
};

type SetAttemptsEditorAnchor =
  | { plannedPrescriptionId: string; movementId?: undefined }
  | { movementId: string; plannedPrescriptionId?: undefined };

type SetAttemptsEditorProps = {
  prescriptionName: string;
  actualMovementName?: string;
  unit: string;
  prescribedWeight?: WeightValue;
  defaultRepetitions?: number;
  allAttempts: SetAttempt[] | undefined;
  syncStatus?: "pending" | "synchronized" | "error";
  onChange: (attempts: SetAttempt[] | undefined) => void;
} & SetAttemptsEditorAnchor;

export function SetAttemptsEditor({
  plannedPrescriptionId,
  movementId,
  prescriptionName,
  actualMovementName,
  unit,
  prescribedWeight,
  defaultRepetitions,
  allAttempts,
  syncStatus,
  onChange,
}: SetAttemptsEditorProps) {
  const anchor: AttemptAnchor =
    plannedPrescriptionId !== undefined
      ? { plannedPrescriptionId }
      : { movementId: movementId ?? "" };
  const attempts = attemptsForAnchor(allAttempts, anchor);
  const summary = attemptSummaryText(attempts);
  const [editing, setEditing] = useState(false);
  const synchronized = syncStatus === "synchronized";
  const readOnly = synchronized && attempts.length > 0 && !editing;

  useEffect(() => {
    if (synchronized) setEditing(false);
  }, [synchronized]);

  function apply(next: SetAttempt[]) {
    const others = (allAttempts ?? []).filter(
      (attempt) => !attemptMatchesAnchor(attempt, anchor),
    );
    const merged = [...others, ...next];
    onChange(merged.length > 0 ? merged : undefined);
  }

  function addAttempt() {
    apply([
      ...attempts,
      createAttempt(anchor, allAttempts, {
        weight: prescribedWeight,
        repetitions: defaultRepetitions,
      }),
    ]);
  }

  function cloneLastAttempt() {
    const last = attempts[attempts.length - 1];
    if (!last) return;
    apply([...attempts, duplicateAttempt(last, allAttempts)]);
  }

  return (
    <div className="set-attempts">
      <div className="set-attempts-header">
        <span className="set-attempts-title">
          {actualMovementName ? `Series de ${actualMovementName}` : "Series registradas"}
        </span>
        {attempts.length > 0 ? (
          <span className="set-attempts-actions">
            {readOnly ? (
              <button
                type="button"
                className="link-button"
                aria-label={`Editar series de ${prescriptionName}`}
                onClick={() => setEditing(true)}
              >
                Editar
              </button>
            ) : (
              <>
                {synchronized ? (
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Cerrar edición de ${prescriptionName}`}
                    onClick={() => setEditing(false)}
                  >
                    Hecho
                  </button>
                ) : null}
                <button type="button" className="link-button" onClick={cloneLastAttempt}>
                  Duplicar última
                </button>
                <button type="button" className="link-button" onClick={addAttempt}>
                  Añadir serie
                </button>
              </>
            )}
          </span>
        ) : null}
      </div>

      {attempts.length === 0 ? (
        <div className="set-attempts-empty">
          <span>Sin series registradas.</span>
          <button type="button" className="link-button" onClick={addAttempt}>
            Añadir primera serie
          </button>
        </div>
      ) : readOnly ? (
        <ol className="set-attempt-list">
          {attempts.map((attempt, index) => (
            <li className="set-attempt set-attempt-readonly" key={attempt.id}>
              <span className="set-attempt-readonly-heading">
                <span className="set-attempt-readonly-title">Serie {index + 1}</span>
                <span className={`set-attempt-badge set-attempt-badge-${attempt.status}`}>
                  {ATTEMPT_STATUS_LABELS[attempt.status]}
                </span>
              </span>
              <span className="set-attempt-readonly-value">{attemptValueText(attempt)}</span>
              {attempt.note ? (
                <span className="set-attempt-readonly-note">{attempt.note}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <ol className="set-attempt-list">
          {attempts.map((attempt, index) => (
            <li className="set-attempt" key={attempt.id}>
              <div className="set-attempt-heading">
                <strong>Serie {index + 1}</strong>
                <div
                  className="set-attempt-status"
                  role="group"
                  aria-label={`Estado de la serie ${index + 1}`}
                >
                  {ATTEMPT_STATUS_OPTIONS.map((option) => {
                    const active = attempt.status === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`set-attempt-status-option set-attempt-status-${option.value}${
                          active ? " set-attempt-status-option-active" : ""
                        }`}
                        aria-pressed={active}
                        onClick={() =>
                          apply(
                            updateAttempt(allAttempts, attempt.id, { status: option.value }),
                          )
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="link-button set-attempt-remove"
                  aria-label={`Eliminar serie ${index + 1} de ${prescriptionName}`}
                  onClick={() => apply(removeAttempt(allAttempts, attempt.id))}
                >
                  Eliminar
                </button>
              </div>
              <div className="set-attempt-fields">
                <label>
                  <span>Repeticiones</span>
                  <MetricNumberInput
                    id={`attempt-reps-${attempt.id}`}
                    ariaLabel={`Repeticiones de la serie ${index + 1} de ${prescriptionName}`}
                    value={attempt.repetitions}
                    placeholder={defaultRepetitions !== undefined ? String(defaultRepetitions) : "0"}
                    integer
                    onCommit={(value) =>
                      apply(updateAttempt(allAttempts, attempt.id, { repetitions: value }))
                    }
                  />
                </label>
                <label>
                  <span>Peso usado</span>
                  <span className="set-attempt-weight">
                    <MetricNumberInput
                      id={`attempt-weight-${attempt.id}`}
                      ariaLabel={`Peso usado en la serie ${index + 1} de ${prescriptionName}`}
                      value={attempt.weight?.amount}
                      placeholder={
                        prescribedWeight !== undefined ? String(prescribedWeight.amount) : "0"
                      }
                      onCommit={(value) =>
                        apply(
                          updateAttempt(allAttempts, attempt.id, {
                            weight: value === undefined ? undefined : { amount: value, unit },
                          }),
                        )
                      }
                    />
                    <span className="load-unit">{unit}</span>
                  </span>
                </label>
                <label className="set-attempt-note">
                  <span>Nota</span>
                  <input
                    type="text"
                    aria-label={`Nota de la serie ${index + 1} de ${prescriptionName}`}
                    value={attempt.note ?? ""}
                    placeholder="Técnica, sensaciones…"
                    onChange={(event) =>
                      apply(
                        updateAttempt(allAttempts, attempt.id, {
                          note: event.target.value || undefined,
                        }),
                      )
                    }
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}

      {summary ? <p className="set-attempts-summary">{summary}</p> : null}
    </div>
  );
}
