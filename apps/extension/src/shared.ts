// The production app. The popup's "Developer" option can point the extension at another server.
export const DEFAULT_API = (globalThis as { __SIL_API__?: string }).__SIL_API__ ?? 'https://shipitloud.netlify.app';

export interface ApiRequest { path: string; method?: 'GET' | 'POST'; body?: unknown }
export interface ApiResponse<T = Record<string, unknown>> { ok: boolean; status: number; data: T & { error?: string } }

/** Ask the background worker to call the ShipItLoud API. */
export function api<T = Record<string, unknown>>(req: ApiRequest): Promise<ApiResponse<T>> {
  return chrome.runtime.sendMessage({ type: 'api', req });
}

export interface Me { workspace: { id: string; name: string; url: string | null; plan: string }; listening: boolean; threshold: number; keywords: string[]; links: { label: string; where: string; href: string }[] }
export interface Scored { id: string; mention_id?: string; score: number | null; rough?: boolean; intent?: string | null; reason?: string | null; status?: string; drafted?: boolean }
export interface Verdict { verdict: 'ok' | 'warn' | 'block'; reasons: { level: 'ok' | 'warn' | 'block'; text: string }[] }
