import type { Metadata } from 'next';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';
import { PostCard, PlatformMark, handleOf } from '@/components/app/post-card';
import { Icon } from '@/components/app/icons';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/supabase/server';
import { LogoIcon } from '@/components/logo';
import { BrandEditor } from '@/components/app/brand-editor';
import { Submit } from '@/components/app/ui';
import { AnalysisView, stageLabel, typeLabel, type Analysis, type Channel } from '@/components/app/growth';
import { acceptChannels, decide, setupNext } from '../../actions';
import { KitRefresher } from '../../[ws]/kit/refresher';
import { AnalysingScene } from '@/components/space/analysing-scene';
import { Comets } from '@/components/space/comets';
import { DescribeForm } from './describe';
import { SetupQuestions } from './questions';

export const metadata: Metadata = { title: 'Set up' };

// PRD section 23: paste URL → understand → summary → growth analysis → channel plan → connect → first wins → plan live.
const STEPS = ['understand', 'questions', 'summary', 'analysis', 'channels', 'connect', 'wins', 'live'] as const;
type Step = (typeof STEPS)[number];
const ICONS = { x: 1, linkedin: 1, instagram: 1, tiktok: 1, github: 1, reddit: 1, bluesky: 1 };
const ACCOUNT: Record<string, { name: string; note: string; href?: string }> = {
  x: { name: 'X', note: 'Post your updates and threads.' },
  linkedin: { name: 'LinkedIn', note: 'Post as you, where business buyers are.' },
  instagram: { name: 'Instagram', note: 'Reels and carousels.' },
  tiktok: { name: 'TikTok', note: 'Short videos.' },
  github: { name: 'GitHub', note: 'Turn releases into posts.', href: 'content?tab=updates' },
  reddit: { name: 'Reddit', note: 'Through our Chrome extension: you post with one tap.', href: 'settings#extension' },
};
const fmt = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

