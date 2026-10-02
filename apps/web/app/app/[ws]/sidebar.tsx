'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { markNotificationsRead, signOut } from '../actions';

interface Note { id: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string }
interface Meter { label: string; used: number; cap: number | null }

const PLAN: Record<string, string> = { free: 'Free', launch_pass: 'Launch Pass', grow: 'Grow', scale: 'Scale' };

export function ago(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Sidebar({ ws, pending, meter, email, notifications, children }: {
  ws: { id: string; name: string; plan: string };
  pending: number;
  meter: Meter[];
  email: string;
  notifications: Note[];
  children: ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const base = `/app/${ws.id}`;
  const unread = notifications.some((n) => !n.read_at);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!bell) return;
    const close = (e: MouseEvent) => { if (!bellRef.current?.contains(e.target as Node)) setBell(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bell]);

  const nav = [
    { href: `${base}/inbox`, label: 'Inbox', icon: Icon.inbox, count: pending },
    { href: `${base}/activity`, label: 'Activity', icon: Icon.activity },
    { href: `${base}/brand`, label: 'Brand', icon: Icon.brand },
    { href: `${base}/kit`, label: 'Launch kit', icon: Icon.kit },
    { href: `${base}/plan`, label: 'Launch plan', icon: Icon.plan },
    { href: `${base}/waitlist`, label: 'Waitlist', icon: Icon.users },
    { href: `${base}/listening`, label: 'Listening', icon: Icon.ear },
    { href: `${base}/content`, label: 'Content', icon: Icon.pen },
    { href: `${base}/blog`, label: 'Blog', icon: Icon.doc },
    { href: `${base}/customers`, label: 'Customers', icon: Icon.heart },
    { href: `${base}/analytics`, label: 'Momentum', icon: Icon.chart },
  ];
  const title = path.endsWith('/activity') ? 'Activity' : path.endsWith('/settings') ? 'Settings' : path.endsWith('/brand') ? 'Brand' : path.endsWith('/kit') ? 'Launch kit' : path.endsWith('/plan') ? 'Launch plan' : path.endsWith('/waitlist') ? 'Waitlist' : path.endsWith('/listening') ? 'Listening' : path.endsWith('/content') ? 'Content' : path.includes('/blog') ? 'Blog' : path.endsWith('/analytics') ? 'Momentum' : path.endsWith('/customers') ? 'Customers' : 'Inbox';

  return (
    <>
      <aside className={`pr-side${open ? ' is-open' : ''}`}>
        <div className="pr-ws">
          <span className="pr-ws-dot">{ws.name.slice(0, 1).toUpperCase()}</span>
          <span className="pr-ws-name">{ws.name}</span>
        </div>
        <nav className="pr-nav" aria-label="Workspace">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href || path.startsWith(`${n.href}/`) ? 'page' : undefined}>
              {n.icon}{n.label}{!!n.count && <span className="count">{n.count}</span>}
            </Link>
          ))}
          <span className="pr-nav-k" />
          <Link href={`${base}/settings`} aria-current={path === `${base}/settings` ? 'page' : undefined}>{Icon.settings}Settings</Link>
        </nav>
        <div className="pr-side-foot">
          <div className="pr-meter">
            <div className="pr-meter-h"><span>This month</span><b>{PLAN[ws.plan] ?? ws.plan}</b></div>
            {meter.map((m) => {
              const pct = m.cap ? Math.min(100, (m.used / m.cap) * 100) : m.cap === 0 ? 100 : 0;
              return (
                <div key={m.label} className="pr-meter-row">
                  <span><span>{m.label}</span><span>{m.cap === 0 ? 'Not in plan' : m.cap == null ? `${m.used}` : `${m.used} / ${m.cap}`}</span></span>
                  <span className="pr-meter-bar"><i className={m.cap != null && m.used >= m.cap && m.cap > 0 ? 'full' : ''} style={{ width: `${m.cap === 0 ? 0 : pct}%` }} /></span>
                </div>
              );
            })}
          </div>
          <div className="pr-user">
            <span title={email}>{email}</span>
            <form action={signOut}><button className="pr-btn pr-btn-ghost pr-btn-sm">Log out</button></form>
          </div>
        </div>
      </aside>

      <div className="pr-main">
        <header className="pr-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="pr-btn pr-btn-ghost pr-btn-sm pr-mobile-top" aria-label="Open menu" onClick={() => setOpen(true)}>{Icon.menu}</button>
            <h1>{title}</h1>
          </div>
          <div className="pr-top-r">
            <div className="pr-bell" ref={bellRef}>
              <button className="pr-btn pr-btn-ghost pr-btn-sm" aria-label="Notifications" aria-expanded={bell} onClick={() => { setBell(!bell); if (!bell && unread) void markNotificationsRead(); }}>
                {Icon.bell}
              </button>
              {unread && <span className="pr-bell-dot" aria-hidden="true" />}
              {bell && (
                <div className="pr-pop pr-fade-in" role="dialog" aria-label="Notifications">
                  <div className="pr-pop-h">Notifications</div>
                  {notifications.length ? notifications.map((n) => (
                    <a key={n.id} className={`n${n.read_at ? '' : ' unread'}`} href={n.url ? new URL(n.url).pathname : '#'}>
                      <b>{n.title}</b>
                      <span>{n.body ? `${n.body} · ` : ''}{ago(n.created_at)}</span>
                    </a>
                  )) : <div className="none">You&apos;re all caught up.</div>}
                </div>
              )}
            </div>
          </div>
        </header>
        {children}
      </div>
    </>
  );
}
