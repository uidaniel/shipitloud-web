// Holds the connection token and makes every ShipItLoud API call, so pages never see the token.
import { DEFAULT_API, type ApiRequest, type ApiResponse } from './shared.ts';

async function settings() {
  const s = await chrome.storage.local.get(['token', 'apiBase']);
  return { token: (s.token as string | undefined) ?? '', apiBase: ((s.apiBase as string | undefined) || DEFAULT_API).replace(/\/$/, '') };
}

async function call(req: ApiRequest): Promise<ApiResponse> {
  const { token, apiBase } = await settings();
  if (!token) return { ok: false, status: 401, data: { error: 'Connect the extension first: click the ShipItLoud icon in your toolbar.' } };
  try {
    const res = await fetch(`${apiBase}${req.path}`, {
      method: req.method ?? (req.body ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${token}`, ...(req.body ? { 'Content-Type': 'application/json' } : {}) },
      body: req.body ? JSON.stringify(req.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Couldn’t reach ShipItLoud. Check your connection.' } };
  }
}

chrome.runtime.onMessage.addListener((msg: { type: string; req?: ApiRequest }, _sender, reply) => {
  if (msg.type === 'api' && msg.req) {
    call(msg.req).then(reply);
    return true; // async reply
  }
  if (msg.type === 'open-popup-help') {
    chrome.tabs.create({ url: `${DEFAULT_API}/app` });
  }
  return false;
});
