import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { approveAdLaunch, moreAdCreatives, pauseAdCampaign, resumeAdCampaign, stopAllAds } from '../../actions';
import { KitRefresher } from '../kit/refresher';
import { CampaignForm } from './parts';

export const metadata: Metadata = { title: 'Ads' };

interface Camp { id: string; platform: 'meta' | 'google'; name: string; goal: string; regions: string[]; daily_cap_cents: number; total_cap_cents: number; spent_cents: number; spent_today_cents: number; mode: 'test' | 'autopilot'; status: string; pause_reason: string | null; special_category: string | null; simulated: boolean; launched_at: string | null; error: string | null; created_at: string }
interface Ad { id: string; campaign_id: string; asset_id: string | null; status: string; pause_reason: string | null; budget_cents: number; impressions: number; clicks: number; conversions: number; spend_cents: number }
interface Ev { id: string; campaign_id: string; action: string; actor: string; reason: string; amount_cents: number | null; created_at: string }

const $ = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, [string, string]> = {
  drafting: ['Writing ads…', ''], ready: ['Waiting for you', 'pr-chip-warn'], active: ['Running', 'pr-chip-ok'], paused: ['Paused', 'pr-chip-warn'],
  capped: ['Budget spent', ''], ended: ['Ended', ''], failed: ['Needs attention', 'pr-chip-warn'],
};
const ACTION: Record<string, string> = { create: 'Set up', launch: 'Launched', pause: 'Paused', resume: 'Resumed', shift_budget: 'Budget moved', refresh: 'Fresh ad', cap_reached: 'Cap reached', anomaly: 'Stopped: unusual spend', kill: 'Stopped by you', policy_block: 'Check', sync_error: 'Problem', end: 'Ended' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Bar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  return (
    <div className="pr-spend">
      <div><span>{label}</span><b>{$(used)} <small>of {$(cap)}</small></b></div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={used}><i style={{ width: `${pct}%` }} className={pct >= 100 ? 'full' : pct >= 80 ? 'near' : ''} /></div>
    </div>
  );
}

