import { apiGet } from "../../shared/api/client";

export type CatalogEntry = {
  id: string;
  code: string;
  description: string;
  displayOrder?: number;
};

export type Movement = {
  code: string;
  name: string;
  familyCode: string;
};

export function fetchCatalogEntries(catalogKey: string, signal?: AbortSignal) {
  return apiGet<{ entries: CatalogEntry[] }>(`/catalogs/${catalogKey}`, signal);
}

export function fetchMovements(signal?: AbortSignal) {
  return apiGet<{ movements: Movement[] }>("/catalog/movements", signal);
}
