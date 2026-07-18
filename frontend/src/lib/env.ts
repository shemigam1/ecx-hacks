/** Shared API key (interim guard, gap #6). Ships in the bundle by design — real per-user auth is the JWT. */
export const API_KEY: string = import.meta.env.VITE_API_KEY ?? 'dev-steward-key';