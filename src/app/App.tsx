import { PlanningWeekScreen } from "../features/planning/PlanningWeekScreen";

export function App() {
  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Entrenamiento personal</p>
          <h1>CrossFit</h1>
        </div>
        <span className="status-badge">Plan semanal</span>
      </header>
      <main className="app-shell">
        <PlanningWeekScreen />
      </main>
    </>
  );
}
