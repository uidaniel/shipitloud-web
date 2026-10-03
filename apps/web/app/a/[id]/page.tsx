import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SiteNav } from '@/components/space/site-nav';
import { Refresh } from './refresh';
import { AnalysingScene } from '@/components/space/analysing-scene';
import '../../space.css';

export const metadata: Metadata = { title: 'Your free growth analysis', robots: { index: false } };
export const dynamic = 'force-dynamic';

interface Results {
  name: string; summary: string; positioning: string; product_type: string; stage: string;
  brand?: { logo: string | null; accent: string; onAccent: string; palette: string[]; font: string | null; ogImage: string | null; host: string };
  page_fixes: { area: string; fix: string; why: string }[]; channels: { name: string; reason: string; role: string }[];
  score?: number; opportunities?: { title: string; why: string }[]; sample_post?: string | null;
  conversations?: { count: number; examples: { title: string; url: string; phrase: string }[] }; phrases?: string[]; seconds: number;
}
const AREA: Record<string, string> = { clarity: 'Clarity', cta: 'Call to action', trust: 'Trust' };
const TYPE: Record<string, string> = { b2b_saas: 'B2B SaaS', consumer_app: 'Consumer app', dev_tool: 'Developer tool', marketplace: 'Marketplace', ecommerce: 'E-commerce', other: 'Product' };
const safeColor = (c: string | undefined, fallback: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback);
const safeFont = (f: string | null | undefined) => (f && /^[\w \-]{2,40}$/.test(f) ? f : null);

