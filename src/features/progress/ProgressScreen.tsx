import { useState } from "react";

import { PersonalRecordsScreen } from "../personal-records/PersonalRecordsScreen";
import { VolumeScreen } from "./VolumeScreen";

type ProgressView = "marks" | "volume";

const PROGRESS_VIEW_LABELS: Record<ProgressView, string> = {
  marks: "Marcas",
  volume: "Volumen",
};

export function ProgressScreen() {
  const [view, setView] = useState<ProgressView>("marks");

  return (
    <section aria-label="Progreso">
      <nav className="app-subtabs" aria-label="Vistas de progreso">
        {(Object.keys(PROGRESS_VIEW_LABELS) as ProgressView[]).map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={view === entry}
            onClick={() => setView(entry)}
          >
            {PROGRESS_VIEW_LABELS[entry]}
          </button>
        ))}
      </nav>

      {view === "marks" ? <PersonalRecordsScreen /> : <VolumeScreen />}
    </section>
  );
}
