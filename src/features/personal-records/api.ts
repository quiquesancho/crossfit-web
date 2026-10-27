import { apiGet, apiPatch, apiPut } from "../../shared/api/client";

export type PersonalRecordStatus = "suggested" | "confirmed" | "discarded";
export type PersonalRecordSourceType = "attempt" | "manual_historical";

export type MovementReference = {
  id: string;
  code: string;
  name: string;
};

export type ComplexReference = {
  id: string;
  code: string;
  name: string;
  versionNumber: number;
};

export type PersonalRecord = {
  id: string;
  status: PersonalRecordStatus;
  sourceType: PersonalRecordSourceType;
  movement: MovementReference | null;
  complex: ComplexReference | null;
  repetitions: number;
  loadKg: number;
  achievedOn: string;
  confirmedAt: string | null;
  note: string | null;
  originAttemptId: string | null;
  previousLoadKg?: number | null;
};

export type PersonalRecordPage = {
  items: PersonalRecord[];
  nextCursor: string | null;
};

export type ComplexStep = {
  position: number;
  repetitions: number;
  movement: MovementReference;
};

export type ComplexVersion = {
  id: string;
  versionNumber: number;
  publishedAt: string | null;
  steps: ComplexStep[];
};

export type ComplexCatalogEntry = {
  id: string;
  code: string;
  name: string;
  versions: ComplexVersion[];
};

export type PersonalRecordHistoryQuery = {
  movementId?: string;
  complexVersionId?: string;
  status?: PersonalRecordStatus;
  cursor?: string;
  limit?: number;
};

export type ManualPersonalRecordInput = {
  movementId?: string;
  complexVersionId?: string;
  repetitions: number;
  loadKg: number;
  achievedOn: string;
  note?: string;
};

export function fetchPersonalRecords(
  query: PersonalRecordHistoryQuery = {},
  signal?: AbortSignal,
): Promise<PersonalRecordPage> {
  const params = new URLSearchParams();
  if (query.movementId) params.set("movementId", query.movementId);
  if (query.complexVersionId) params.set("complexVersionId", query.complexVersionId);
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return apiGet<PersonalRecordPage>(`/personal-records${suffix}`, signal);
}

export async function fetchCurrentPersonalRecords(
  signal?: AbortSignal,
): Promise<PersonalRecord[]> {
  const response = await apiGet<{ records: PersonalRecord[] }>(
    "/personal-records/current",
    signal,
  );
  return response.records;
}

export async function fetchPersonalRecordSuggestions(
  signal?: AbortSignal,
): Promise<PersonalRecord[]> {
  const response = await apiGet<{ items: PersonalRecord[] }>(
    "/personal-records/suggestions",
    signal,
  );
  return response.items;
}

export async function fetchComplexes(signal?: AbortSignal): Promise<ComplexCatalogEntry[]> {
  const response = await apiGet<{ complexes: ComplexCatalogEntry[] }>(
    "/catalog/complexes",
    signal,
  );
  return response.complexes;
}

export function createManualPersonalRecord(
  id: string,
  input: ManualPersonalRecordInput,
): Promise<PersonalRecord> {
  return apiPut<PersonalRecord>(`/personal-records/${id}`, input);
}

export function decidePersonalRecord(
  id: string,
  status: "confirmed" | "discarded",
): Promise<PersonalRecord> {
  return apiPatch<PersonalRecord>(`/personal-records/${id}`, { status });
}
