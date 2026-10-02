// Toolbar popup: connect with a token from Settings, then show today's Reddit searches.
import { DEFAULT_API, api, type Me } from './shared.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function show() {
  const { token, apiBase } = await chrome.storage.local.get(['token', 'apiBase']);
  ($('api') as HTMLInputElement).value = (apiBase as string) || DEFAULT_API;
  if (!token) { $('connect').hidden = false; $('connected').hidden = true; return; }
  $('connect').hidden = true; $('connected').hidden = false;
  $('ws').textContent = 'Checking…';
  const r = await api<Me>({ path: '/api/ext/me' });
  if (!r.ok) {
    $('ws').textContent = r.data.error ?? 'Connection failed.';
    $('links').replaceChildren();
    return;
  }
  $('ws').textContent = r.data.workspace.name;
  $('links').replaceChildren(...r.data.links.map((l) => {
    const a = document.createElement('a');
    a.href = l.href; a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = '<b></b><span></span>';
    a.querySelector('b')!.textContent = l.label;
    a.querySelector('span')!.textContent = l.where;
    return a;
  }));
  if (!r.data.links.length) $('links').textContent = 'Add phrases in Listening to get searches here.';
}

$('connect').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = ($('token') as HTMLInputElement).value.trim();
  const apiBase = ($('api') as HTMLInputElement).value.trim().replace(/\/$/, '') || DEFAULT_API;
  const err = $('err');
  err.textContent = '';
  if (!/^sil_[\w-]{20,}$/.test(token)) { err.textContent = 'That doesn’t look like a connection code. Copy it again from Settings.'; return; }
  ($('go') as HTMLButtonElement).disabled = true;
  await chrome.storage.local.set({ token, apiBase });
  const r = await api<Me>({ path: '/api/ext/me' });
  ($('go') as HTMLButtonElement).disabled = false;
  if (!r.ok) { await chrome.storage.local.remove('token'); err.textContent = r.data.error ?? 'Couldn’t connect.'; return; }
  show();
});

$('disconnect').addEventListener('click', async () => { await chrome.storage.local.remove('token'); show(); });
$('settings').addEventListener('click', async () => {
  const { apiBase } = await chrome.storage.local.get('apiBase');
  chrome.tabs.create({ url: `${((apiBase as string) || DEFAULT_API).replace(/\/$/, '')}/app` });
});

show();