export default async function Ads({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  if (ws.plan !== 'scale') {
    return (
      <div className="pr-body" style={{ display: 'grid', gap: 20 }}>
        <div><h1 className="pr-h1">Ads</h1><p className="pr-lead">Ads on autopilot, inside limits you set.</p></div>
        <div className="pr-list"><div className="pr-empty"><h2>Ads autopilot is on the Scale plan</h2><p>Once organic posts show which messages work, put budget behind them. You set daily and total caps; we write the ads, you approve them, and autopilot only acts inside your limits.</p><Link className="pr-btn pr-btn-primary" href="/pricing" style={{ marginTop: 12 }}>See plans</Link></div></div>
      </div>
    );
  }
  const [{ data: camps }, { data: ads }, { data: events }, { data: assets }] = await Promise.all([
    sb.from('ad_campaigns').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(10),
    sb.from('ads').select('id, campaign_id, asset_id, status, pause_reason, budget_cents, impressions, clicks, conversions, spend_cents').eq('workspace_id', id).order('created_at'),
    sb.from('ad_events').select('id, campaign_id, action, actor, reason, amount_cents, created_at').eq('workspace_id', id).order('created_at', { ascending: false }).limit(60),
    sb.from('assets').select('id, status, file_url, content').eq('workspace_id', id).eq('type', 'ad_creative'),
  ]);
  const campaigns = (camps ?? []) as Camp[];
  const byAsset = new Map((assets ?? []).map((a) => [a.id as string, a as { id: string; status: string; file_url: string | null; content: { headline?: string; angle?: string; primary_text?: string } }]));
  const busy = campaigns.some((c) => c.status === 'drafting' || c.status === 'failed' && !c.error);
  const running = campaigns.some((c) => c.status === 'active');

  return (
    <div className="pr-body" style={{ display: 'grid', gap: 20 }}>
      {busy && <KitRefresher />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div><h1 className="pr-h1">Ads</h1><p className="pr-lead">You set the caps and approve the ads. Autopilot only acts inside your limits, and tells you why.</p></div>
        {running && <form action={stopAllAds}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn pr-btn-danger" pending="Stopping…">Stop all ads</Submit></form>}
      </div>

      {campaigns.map((c) => {
        const mine = ((ads ?? []) as Ad[]).filter((a) => a.campaign_id === c.id);
        const approved = mine.filter((a) => a.asset_id && ['approved', 'auto_approved', 'scheduled', 'published'].includes(byAsset.get(a.asset_id)?.status ?? ''));
        const waiting = mine.filter((a) => a.asset_id && byAsset.get(a.asset_id)?.status === 'pending').length;
        const evs = ((events ?? []) as Ev[]).filter((e) => e.campaign_id === c.id).slice(0, 12);
        const day = c.launched_at ? Math.floor((Date.now() - Date.parse(c.launched_at)) / 86_400_000) + 1 : 0;
        const unit = c.goal === 'traffic' ? 'Clicks' : c.goal === 'installs' ? 'Installs' : 'Signups';
        const [label, chip] = STATUS[c.status] ?? [c.status, ''];
        return (
          <section key={c.id} className="pr-section pr-campaign">
            <div className="pr-section-h" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <div style={{ minWidth: 0 }}><h2>{c.name}</h2><p>{c.platform === 'meta' ? 'Facebook and Instagram' : 'Google search'} · {c.regions.join(', ')} · {c.goal}</p></div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.simulated && <span className="pr-chip" title="No real platform, no real money">Simulated</span>}
                <span className={`pr-chip ${c.mode === 'autopilot' ? 'pr-chip-violet' : ''}`}>{c.mode === 'autopilot' ? 'Autopilot' : 'Test mode'}</span>
                <span className={`pr-chip ${chip}`}>{label}</span>
              </div>
            </div>
            <div className="pr-section-b" style={{ display: 'grid', gap: 16 }}>
              {c.simulated && <p className="pr-mode-note">Running on the simulator: the numbers show how autopilot behaves, no money moves and nothing is shown to anyone. Connect your ad account in Settings to go live.</p>}
              {c.special_category && <p className="pr-mode-note warn">This looks like a <b>{c.special_category.replace('_', ' ')}</b> ad. Meta requires its special category, so targeting is limited to countries.</p>}
              {c.error && <p className="pr-error" role="alert" style={{ margin: 0 }}>{c.error}</p>}
              {c.pause_reason && c.status !== 'active' && <p className="pr-mode-note warn">{c.pause_reason}</p>}
              <div className="pr-grid-2">
                <Bar label="Today" used={c.spent_today_cents} cap={c.daily_cap_cents} />
                <Bar label="Total" used={c.spent_cents} cap={c.total_cap_cents} />
              </div>
              <p className="pr-hint" style={{ margin: 0 }}>
                {['capped', 'ended'].includes(c.status) ? `Finished: ${$(c.spent_cents)} spent. The numbers below are what it brought in.`
                  : c.mode === 'test' ? 'Test mode: we report what happens but don’t optimize or claim results at this budget.'
                  : !c.launched_at ? 'Autopilot starts after launch, with a 7-day test before any change.'
                  : day <= 7 ? `Day ${day} of the 7-day test. Autopilot changes nothing until it ends.` : 'Autopilot checks every day and only acts inside your caps.'}
              </p>
              {mine.length > 0 && (
                <div className="pr-table-wrap"><table className="pr-table pr-table-tight pr-ads-table">
                  <thead><tr><th>Ad</th><th>Status</th><th>Budget/day</th><th className="hide-sm">Spent</th><th className="hide-sm">Clicks</th><th>{unit}</th><th>Cost each</th></tr></thead>
                  <tbody>
                    {mine.map((a) => {
                      const as = a.asset_id ? byAsset.get(a.asset_id) : undefined;
                      const res = c.goal === 'traffic' ? a.clicks : a.conversions;
                      const st = a.status === 'waiting' ? (as?.status === 'pending' ? 'Needs you' : as?.status === 'rejected' ? 'Rejected' : 'Approved') : a.status === 'active' ? 'Running' : a.status === 'paused' ? 'Paused' : a.status;
                      return (
                        <tr key={a.id}>
                          <td><div className="pr-ad-cell">{as?.file_url ? <img src={as.file_url} alt="" width={40} height={40} /> : <span className="ph" />}<div><b>{as?.content.headline ?? 'Ad'}</b><small>{a.pause_reason ?? as?.content.angle}</small></div></div></td>
                          <td><span className={`pr-chip ${a.status === 'active' ? 'pr-chip-ok' : st === 'Needs you' ? 'pr-chip-warn' : ''}`}>{st}</span></td>
                          <td>{a.budget_cents ? $(a.budget_cents) : '–'}</td>
                          <td className="hide-sm">{$(a.spend_cents)}</td>
                          <td className="hide-sm">{a.clicks.toLocaleString('en-US')}</td>
                          <td><b>{res}</b></td>
                          <td>{res ? $(Math.round(a.spend_cents / res)) : '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
              {c.status === 'drafting' && <div style={{ display: 'grid', gap: 10 }} aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="sk sk-line" style={{ width: `${85 - i * 10}%` }} />)}</div>}
              {evs.length > 0 && (
                <details className="pr-more" open={c.status !== 'ready'}>
                  <summary>What happened ({evs.length})</summary>
                  <ol className="pr-adlog">
                    {evs.map((e) => (
                      <li key={e.id}><span className={`k k-${e.action}`}>{ACTION[e.action] ?? e.action}</span><p>{e.reason}</p><small>{e.actor === 'ai' ? 'Autopilot' : e.actor === 'founder' ? 'You' : 'Safety check'} · {when(e.created_at)}</small></li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
            <div className="pr-section-f" style={{ flexWrap: 'wrap', gap: 8 }}>
              {c.status === 'ready' || (c.status === 'failed' && approved.length) ? (
                approved.length ? (
                  <form action={approveAdLaunch} style={{ marginRight: 'auto' }}><input type="hidden" name="ws" value={id} /><input type="hidden" name="id" value={c.id} /><Submit className="pr-btn pr-btn-primary" pending="Launching…">Launch with {approved.length} ad{approved.length === 1 ? '' : 's'}</Submit></form>
                ) : <span className="pr-hint" style={{ margin: 0, marginRight: 'auto' }}>{waiting ? <>Approve at least one ad in your <Link className="pr-link" href={`/app/${id}/inbox`}>inbox</Link> to launch.</> : 'No ads approved yet.'}</span>
              ) : <span style={{ marginRight: 'auto' }} />}
              {['ready', 'active', 'paused'].includes(c.status) && <form action={moreAdCreatives}><input type="hidden" name="ws" value={id} /><input type="hidden" name="id" value={c.id} /><Submit className="pr-btn pr-btn-sm" pending="…">Write 2 more ads</Submit></form>}
              {c.status === 'active' && <form action={pauseAdCampaign}><input type="hidden" name="ws" value={id} /><input type="hidden" name="id" value={c.id} /><Submit className="pr-btn pr-btn-sm" pending="Pausing…">Pause</Submit></form>}
              {c.status === 'paused' && <form action={resumeAdCampaign}><input type="hidden" name="ws" value={id} /><input type="hidden" name="id" value={c.id} /><Submit className="pr-btn pr-btn-sm" pending="Resuming…">Resume</Submit></form>}
            </div>
          </section>
        );
      })}

      {campaigns.length ? (
        <details className="pr-more"><summary>New campaign</summary><div style={{ paddingTop: 12 }}><CampaignForm ws={id} landing={ws.url ?? ''} /></div></details>
      ) : <CampaignForm ws={id} landing={ws.url ?? ''} />}
    </div>
  );
}
