// The "Play loud" mark from the PRD (section 20), and the panel styles. Matches the product's dark theme.
export const LOGO = '<svg class="logo" viewBox="0 0 100 100" width="22" height="22" aria-hidden="true"><rect width="100" height="100" rx="24" fill="#5B3DF5"/><path d="M24 34 C24 29 29 26 33 29 L54 44 C58 47 58 53 54 56 L33 71 C29 74 24 71 24 66 Z" fill="#fff"/><path d="M64 40 A14 14 0 0 1 64 60" fill="none" stroke="#C6FF3D" stroke-width="6" stroke-linecap="round"/><path d="M72 32 A25 25 0 0 1 72 68" fill="none" stroke="#C6FF3D" stroke-width="6" stroke-linecap="round"/></svg>';

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { font: 14px/1.45 Geist, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #f5f5f2; -webkit-font-smoothing: antialiased; }
.pill { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 10px; border-radius: 999px; border: 1px solid rgba(245,245,242,.14); background: #111118; color: #f5f5f2; font: inherit; font-weight: 600; cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.pill:hover { background: #16161f; }
.count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; background: #c6ff3d; color: #0d0d12; font-size: 12px; display: grid; place-items: center; }
.panel { width: min(380px, calc(100vw - 32px)); max-height: min(72vh, 640px); display: flex; flex-direction: column; border-radius: 14px; border: 1px solid rgba(245,245,242,.14); background: #0b0b10; box-shadow: 0 20px 60px rgba(0,0,0,.5); overflow: hidden; animation: in .18s ease-out; }
@keyframes in { from { opacity: 0; transform: translateY(8px); } }
header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; border-bottom: 1px solid rgba(245,245,242,.08); }
.who { display: grid; flex: 1; min-width: 0; }
.who b { font-weight: 600; letter-spacing: -0.01em; }
.who span { color: #a3a3b1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: #a3a3b1; font-size: 20px; cursor: pointer; }
.x:hover { background: #1a1a24; color: #f5f5f2; }
.body { padding: 14px; overflow: auto; display: grid; gap: 12px; }
.sub { margin: 0 0 8px; color: #a3a3b1; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.list { display: grid; gap: 2px; }
.row, .thread { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 10px; align-items: start; padding: 8px; border-radius: 9px; color: inherit; text-decoration: none; }
.row:hover { background: #16161f; }
.thread { padding: 0 0 4px; }
.row-main { display: grid; gap: 2px; min-width: 0; }
.row-main b { font-weight: 500; font-size: 14px; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.row-main span { color: #6f6f7d; font-size: 12px; }
.score { height: 24px; border-radius: 7px; display: grid; place-items: center; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; background: #16161f; color: #a3a3b1; }
.score.hi { background: rgba(74,222,128,.14); color: #4ade80; }
.score.mid { background: rgba(251,191,36,.14); color: #fbbf24; }
.note { display: grid; gap: 4px; padding: 4px 2px; }
.note b { font-weight: 600; }
.note p { margin: 0; color: #a3a3b1; font-size: 13px; }
.btn { height: 36px; padding: 0 14px; border-radius: 9px; border: 1px solid rgba(245,245,242,.14); background: #111118; color: #f5f5f2; font: inherit; font-weight: 500; cursor: pointer; }
.btn:hover:not(:disabled) { background: #1a1a24; }
.btn.primary { background: #5b3df5; border-color: #5b3df5; color: #fff; }
.btn.primary:hover:not(:disabled) { background: #7a62ff; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn[hidden] { display: none; }
.draft { display: grid; gap: 10px; }
.text { width: 100%; resize: vertical; min-height: 120px; padding: 10px 12px; border-radius: 9px; border: 1px solid rgba(245,245,242,.14); background: #111118; color: #f5f5f2; font: inherit; line-height: 1.5; outline: none; }
.text:focus { border-color: #a493ff; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.flag { margin: 0; color: #fbbf24; font-size: 12px; }
.verdict { border-radius: 10px; padding: 10px 12px; display: grid; gap: 6px; }
.verdict b { font-weight: 600; font-size: 13px; }
.verdict ul { margin: 0; padding-left: 16px; display: grid; gap: 4px; font-size: 12.5px; color: #d6d6dc; }
.verdict.ok { background: rgba(74,222,128,.1); } .verdict.ok b { color: #4ade80; }
.verdict.warn { background: rgba(251,191,36,.1); } .verdict.warn b { color: #fbbf24; }
.verdict.block { background: rgba(248,113,113,.1); } .verdict.block b { color: #f87171; }
.sk { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, #16161f 25%, #1f1f2a 50%, #16161f 75%); background-size: 200% 100%; animation: sk 1.2s linear infinite; }
@keyframes sk { to { background-position: -200% 0; } }
.sk-row { display: grid; grid-template-columns: 38px 1fr; gap: 10px; padding: 8px; }
.sk-col { display: grid; gap: 8px; }
.spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .7s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
.logo { flex: none; display: block; }
@media (prefers-reduced-motion: reduce) { .sk, .spin, .panel { animation: none; } }
`;
