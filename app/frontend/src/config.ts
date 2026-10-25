function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/** Base pública da API do backend refatorado. */
export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL?.trim() || '/api/v1',
);