function Frame({ ws, step, wide, xwide, children }: { ws: string; step: Step; wide?: boolean; xwide?: boolean; children: React.ReactNode }) {
  const i = STEPS.indexOf(step);
  return (
    <div className="pr-onb cosmos setup-cosmos" style={{ alignItems: 'start', paddingTop: 'clamp(28px, 7vh, 72px)' }}>
      <div className="cosmos-sky" aria-hidden="true"><i className="s1" /><i className="s2" /><i className="s3" /></div>
      <Comets />
      <div className="pr-onb-card" style={{ maxWidth: xwide ? 1180 : wide ? 820 : 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <LogoIcon size={34} />
          <Link href={`/app/${ws}`} className="pr-btn pr-btn-ghost pr-btn-sm">Skip setup</Link>
        </div>
        <div className="pr-steps" aria-label={`Step ${i + 1} of ${STEPS.length}`}>{STEPS.map((s, j) => <i key={s} className={j <= i ? 'on' : ''} />)}</div>
        {children}
      </div>
    </div>
  );
}

function Next({ ws, step, label }: { ws: string; step: Step; label: string }) {
  return <form action={setupNext} className="pr-onb-next"><input type="hidden" name="ws" value={ws} /><input type="hidden" name="step" value={step} /><Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="One moment…">{label}</Submit></form>;
}

export default async function Setup({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ step?: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: brain }, { data: voice }, { data: analysis }, { data: plan }, { data: prog }] = await Promise.all([
    sb.from('brand_brains').select('*').eq('workspace_id', id).maybeSingle(),
    sb.from('voice_profiles').select('tone').eq('workspace_id', id).maybeSingle(),
    sb.from('growth_analyses').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('channel_plans').select('channels, playbook_type, accepted_at').eq('workspace_id', id).maybeSingle(),
    sb.from('setup_progress').select('step, started_at, completed_at').eq('workspace_id', id),
  ]);
  const a = analysis as Analysis | null;
  const done = new Set((prog ?? []).filter((p) => p.completed_at).map((p) => p.step));
  const want = (await searchParams).step;
  const asked = STEPS.find((s) => s === want);
  // Where to be: the requested step if it's reachable, otherwise the first one not done.
  const firstOpen = STEPS.find((s) => !done.has(s)) ?? 'live';
  // Just understood (progress may land a moment after the analysis): questions first when they're needed.
  const afterUnderstand: Step = (a as (Analysis & { needs_questions?: boolean }) | null)?.needs_questions && !ws.setup_answers && !done.has('questions') ? 'questions' : 'summary';
  const step: Step = !a || a.status !== 'ready' ? 'understand' : asked && STEPS.indexOf(asked) <= STEPS.indexOf(firstOpen) ? asked : firstOpen === 'understand' ? afterUnderstand : firstOpen;

  // ---- 0:00 – 1:30 understand: live progress
  if (step === 'understand') {
    const started = (prog ?? []).find((p) => p.step === 'understand')?.started_at;
    const failed = a?.status === 'failed' || (!ws.url && brain?.status !== 'building' && !a);
    return (
      <Frame ws={id} step="understand" xwide>
        {!failed && <KitRefresher every={2500} />}
        {failed ? (
          <>
            <h1>Tell us about {ws.product_name}</h1>
            <p className="sub">{a?.error ?? 'No site yet? Describe it in a few sentences and we’ll take it from there.'}</p>
            <DescribeForm ws={id} initial={brain?.description ?? ''} />
          </>
        ) : (
          <div className="space setup-scene">
            <AnalysingScene host={(ws.url ?? ws.product_name).replace(/^https?:\/\//, '').replace(/\/$/, '')} startedAt={started ?? new Date().toISOString()}
              kicker={`Setting up ${ws.product_name}`} title={`Getting to know ${ws.product_name}…`}
              steps={[{ at: 0, label: 'Reading your site' }, { at: 6, label: 'Finding your competitors' }, { at: 12, label: 'Checking where you already show up' }, { at: 18, label: 'Working out where your users are' }, { at: 26, label: 'Building your growth plan' }]} />
          </div>
        )}
      </Frame>
    );
  }
  if (!a) return null;

  // ---- 3 quick questions (app links and thin pages): tap an answer, add a website, maybe a recording
  if (step === 'questions') {
    const [{ data: kit }] = await Promise.all([sb.from('brand_kits').select('recording').eq('workspace_id', id).maybeSingle()]);
    const listing = (a as Analysis & { listing?: { name: string; icon: string | null; website: string | null; rating: number | null; ratings: number | null } | null }).listing;
    const q = ((a as Analysis & { questions?: Record<'who' | 'does' | 'different', string[]> | null }).questions) ?? { who: [], does: [], different: [] };
    return (
      <Frame ws={id} step="questions" wide>
        {listing && <div className="pr-listing" style={{ marginBottom: 18 }}>{listing.icon && <img src={listing.icon} alt="" width={56} height={56} />}<div><b>{listing.name}</b><small>{listing.rating ? `${listing.rating.toFixed(1)} stars from ${listing.ratings?.toLocaleString('en-US') ?? 0} ratings` : 'New listing'}</small></div></div>}
        <h1>3 quick questions</h1>
        <p className="sub">{listing ? 'App listings say less than a website. Tap the closest answer, or write your own.' : 'Your page says little, so help us get it right. Tap the closest answer, or write your own.'}</p>
        <SetupQuestions ws={id} options={q} isApp={!!listing} website={listing?.website ?? null} recording={(kit?.recording as { url: string; seconds: number } | null) ?? null} />
      </Frame>
    );
  }

  // ---- summary: what it does, who it's for … confirm or edit
  if (step === 'summary') {
    return (
      <Frame ws={id} step="summary" wide>
        <h1>{brain?.one_liner ?? ws.product_name}</h1>
        <p className="sub">Here’s what we understood. Fix anything that’s off.</p>
        <div className="pr-sumgrid">
          <div><span>What it does</span><p>{a.summary}</p></div>
          <div><span>Who it’s for</span><p>{brain?.target_customer ?? a.ideal_customer}</p></div>
          <div><span>Problem it solves</span><p>{a.problem}</p></div>
          <div><span>Type · stage · pricing</span><p>{typeLabel(a.product_type)} · {stageLabel(a.stage)} · {a.pricing_model ?? 'unknown'}</p></div>
          <div className="wide"><span>Top competitors</span><div className="pr-tags">{(brain?.competitors ?? []).map((c: string) => <span key={c} className="pr-chip">{c}</span>)}</div></div>
        </div>
        <Next ws={id} step="summary" label="Looks right" />
        <details className="pr-more" style={{ marginTop: 18 }}>
          <summary>Edit the details</summary>
          <div style={{ paddingTop: 14 }}>{brain && <BrandEditor ws={id} onboarding brand={{ ...brain, tone: voice?.tone ?? null }} />}</div>
        </details>
      </Frame>
    );
  }

  // ---- growth analysis
  if (step === 'analysis') {
    return (
      <Frame ws={id} step="analysis" wide>
        <h1>Where your users will come from</h1>
        <p className="sub">Our read of {ws.product_name}, and the fastest ways to get users.</p>
        <AnalysisView a={a} brief />
        <Next ws={id} step="analysis" label="Continue" />
      </Frame>
    );
  }

  const channels = ((plan?.channels ?? []) as Channel[]).sort((x, y) => x.rank - y.rank);

  // ---- channel plan: ranked, with reasons; accept or toggle
  if (step === 'channels') {
    return (
      <Frame ws={id} step="channels" wide>
        <h1>Your channels</h1>
        <p className="sub">Picked for a {typeLabel(plan?.playbook_type ?? a.product_type).toLowerCase()}. Switch any off; you can change this later.</p>
        <form action={acceptChannels}>
          <input type="hidden" name="ws" value={id} />
          <ol className="pr-chan">
            {channels.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" name="on" value={c.id} defaultChecked={c.enabled} />
                  <span className="sw" aria-hidden="true" />
                  <span className="t"><b>{c.name}</b>{c.role === 'lead' && <em>Lead</em>}<small>{c.reason}</small></span>
                </label>
              </li>
            ))}
          </ol>
          <div className="pr-onb-next"><Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="Saving…">Use this plan</Submit></div>
        </form>
      </Frame>
    );
  }

  // ---- connect: only the accounts the plan uses; skip allowed
  if (step === 'connect') {
    const need = [...new Set(channels.filter((c) => c.enabled && c.connect).map((c) => c.connect!))];
    return (
      <Frame ws={id} step="connect">
        <h1>Connect your accounts</h1>
        <p className="sub">{need.length ? 'Only the ones your plan uses. Skip any: we’ll give you ready-to-post copy until it’s connected.' : 'Your plan doesn’t need any accounts. Nice.'}</p>
        <ul className="pr-connect-list">
          {need.map((n) => {
            const acct = ACCOUNT[n] ?? { name: n, note: '' };
            return (
              <li key={n}>
                <span className="pr-connect-ic">{n in ICONS ? <PlatformIcon name={n as Platform} size={36} /> : null}</span>
                <div style={{ flex: 1, minWidth: 0 }}><b>{acct.name}</b><small>{acct.note}</small></div>
                {acct.href ? <Link className="pr-btn pr-btn-sm" href={`/app/${id}/${acct.href}`} target="_blank">Set up</Link>
                  : <span className="pr-chip" title="One-click connect arrives when the platform approves our app">Copy and post for now</span>}
              </li>
            );
          })}
        </ul>
        <Next ws={id} step="connect" label={need.length ? 'Continue' : 'Continue'} />
      </Frame>
    );
  }

  // ---- first wins: warm leads, first week, launch messages
  if (step === 'wins') {
    const [{ data: drafts }, { count: leads }, { data: jobs }, { data: kit }, { data: page }, { data: brand }] = await Promise.all([
      sb.from('assets').select('id, title, type, platform, content').eq('workspace_id', id).eq('status', 'pending').in('type', ['post', 'reply']).order('created_at').limit(6),
      sb.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', id).gte('score', 60),
      sb.from('jobs').select('type').eq('workspace_id', id).in('type', ['listen.poll', 'content.week', 'kit.network', 'kit.plan', 'listen.draft']).in('status', ['queued', 'running']),
      sb.from('network_kits').select('workspace_id').eq('workspace_id', id).maybeSingle(),
      sb.from('waitlist_pages').select('slug').eq('workspace_id', id).maybeSingle(),
      sb.from('brand_kits').select('logo_url').eq('workspace_id', id).maybeSingle(),
    ]);
    const busy = (jobs?.length ?? 0) > 0;
    const working = (t: string) => jobs?.some((j) => j.type === t);
    const pre = a.stage === 'pre_launch' || ws.fit === 'launching_soon';
    return (
      <Frame ws={id} step="wins" wide>
        {busy && <KitRefresher every={3000} />}
        <h1>Your first wins</h1>
        <p className="sub">Approve what you like. Nothing goes out without you.</p>
        <div className="pr-wins">
          <div className={`pr-win ${working('listen.poll') ? 'busy' : ''}`}><b>{working('listen.poll') ? <span className="spin" /> : leads ?? 0}</b><span>{working('listen.poll') ? 'Looking for people asking for what you built…' : `people asking for what you built (last 30 days)`}</span><Link className="pr-link" href={`/app/${id}/listening`} target="_blank">See them</Link></div>
          <div className={`pr-win ${working('kit.network') ? 'busy' : ''}`}><b>{kit ? '4' : <span className="spin" />}</b><span>{kit ? 'launch messages for people you know' : 'Writing messages for people you know…'}</span><Link className="pr-link" href={`/app/${id}/kit?tab=network`} target="_blank">Open</Link></div>
          {pre && <div className="pr-win"><b>{page ? '✓' : '1'}</b><span>{page ? 'waitlist page ready' : 'waitlist page to set up'}</span><Link className="pr-link" href={`/app/${id}/waitlist`} target="_blank">{page ? 'Open' : 'Set up'}</Link></div>}
        </div>
        <h3 className="pr-onb-h3">Your first posts and replies</h3>
        {drafts?.length ? (
          <ul className="post-grid">
            {drafts.map((d) => (
              <PostCard key={d.id} ws={id} id={d.id} name={ws.product_name} handle={handleOf(ws.url, ws.product_name)} logo={brand?.logo_url ?? null} platform={d.platform} type={d.type} text={String((d.content as { text?: string }).text ?? d.title)} />
            ))}
          </ul>
        ) : busy ? (
          <div className="pr-firsts" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="sk sk-block" style={{ height: 64 }} />)}</div>
        ) : <p className="pr-hint">Everything here is approved. Your inbox has the rest.</p>}
        <Next ws={id} step="wins" label="Continue" />
      </Frame>
    );
  }

  // ---- plan live: what happens this week
  const startedAt = (prog ?? []).find((p) => p.step === 'paste')?.completed_at ?? (prog ?? [])[0]?.started_at;
  const took = startedAt ? (Date.now() - Date.parse(startedAt)) / 1000 : null;
  const chans = channels.filter((c) => c.enabled).slice(0, 8);
  return (
    <Frame ws={id} step="live" wide>
      <div className="live-hero">
        <div className="live-badge" aria-hidden="true">
          <span className="live-burst">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 36}deg` }} />)}</span>
          <span className="live-check">{Icon.check}</span>
        </div>
        <h1>You’re live.</h1>
        <p className="sub">{took && took < 3600 ? `Set up in ${fmt(took)}. ` : ''}From here, {ws.product_name} grows while you build. Here’s what happens next.</p>
        {chans.length > 0 && (
          <div className="live-chans" aria-label="Your channels">
            {chans.map((c) => <span key={c.id} className="live-chan">{c.connect ? <PlatformMark platform={c.connect} size={20} /> : <i className="dot" />}{c.name}</span>)}
          </div>
        )}
      </div>
      <ol className="live-time">
        <li className="on"><span className="ic">{Icon.ear}</span><div><b>Every 20 minutes <em><i />Running now</em></b><p>We look for people asking for what you built and draft replies for you to approve.</p></div></li>
        <li><span className="ic">{Icon.pen}</span><div><b>This week</b><p>Your first posts go out as soon as you approve them.</p></div></li>
        <li><span className="ic">{Icon.plan}</span><div><b>Every Sunday</b><p>We plan next week’s posts from what you shipped and what people are asking.</p></div></li>
        <li><span className="ic">{Icon.chart}</span><div><b>Every Monday</b><p>Your weekly digest: what worked, and the next three things to do.</p></div></li>
      </ol>
      <div className="live-cta">
        <form action={setupNext}><input type="hidden" name="ws" value={id} /><input type="hidden" name="step" value="live" /><Submit className="live-go" pending="Opening…">Go to my home {Icon.arrow}</Submit></form>
        <Link className="live-alt" href={`/app/${id}/plan`}>See my 30-day plan</Link>
      </div>
    </Frame>
  );
}
