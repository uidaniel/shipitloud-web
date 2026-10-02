// Small line icons for the product UI (16px, currentColor).
const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const Icon = {
  inbox: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M3 11.5 5 4.5h10l2 7v4H3zM3 11.5h4l1 2h4l1-2h4" /></svg>,
  activity: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M2.5 10h3l2-5 4 10 2-5h4" /></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 20 20"><circle {...p} cx="10" cy="10" r="2.6" /><path {...p} d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" /></svg>,
  brand: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M10 2.5 12 7.5l5.5.5-4.2 3.6 1.3 5.4L10 14.2 5.4 17l1.3-5.4L2.5 8l5.5-.5z" /></svg>,
  kit: <svg width="16" height="16" viewBox="0 0 20 20"><rect {...p} x="3" y="3" width="6" height="6" rx="1.5" /><rect {...p} x="11" y="3" width="6" height="6" rx="1.5" /><rect {...p} x="3" y="11" width="6" height="6" rx="1.5" /><rect {...p} x="11" y="11" width="6" height="6" rx="1.5" /></svg>,
  plan: <svg width="16" height="16" viewBox="0 0 20 20"><rect {...p} x="3.5" y="4.5" width="13" height="12" rx="2" /><path {...p} d="M3.5 8.5h13M7 3v3M13 3v3" /></svg>,
  ear: <svg width="16" height="16" viewBox="0 0 20 20"><circle {...p} cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2.2" fill="currentColor" /></svg>,
  chart: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M4 16V9M8.5 16V5M13 16v-5M17 16V7" /></svg>,
  bell: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13zM8.5 17.5h3" /></svg>,
  menu: <svg width="18" height="18" viewBox="0 0 20 20"><path {...p} d="M3 6h14M3 10h14M3 14h14" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 20 20"><path {...p} strokeWidth={2} d="M4 10.5 8 14.5 16 6" /></svg>,
  x: <svg width="14" height="14" viewBox="0 0 20 20"><path {...p} strokeWidth={2} d="M5 5l10 10M15 5 5 15" /></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 20 20"><path {...p} d="m4 16 1-4 8-8 3 3-8 8z" /></svg>,
  copy: <svg width="14" height="14" viewBox="0 0 20 20"><rect {...p} x="7" y="7" width="10" height="10" rx="2" /><path {...p} d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></svg>,
  external: <svg width="14" height="14" viewBox="0 0 20 20"><path {...p} d="M11 3h6v6M17 3l-8 8M15 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" /></svg>,
  undo: <svg width="14" height="14" viewBox="0 0 20 20"><path {...p} d="M7 5 3 9l4 4M3.5 9H12a5 5 0 0 1 0 10h-2" /></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 20 20"><path {...p} strokeWidth={2} d="M10 4v12M4 10h12" /></svg>,
  users: <svg width="16" height="16" viewBox="0 0 20 20"><circle {...p} cx="8" cy="7" r="3" /><path {...p} d="M2.5 16.5c.6-2.8 2.8-4.5 5.5-4.5s4.9 1.7 5.5 4.5M13 4.2a3 3 0 0 1 0 5.6M14.5 12.3c1.6.6 2.6 2 3 4.2" /></svg>,
  pen: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M3.5 16.5 4.5 12 13 3.5l3.5 3.5L8 15.5zM11 5.5l3.5 3.5" /></svg>,
  doc: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M5 2.5h6.5L15 6v11.5H5zM11.5 2.5V6H15M7.5 10h5M7.5 13h5" /></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 20 20"><path {...p} d="M10 2.8 4.5 5v4.3c0 3.6 2.4 6.3 5.5 7.9 3.1-1.6 5.5-4.3 5.5-7.9V5z" /></svg>,
};
