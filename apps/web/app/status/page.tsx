import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { supabaseAdmin } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Status', description: 'Live status of ShipItLoud and the platforms it works with.' };
export const dynamic = 'force-dynamic';

type Level = 'ok' | 'degraded' | 'down' | 'test';
const LABEL: Record<Level, string> = { ok: 'Operational', degraded: 'Slower than usual', down: 'Down', test: 'Test mode' };

// Platform status (PRD section 25): checked live from our own database and queue, plus which integrations are on.
export default async function Status() {
  const db = supabaseAdmin();
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  let dbOk = true;
  const [done, failed, backlog] = await Promise.all([
    db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('finished_at', iso(15 * 60_000)),
    db.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['failed', 'dead']).gte('finished_at', iso(3600_000)),
    db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('run_at', iso(10 * 60_000)),
  ]).catch(() => { dbOk = false; return [{ count: 0 }, { count: 0 }, { count: 0 }]; });
  const queueLevel: Level = !dbOk ? 'down' : (backlog.count ?? 0) > 50 ? 'degraded' : (failed.count ?? 0) > 20 ? 'degraded' : 'ok';
  const key = (k: string, test = false): Level => (process.env[k] ? (test ? 'test' : 'ok') : 'test');
  const rows: { name: string; level: Level; note?: string }[] = [
    { name: 'App and dashboard', level: dbOk ? 'ok' : 'down' },
    { name: 'Background work (drafts, posters, videos)', level: queueLevel, note: dbOk ? `${done.count ?? 0} jobs done in the last 15 minutes` : undefined },
    { name: 'AI writing', level: process.env.ANTHROPIC_API_KEY ? 'ok' : 'test' },
    { name: 'Emails', level: process.env.RESEND_API_KEY && process.env.ACTIONS_MODE === 'live' ? 'ok' : 'test' },
    { name: 'Payments (Dodo Payments)', level: key('DODO_API_KEY', process.env.DODO_MODE !== 'live') },
    { name: 'Listening: Hacker News, Bluesky, GitHub, RSS', level: dbOk ? 'ok' : 'down' },
  ];
  const worst: Level = rows.some((r) => r.level === 'down') ? 'down' : rows.some((r) => r.level === 'degraded') ? 'degraded' : 'ok';
  return (
    <LegalPage title="Status" updated={false}>
      <div className={`status-hero is-${worst}`}><i />{worst === 'ok' ? 'All systems operational' : worst === 'degraded' ? 'Some things are slower than usual' : 'We’re having trouble and are on it'}</div>
      <ul className="status-list">
        {rows.map((r) => <li key={r.name}><span>{r.name}{r.note && <small>{r.note}</small>}</span><b className={`is-${r.level}`}>{LABEL[r.level]}</b></li>)}
      </ul>
      <p>Checked {new Date(now).toUTCString()}. Incidents are posted here and in the app.</p>
    </LegalPage>
  );
}