export default async function FreeAnalysis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: f } = await supabaseAdmin().from('free_analyses').select('url, status, error, results, created_at').eq('id', id).maybeSingle();
  if (!f) notFound();
  const r = f.results as Results;
  const host = f.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const start = `/signup?next=${encodeURIComponent(`/app/new?url=${encodeURIComponent(f.url)}`)}`;
  const accent = safeColor(r.brand?.accent, '#c6ff3d');
  const onAccent = safeColor(r.brand?.onAccent, '#0d0d12');
  const font = safeFont(r.brand?.font);
  const style = { ['--b' as string]: accent, ['--on-b' as string]: onAccent, ...(font ? { ['--bf' as string]: `'${font}', var(--font-sans, system-ui), sans-serif` } : {}) };
  const score = r.score ?? null;
  const ring = 2 * Math.PI * 52;

  return (
    <div className="space">
      {font && f.status === 'ready' && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@500;700&display=swap`} />}
      <div className="space-bg" aria-hidden="true" />
      <SiteNav onHome={false} />
      <main className={`sp-wrap fa-wrap ${f.status === 'running' ? 'fa-wide' : ''}`} style={style}>
        {f.status === 'running' && (
          <>
            <Refresh />
            <AnalysingScene host={host} startedAt={f.created_at} />
          </>
        )}
        {f.status === 'failed' && (
          <>
            <p className="fa-k">Free growth analysis · {host}</p>
            <h1 className="fa-h">We couldn’t read that site</h1>
            <p className="fa-note">{f.error ?? 'It may be down or blocking visitors.'} Start free and describe your product instead: it takes a minute.</p>
            <Link className="btn btn-lime" href={start}>Start free</Link>
          </>
        )}
        {f.status === 'ready' && (
          <>
            <section className="fa-hero">
              <div className="fa-hero-top">
                {r.brand?.logo ? <img className="fa-logo" src={r.brand.logo} alt="" width={64} height={64} /> : <span className="fa-logo fa-logo-txt">{r.name.slice(0, 1)}</span>}
                <div>
                  <p className="fa-k" style={{ margin: 0 }}>Growth analysis · {r.brand?.host ?? host}</p>
                  <h1 className="fa-h fa-brand-font">{r.name}</h1>
                </div>
              </div>
              <p className="fa-sum">{r.summary}</p>
              <div className="fa-meta">
                <span>{TYPE[r.product_type] ?? 'Product'}</span>
                {r.brand?.palette?.length ? <span className="fa-swatches" aria-label="Your brand colors">{r.brand.palette.slice(0, 4).map((c) => <i key={c} style={{ background: safeColor(c, '#333') }} />)}</span> : null}
              </div>
            </section>

            <div className="fa-grid">
              {score != null && (
                <section className="fa-card fa-score">
                  <svg viewBox="0 0 120 120" aria-label={`Growth score ${score} out of 100`} role="img">
                    <circle cx="60" cy="60" r="52" className="t" />
                    <circle cx="60" cy="60" r="52" className="f" strokeDasharray={ring} strokeDashoffset={ring * (1 - score / 100)} transform="rotate(-90 60 60)" />
                    <text x="60" y="68" textAnchor="middle">{score}</text>
                  </svg>
                  <div>
                    <span className="fa-label">Growth score</span>
                    <p>{score >= 70 ? 'A strong start. A few fixes and the right channels will do a lot.' : score >= 45 ? 'Good bones. The fixes below are quick and move the number fast.' : 'Plenty of room to grow, and the first fixes are the easiest.'}</p>
                  </div>
                </section>
              )}
              {r.conversations && r.conversations.count > 0 && (
                <section className="fa-card fa-talk">
                  <span className="fa-label">People are already talking about this</span>
                  <p className="fa-big"><b>{r.conversations.count}</b> conversations on Hacker News in the last 30 days mention {r.phrases?.slice(0, 2).map((x) => `“${x}”`).join(' or ')}.</p>
                  <ul>{r.conversations.examples.map((e) => <li key={e.url}><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a></li>)}</ul>
                  <small>With Grow, we find these every 20 minutes and draft helpful replies for you.</small>
                </section>
              )}
            </div>

            {r.sample_post && (
              <section className="fa-card">
                <span className="fa-label">A post we’d write for you today</span>
                <div className="fa-post">
                  <div className="fa-post-h">
                    {r.brand?.logo ? <img src={r.brand.logo} alt="" width={40} height={40} /> : <span className="fa-logo-txt sm">{r.name.slice(0, 1)}</span>}
                    <div><b>{r.name}</b><small>@{(r.brand?.host ?? host).split('.')[0]}</small></div>
                  </div>
                  <p>{r.sample_post}</p>
                  {r.brand?.ogImage && <img className="fa-post-img" src={r.brand.ogImage} alt={`${r.name} preview`} loading="lazy" />}
                </div>
              </section>
            )}

            <section className="fa-card fa-accent">
              <span className="fa-label">Your positioning, in one line</span>
              <p className="fa-pos">{r.positioning}</p>
            </section>

            {r.opportunities?.length ? (
              <section className="fa-card">
                <span className="fa-label">Your 3 biggest opportunities</span>
                <ol className="fa-opps">{r.opportunities.map((o, i) => <li key={o.title}><span>{i + 1}</span><div><b>{o.title}</b><p>{o.why}</p></div></li>)}</ol>
              </section>
            ) : null}

            <div className="fa-grid">
              <section className="fa-card">
                <span className="fa-label">Fix these on your page first</span>
                <ol className="fa-fixes">{r.page_fixes.map((x) => <li key={x.area}><b>{AREA[x.area] ?? x.area}</b><p>{x.fix}</p><small>{x.why}</small></li>)}</ol>
              </section>
              <section className="fa-card">
                <span className="fa-label">Where your users are</span>
                <ul className="fa-chans">{r.channels.map((c) => <li key={c.name}><b>{c.name}</b><small>{c.reason}</small></li>)}</ul>
              </section>
            </div>

            <section className="fa-cta">
              <div>
                <h2>Turn this into users</h2>
                <p>{r.conversations?.count ? `Reply to the ${r.conversations.count} people talking about this, ` : 'Find the people asking for what you built, '}get a first week of posts in {r.name}’s voice, and a 30-day plan. Ready in 10 minutes.</p>
              </div>
              <Link className="btn btn-lime" href={start}>Start Grow free for 7 days</Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
