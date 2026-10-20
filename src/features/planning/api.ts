import { ApiError, apiGet } from "../../shared/api/client";

export type MovementReference = { id: string; code: string; name: string };
export type ComplexReference = { id: string; code: string; name: string; versionNumber: number };

export type PlanningWeek = {
  id: string;
  trainingPlanId: string;
  planVersionId: string;
  planTitle: string;
  weekStart: string;
  title: string | null;
  priorities: string | null;
  sessions: Array<{
    id: string;
    externalId: string | null;
    plannedDate: string;
    title: string;
    objective: string | null;
    durationSeconds: number | null;
    targetRpe: number | null;
    blocks: Array<{
      id: string;
      position: number;
      blockType: { id: string; code: string; description: string };
      title: string;
      instructions: string | null;
      durationSeconds: number | null;
      targetRpe: number | null;
      prescriptions: Array<{
        id: string;
        position: number;
        movement: MovementReference | null;
        complex: ComplexReference | null;
        details: Record<string, unknown>;
        notes: string | null;
      }>;
    }>;
  }>;
};

export type PlannedSession = PlanningWeek["sessions"][number];

export async function fetchPlanningWeek(weekStart: string, signal?: AbortSignal): Promise<PlanningWeek | null> {
  try {
    return await apiGet<PlanningWeek>(`/planning/weeks/${encodeURIComponent(weekStart)}`, signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
