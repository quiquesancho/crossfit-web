import { apiGet } from "../../shared/api/client";

export type VolumeGroupBy = "movement" | "family";

export type MovementReference = {
  id: string;
  code: string;
  name: string;
};

export type MovementFamilyReference = {
  id: string;
  code: string;
  name: string;
};

export type VolumeAggregate = {
  repetitions: number;
  technicalRepetitions: number;
  durationSeconds: number;
  technicalDurationSeconds: number;
  volumeKg: number;
  technicalVolumeKg: number;
  sessions: number;
  lastPracticedOn: string | null;
};

export type VolumeItem = VolumeAggregate & {
  movement: MovementReference | null;
  family: MovementFamilyReference;
};

export type VolumeResponse = {
  from: string;
  to: string;
  groupBy: VolumeGroupBy;
  totals: VolumeAggregate;
  items: VolumeItem[];
};

export function fetchVolume(
  options: { from: string; to: string; groupBy: VolumeGroupBy },
  signal?: AbortSignal,
): Promise<VolumeResponse> {
  const query = new URLSearchParams({
    from: options.from,
    to: options.to,
    groupBy: options.groupBy,
  });
  return apiGet<VolumeResponse>(`/progress/volume?${query.toString()}`, signal);
}
