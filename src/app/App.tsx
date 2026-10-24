import { useState } from "react";

import { ExecutionRecordsScreen } from "../features/execution/ExecutionRecordsScreen";
import type { ExecutionDraft } from "../features/execution/types";
import { weekStartOf } from "../features/planning/dates";
import { PlanningWeekScreen } from "../features/planning/PlanningWeekScreen";

type View = "planning" | "records";

export function App() {
  const [view, setView] = useState<View>("planning");
  const [planningWeekStart, setPlanningWeekStart] = useState<string | undefined>();
  const [focusedSessionId, setFocusedSessionId] = useState<string | undefined>();

  function openPlannedDraft(draft: ExecutionDraft) {
    setPlanningWeekStart(weekStartOf(draft.executionDate));
    setFocusedSessionId(draft.plannedSessionId);
    setView("planning");
  }

  const planningKey = `${planningWeekStart ?? "current"}-${focusedSessionId ?? "none"}`;

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Entrenamiento personal</p>
          <h1>CrossFit</h1>
        </div>
        <span className="status-badge">
          {view === "planning" ? "Plan semanal" : "Mis registros"}
        </span>
      </header>
      <main className="app-shell">
        <nav className="app-tabs" aria-label="Secciones">
          <button
            type="button"
            aria-pressed={view === "planning"}
            onClick={() => setView("planning")}
          >
            Plan semanal
          </button>
          <button
            type="button"
            aria-pressed={view === "records"}
            onClick={() => setView("records")}
          >
            Mis registros
          </button>
        </nav>

        <section hidden={view !== "planning"}>
          <PlanningWeekScreen
            key={planningKey}
            initialWeekStart={planningWeekStart}
            focusSessionId={focusedSessionId}
          />
        </section>

        {view === "records" ? (
          <ExecutionRecordsScreen onOpenPlannedDraft={openPlannedDraft} />
        ) : null}
      </main>
    </>
  );
}
