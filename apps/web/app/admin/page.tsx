import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { Tiles } from '@/components/app/bento';
import { Submit } from '@/components/app/ui';
import { plans } from '@/lib/site';
import { setSuspended } from './actions';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const STEPS = ['paste', 'understand', 'questions', 'summary', 'analysis', 'channels', 'connect', 'wins', 'live'];
const PRICE: Record<string, number> = Object.fromEntries(plans.map((p) => [p.id, p.price.USD]));
// A workspace costing more than this in AI a month gets flagged (PRD section 25).
const EXPECTED_COST: Record<string, number> = { free: 0.5, launch_pass: 5, grow: 8, scale: 25 };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const ago = (iso: string) => { const h = Math.round((Date.now() - Date.parse(iso)) / 3600_000); return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };

export default async function Admin({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { admin: db } = await requireAdmin();
  const { q } = await searchParams;
  const now = Date.now();
  const since = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const period = new Date().toISOString().slice(0, 7) + '-01';

  const [profiles, profiles30, live, approvals, subs, steps, usage, wss, jobs24, failed, backlog, billErr, formats, dirs, freeAnalyses] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since(30)),
    db.from('setup_progress').select('workspace_id', { count: 'exact', head: true }).eq('step', 'live').not('completed_at', 'is', null),
    db.from('approvals').select('workspace_id').in('status', ['approved', 'edited']).limit(20000),
    db.from('subscriptions').select('workspace_id, plan, status, trial_ends_at, first_paid_at, updated_at, created_at'),
    db.from('setup_progress').select('step').not('completed_at', 'is', null).limit(50000),
    db.from('usage').select('workspace_id, cost_usd, ai_drafts, images, videos').eq('period', period).order('cost_usd', { ascending: false }).limit(15),
    db.from('workspaces').select('id, product_name, url, plan, owner_id, created_at, suspended_at, suspended_reason').order('created_at', { ascending: false }).limit(2000),
    db.from('jobs').select('workspace_id').gte('created_at', since(1)).limit(50000),
    db.from('jobs').select('type, last_error, finished_at').in('status', ['failed', 'dead']).gte('finished_at', since(1)).order('finished_at', { ascending: false }).limit(200),
    db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('run_at', new Date(now - 10 * 60_000).toISOString()),
    db.from('billing_events').select('id, type, error, received_at').not('error', 'is', null).order('received_at', { ascending: false }).limit(10),
    db.from('viral_formats').select('id', { count: 'exact', head: true }),
    db.from('directories').select('id', { count: 'exact', head: true }),
    db.from('free_analyses').select('id', { count: 'exact', head: true }),
  ]);

  // Business
  const all = subs.data ?? [];
  const paying = all.filter((s) => ['active', 'past_due'].includes(s.status) && s.plan !== 'launch_pass' && s.first_paid_at);
  const mrr = paying.reduce((n, s) => n + (PRICE[s.plan] ?? 0), 0);
  const trials = all.filter((s) => s.trial_ends_at);
  const trialsEnded = trials.filter((s) => Date.parse(s.trial_ends_at!) < now);
  const converted = trialsEnded.filter((s) => s.first_paid_at);
  const churned30 = all.filter((s) => s.status === 'cancelled' && s.first_paid_at && Date.parse(s.updated_at) > now - 30 * 86_400_000).length;
  const activated = new Set((approvals.data ?? []).map((a) => a.workspace_id)).size;
  const byPlan = (p: string) => all.filter((s) => s.plan === p && ['active', 'trialing', 'past_due'].includes(s.status)).length;

  // Funnel by setup step
  const stepCount = Object.fromEntries(STEPS.map((s) => [s, 0]));
  for (const r of steps.data ?? []) stepCount[r.step] = (stepCount[r.step] ?? 0) + 1;

  // Abuse: one domain on several workspaces, unusual job volume
  const ws = wss.data ?? [];
  const name = new Map(ws.map((w) => [w.id, w]));
  const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : null; } catch { return null; } };
  const domains = new Map<string, string[]>();
  for (const w of ws) { const h = host(w.url); if (h && !/^(apps\.apple\.com|play\.google\.com)$/.test(h)) domains.set(h, [...(domains.get(h) ?? []), w.id]); }
  const dupes = [...domains.entries()].filter(([, ids]) => ids.length > 1).slice(0, 10);
  const volume = new Map<string, number>();
  for (const j of jobs24.data ?? []) if (j.workspace_id) volume.set(j.workspace_id, (volume.get(j.workspace_id) ?? 0) + 1);
  const heavy = [...volume.entries()].filter(([, n]) => n > 300).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Health: failed jobs by type
  const failedBy = new Map<string, { n: number; last: string | null }>();
  for (const f of failed.data ?? []) { const c = failedBy.get(f.type) ?? { n: 0, last: f.last_error }; c.n++; failedBy.set(f.type, c); }

  // Users: search
  const term = (q ?? '').trim().toLowerCase();
  let found: typeof ws = [];
  if (term) {
    const { data: people } = await db.from('profiles').select('id').ilike('email', `%${term}%`).limit(20);
    const owners = new Set((people ?? []).map((p) => p.id));
    found = ws.filter((w) => owners.has(w.owner_id) || w.product_name.toLowerCase().includes(term) || (w.url ?? '').toLowerCase().includes(term)).slice(0, 20);
  }

  return (
    <div className="pr-body adm">
      <div className="pr-page-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div><h1 className="pr-h1">ShipItLoud admin</h1><p className="pr-lead">Live from the database. Every action here is logged.</p></div>
        <Link className="pr-btn" href="/app">Back to the app</Link>
      </div>

      <Tiles items={[
        { label: 'MRR', value: `$${mrr.toLocaleString()}`, tone: 'violet', sub: `${paying.length} paying` },
        { label: 'Signups', value: profiles.count ?? 0, tone: 'mesh', sub: `${profiles30.count ?? 0} in the last 30 days` },
        { label: 'Trial → paid', value: pct(converted.length, trialsEnded.length), tone: 'lime', sub: `${converted.length} of ${trialsEnded.length} finished trials` },
        { label: 'Churn (30 days)', value: pct(churned30, paying.length + churned30), tone: 'mint', sub: `${churned30} paying customers left` },
      ]} />

      <div className="adm-grid">
        <section className="pr-section">
          <div className="pr-section-h"><h2>Funnel</h2><p>Targets: setup 70%, activation 50% of setups, trial 25% of activated, trial to paid 50%.</p></div>
          <div className="pr-section-b">
            <dl className="adm-dl">
              <div><dt>Setups completed</dt><dd>{live.count ?? 0} <small>{pct(live.count ?? 0, profiles.count ?? 0)} of signups</small></dd></div>
              <div><dt>Activated (1+ approval)</dt><dd>{activated} <small>{pct(activated, live.count ?? 0)} of setups</small></dd></div>
              <div><dt>Trials started</dt><dd>{trials.length} <small>{pct(trials.length, activated)} of activated</small></dd></div>
              <div><dt>Free analyses (landing)</dt><dd>{freeAnalyses.count ?? 0}</dd></div>
            </dl>
            <div className="adm-steps">{STEPS.map((s) => <div key={s}><span>{s}</span><i style={{ width: `${Math.max(2, ((stepCount[s] ?? 0) / Math.max(1, stepCount.paste ?? 1)) * 100)}%` }} /><b>{stepCount[s]}</b></div>)}</div>
          </div>
        </section>

        <section className="pr-section">
          <div className="pr-section-h"><h2>Revenue by plan</h2><p>Active, trialing or past due right now.</p></div>
          <div className="pr-section-b">
            <dl className="adm-dl">
              {(['grow', 'scale', 'launch_pass'] as const).map((p) => <div key={p}><dt>{plans.find((x) => x.id === p)?.name}</dt><dd>{byPlan(p)} <small>${PRICE[p]}{p === 'launch_pass' ? ' once' : '/mo'}</small></dd></div>)}
            </dl>
            <h3 className="adm-h3">Self-launch</h3>
            <dl className="adm-dl">
              <div><dt>Signups vs 200</dt><dd>{profiles.count ?? 0} <small>{pct(profiles.count ?? 0, 200)}</small></dd></div>
              <div><dt>Paying vs 20</dt><dd>{paying.length} <small>{pct(paying.length, 20)}</small></dd></div>
            </dl>
          </div>
        </section>
      </div>

      <section className="pr-section">
        <div className="pr-section-h"><h2>AI cost this month</h2><p>Top workspaces. Flagged when above what their plan should cost.</p></div>
        <div className="pr-table-wrap"><table className="pr-table">
          <thead><tr><th>Workspace</th><th>Plan</th><th>AI drafts</th><th>Images</th><th>Videos</th><th>Cost</th></tr></thead>
          <tbody>{(usage.data ?? []).map((u) => { const w = name.get(u.workspace_id); const over = Number(u.cost_usd) > (EXPECTED_COST[w?.plan ?? 'free'] ?? 1); return (
            <tr key={u.workspace_id}><td>{w?.product_name ?? u.workspace_id.slice(0, 8)}</td><td>{w?.plan}</td><td>{u.ai_drafts}</td><td>{u.images}</td><td>{u.videos}</td><td><b style={{ color: over ? 'var(--err)' : undefined }}>${Number(u.cost_usd).toFixed(2)}</b>{over && <span className="pr-chip pr-chip-err" style={{ marginLeft: 8 }}>Over</span>}</td></tr>
          ); })}</tbody>
        </table></div>
      </section>

      <div className="adm-grid">
        <section className="pr-section">
          <div className="pr-section-h"><h2>Abuse signals</h2><p>Several workspaces on one domain, or more than 300 jobs in a day.</p></div>
          <div className="pr-section-b">
            {!dupes.length && !heavy.length && <p className="pr-hint" style={{ margin: 0 }}>Nothing unusual.</p>}
            {dupes.map(([d, ids]) => <div key={d} className="adm-row"><span><b>{d}</b> · {ids.length} workspaces</span><span className="pr-hint">{ids.map((i) => name.get(i)?.product_name).join(', ')}</span></div>)}
            {heavy.map(([id, n]) => <div key={id} className="adm-row"><span><b>{name.get(id)?.product_name ?? id.slice(0, 8)}</b> · {n} jobs today</span><SuspendButton id={id} suspended={!!name.get(id)?.suspended_at} /></div>)}
          </div>
        </section>

        <section className="pr-section">
          <div className="pr-section-h"><h2>Platform health</h2><p>Last 24 hours.</p></div>
          <div className="pr-section-b">
            <dl className="adm-dl"><div><dt>Queue backlog (over 10 min)</dt><dd>{backlog.count ?? 0}</dd></div><div><dt>Failed jobs</dt><dd>{failed.data?.length ?? 0}</dd></div></dl>
            {[...failedBy.entries()].map(([t, c]) => <div key={t} className="adm-row"><span><b>{t}</b> × {c.n}</span><span className="pr-hint adm-err">{c.last?.slice(0, 140)}</span></div>)}
            {(billErr.data ?? []).map((e) => <div key={e.id} className="adm-row"><span><b>Billing webhook</b> {e.type} · {ago(e.received_at)}</span><span className="pr-hint adm-err">{e.error}</span></div>)}
            <p className="pr-hint" style={{ margin: 0 }}>Content library: {formats.count ?? 0} viral formats, {dirs.count ?? 0} directories. <Link href="/status">Public status page</Link></p>
          </div>
        </section>
      </div>

      <section className="pr-section">
        <div className="pr-section-h"><h2>Workspaces</h2><p>Search by email, product or link.</p></div>
        <div className="pr-section-b">
          <form className="adm-search"><input className="pr-input" name="q" defaultValue={q ?? ''} placeholder="ada@… or product name" /><button className="pr-btn">Search</button></form>
          {(term ? found : ws.slice(0, 12)).map((w) => (
            <div key={w.id} className="adm-row">
              <span><b>{w.product_name}</b> · {w.plan} · {host(w.url) ?? 'no link'} · {ago(w.created_at)}{w.suspended_at && <span className="pr-chip pr-chip-err" style={{ marginLeft: 8 }}>Suspended</span>}</span>
              <SuspendButton id={w.id} suspended={!!w.suspended_at} />
            </div>
          ))}
          {term && !found.length && <p className="pr-hint" style={{ margin: 0 }}>No workspace matches.</p>}
        </div>
      </section>
    </div>
  );
}

function SuspendButton({ id, suspended }: { id: string; suspended: boolean }) {
  return (
    <form action={setSuspended}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="on" value={suspended ? 'false' : 'true'} />
      <Submit className={`pr-btn pr-btn-sm ${suspended ? '' : 'pr-btn-danger'}`} pending="…">{suspended ? 'Unsuspend' : 'Suspend'}</Submit>
    </form>
  );
}
