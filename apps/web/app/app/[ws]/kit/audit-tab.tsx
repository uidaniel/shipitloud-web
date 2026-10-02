import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { runPageAudit } from '../../actions';
import { CopyButton } from '../analytics/parts';
import { KitRefresher } from './refresher';

type Area = 'clarity' | 'cta' | 'trust';
interface Fix { problem: string; quote: string; fix: string; rewrite: string }
const AREAS: { key: Area; label: string; ask: string }[] = [
  { key: 'clarity', label: 'Clarity', ask: 'Can a visitor tell what it is in five seconds?' },
  { key: 'cta', label: 'Call to action', ask: 'Is the next step obvious?' },
  { key: 'trust', label: 'Trust', ask: 'Is there a reason to believe it?' },
];
const SIGNALS: { key: string; label: string }[] = [
  { key: 'testimonials', label: 'Quotes from users' }, { key: 'numbers', label: 'User numbers' }, { key: 'logos', label: 'Logos or press' },
  { key: 'reviews', label: 'Reviews' }, { key: 'founder', label: 'Who’s behind it' }, { key: 'pricing', label: 'Pricing' },
  { key: 'privacy', label: 'Privacy policy' }, { key: 'contact', label: 'Contact' }, { key: 'refund', label: 'Refunds or cancel any time' },
];

export async function AuditTab({ id, url }: { id: string; url: string | null }) {
  const { sb } = await requireWorkspace(id);
  const [{ data: last }, { data: running }] = await Promise.all([
    sb.from('page_audits').select('id, url, status, error, facts, fixes, hints, created_at').eq('workspace_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('jobs').select('id').eq('workspace_id', id).eq('type', 'kit.audit').in('status', ['queued', 'running']).limit(1),
  ]);
  const busy = !!running?.length;
  const ok = last?.status === 'ready';
  const fixes = (last?.fixes ?? {}) as Partial<Record<Area, Fix>>;
  const facts = (last?.facts ?? {}) as { h1?: string[]; ctas?: string[]; forms?: number; trust?: Record<string, boolean> };
  const hints = ((last?.hints ?? []) as { area: Area; issue: string }[]);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {busy && <KitRefresher />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>Landing page audit</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>The one fix that matters most for clarity, for your call to action, and for trust.</p>
        </div>
        {url ? (
          <form action={runPageAudit}>
            <input type="hidden" name="ws" value={id} />
            <Submit className="pr-btn pr-btn-primary" pending="Starting…" disabled={busy}>{busy ? <><span className="spin" /> Reading your page…</> : last ? 'Audit again' : 'Audit my page'}</Submit>
          </form>
        ) : <Link className="pr-btn" href={`/app/${id}/settings`}>Add your site link</Link>}
      </div>

      {busy && !ok && (
        <div className="pr-audit" aria-busy="true">
          {AREAS.map((a) => <div key={a.key} className="pr-audit-card"><div className="sk sk-title" style={{ width: '35%' }} /><div className="sk sk-line" /><div className="sk sk-line" style={{ width: '70%' }} /><div className="sk sk-block" style={{ height: 48 }} /></div>)}
        </div>
      )}

      {last && last.status === 'failed' && !busy && (
        <div className="pr-banner pr-banner-warn" role="alert" style={{ margin: 0 }}>We couldn’t audit {new URL(last.url).hostname}: {last.error}</div>
      )}

      {ok && (
        <>
          <p className="pr-hint" style={{ margin: 0 }}>{new URL(last.url).hostname} · {new Date(last.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          <div className="pr-audit">
            {AREAS.map((a, i) => {
              const f = fixes[a.key];
              if (!f) return null;
              return (
                <article key={a.key} className="pr-audit-card pr-fade-in">
                  <header><span className="n">{i + 1}</span><div><b>{a.label}</b><small>{a.ask}</small></div></header>
                  <p className="problem">{f.problem}</p>
                  {f.quote && <blockquote>{f.quote}</blockquote>}
                  <p className="fix"><span>Fix</span>{f.fix}</p>
                  {f.rewrite && (
                    <div className="rewrite"><span>Try</span><p>{f.rewrite}</p><CopyButton text={f.rewrite} /></div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="pr-grid-2" style={{ alignItems: 'start' }}>
            <section className="pr-section">
              <div className="pr-section-h"><h2>What we read</h2><p>As a first-time visitor sees it.</p></div>
              <div className="pr-section-b pr-audit-facts">
                <div><span>Headline</span><b>{facts.h1?.[0] ?? 'None found'}</b></div>
                <div><span>Buttons</span><b>{facts.ctas?.length ? facts.ctas.slice(0, 5).join(' · ') : 'None found'}</b></div>
                <div><span>Email form</span><b>{facts.forms ? 'Yes' : 'No'}</b></div>
                <div className="signals">{SIGNALS.map((s) => <span key={s.key} className={`pr-chip ${facts.trust?.[s.key] ? 'pr-chip-ok' : ''}`}>{facts.trust?.[s.key] ? '✓ ' : ''}{s.label}</span>)}</div>
              </div>
            </section>
            <section className="pr-section">
              <div className="pr-section-h"><h2>Also worth a look</h2><p>Smaller things our checks noticed.</p></div>
              <div className="pr-section-b">
                {hints.length ? <ul className="pr-audit-hints">{hints.map((h) => <li key={h.issue}><span className="pr-chip">{AREAS.find((a) => a.key === h.area)?.label}</span>{h.issue}</li>)}</ul>
                  : <p className="pr-hint" style={{ margin: 0 }}>Nothing else stood out.</p>}
              </div>
            </section>
          </div>
        </>
      )}

      {!last && !busy && <div className="pr-list"><div className="pr-empty"><h2>Not audited yet</h2><p>Takes under a minute. We read your public homepage the way a first-time visitor would.</p></div></div>}
    </div>
  );
}
