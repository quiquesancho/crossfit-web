export type VolumeRangePreset = "4w" | "12w" | "year";

export const VOLUME_RANGE_LABELS: Record<VolumeRangePreset, string> = {
  "4w": "4 semanas",
  "12w": "12 semanas",
  year: "Año",
};

const PRESET_DAYS: Record<VolumeRangePreset, number> = {
  "4w": 28,
  "12w": 84,
  year: 365,
};

export function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function rangeForPreset(preset: VolumeRangePreset, today: string) {
  return {
    from: shiftIsoDate(today, -(PRESET_DAYS[preset] - 1)),
    to: today,
  };
}
