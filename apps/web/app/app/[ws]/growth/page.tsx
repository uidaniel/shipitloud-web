import type { Metadata } from 'next';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { AnalysisView, typeLabel, type Analysis, type Channel } from '@/components/app/growth';
import { rerunAnalysis, saveChannels } from '../../actions';
import { KitRefresher } from '../kit/refresher';

export const metadata: Metadata = { title: 'Growth plan' };

export default async function Growth({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: rows }, { data: plan }] = await Promise.all([
    sb.from('growth_analyses').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(2),
    sb.from('channel_plans').select('channels, playbook_type').eq('workspace_id', id).maybeSingle(),
  ]);
  const running = rows?.[0]?.status === 'running';
  const a = (rows ?? []).find((r) => r.status === 'ready') as Analysis | undefined;
  const channels = ((plan?.channels ?? []) as Channel[]).sort((x, y) => x.rank - y.rank);
  return (
    <div className="pr-body" style={{ display: 'grid', gap: 20 }}>
      {running && <KitRefresher every={3000} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div><h1 className="pr-h1">Growth plan</h1><p className="pr-lead">Where {ws.product_name}’s users will come from, and the channels we use. It refreshes every month.</p></div>
        <form action={rerunAnalysis}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn" pending="Starting…" disabled={running}>{running ? <><span className="spin" /> Analysing…</> : 'Run again'}</Submit></form>
      </div>
      {a ? (
        <>
          <section className="pr-section"><div className="pr-section-b"><AnalysisView a={a} /></div></section>
          <form action={saveChannels} className="pr-section">
            <input type="hidden" name="ws" value={id} />
            <div className="pr-section-h"><h2>Channels</h2><p>Picked for a {typeLabel(plan?.playbook_type ?? a.product_type).toLowerCase()}. After two weeks, effort moves to whatever actually brings signups.</p></div>
            <div className="pr-section-b">
              <ol className="pr-chan">
                {channels.map((c) => (
                  <li key={c.id}><label><input type="checkbox" name="on" value={c.id} defaultChecked={c.enabled} /><span className="sw" aria-hidden="true" /><span className="t"><b>{c.name}</b>{c.role === 'lead' && <em>Lead</em>}<small>{c.reason}</small></span></label></li>
                ))}
              </ol>
            </div>
            <div className="pr-section-f"><Submit pending="Saving…">Save channels</Submit></div>
          </form>
        </>
      ) : running ? (
        <section className="pr-section" aria-busy="true"><div className="pr-section-b" style={{ display: 'grid', gap: 12 }}><div className="sk sk-block" /><div className="sk sk-line" /><div className="sk sk-line" style={{ width: '70%' }} /></div></section>
      ) : (
        <div className="pr-list"><div className="pr-empty"><h2>No analysis yet</h2><p>Run it to see your growth score, your three biggest opportunities and the channels that fit {ws.product_name}.</p></div></div>
      )}
    </div>
  );
}
