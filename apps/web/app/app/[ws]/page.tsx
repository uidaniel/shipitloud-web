import type { Metadata } from 'next';
import Link from 'next/link';
import { nextActions, type DigestSignals } from '@shipitloud/engine';
import { requireWorkspace } from '@/lib/supabase/server';
import { Icon } from '@/components/app/icons';
import { PostCard, handleOf } from '@/components/app/post-card';

export const metadata: Metadata = { title: 'Home' };

// Home: where a founder starts every day. One next step, the drafts waiting for their OK shown the way
// they'll look when posted, then the path to first users, this week's numbers and the growth plan.

interface Day { day: string; conversations: number; replies: number; posts: number; clicks: number; signups: number }
const greet = () => { const h = new Date().getUTCHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default async function Home({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, ws } = await requireWorkspace(id);
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [
    { data: progress }, { data: analysis }, { count: pending }, { data: waiting }, { count: unanswered }, { data: listen },
    { count: snippet }, { data: sources }, { count: published }, { count: blogs }, { data: page }, { data: email },
    { count: approvals }, { count: replied }, { data: daily }, { data: kit },
  ] = await Promise.all([
    sb.from('setup_progress').select('step, completed_at').eq('workspace_id', id),
    sb.from('growth_analyses').select('growth_score, positioning, opportunities, status').eq('workspace_id', id).eq('status', 'ready').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('status', 'pending'),
    sb.from('assets').select('id, title, type, platform, content, expires_at').eq('workspace_id', id).eq('status', 'pending').order('created_at').limit(3),
    sb.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', id).gte('score', 70).in('status', ['new', 'drafted']).gte('created_at', since7),
    sb.from('listen_configs').select('active').eq('workspace_id', id).maybeSingle(),
    sb.from('track_events').select('id', { count: 'exact', head: true }).eq('workspace_id', id),
    sb.from('content_sources').select('weekly_plan').eq('workspace_id', id).maybeSingle(),
    sb.from('assets').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('status', 'published'),
    sb.from('blog_posts').select('id', { count: 'exact', head: true }).eq('workspace_id', id),
    sb.from('waitlist_pages').select('slug, published_at').eq('workspace_id', id).maybeSingle(),
    sb.from('email_settings').select('sequence_on').eq('workspace_id', id).maybeSingle(),
    sb.from('approvals').select('id', { count: 'exact', head: true }).eq('workspace_id', id).in('status', ['approved', 'edited']),
    sb.from('mentions').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('status', 'replied'),
    sb.rpc('momentum_daily', { p_ws: id, p_days: 7 }),
    sb.from('brand_kits').select('logo_url').eq('workspace_id', id).maybeSingle(),
  ]);

  const setupDone = (progress ?? []).some((p) => p.step === 'live' && p.completed_at);
  const prelaunch = ws.fit === 'launching_soon';
  const days = (daily ?? []) as Day[];
  const week = (k: keyof Omit<Day, 'day'>) => days.reduce((n, d) => n + d[k], 0);
  const signups = week('signups');

  // The one thing to do now: finish setup first, then the same rules as the weekly digest.
  const signals: DigestSignals = {
    pending: pending ?? 0, unanswered: unanswered ?? 0, listening: !!listen?.active, snippet: (snippet ?? 0) > 0, weekly_plan: !!sources?.weekly_plan,
    published_total: published ?? 0, blog_posts: blogs ?? 0, waitlist: !!page?.published_at, sequence_on: !!email?.sequence_on,
  };
  const base = `/app/${id}`;
  const actions = nextActions({ totals: { conversations: week('conversations'), replies: week('replies'), posts: week('posts'), clicks: week('clicks'), signups }, previous: null, best_channel: null, top_link: null, high_intent: unanswered ?? 0 }, signals, base);
  const next = !setupDone
    ? { title: 'Finish setting up', why: 'A few minutes and your growth plan, first posts and warm leads are ready.', href: `/app/setup/${id}` }
    : actions[0] ?? { title: 'You’re all caught up', why: 'Nothing needs you right now. We’ll keep listening and drafting; check back tomorrow.', href: `${base}/analytics` };

  // The path from "just set up" to "first users". Each step is one click away.
  const path = [
    { done: setupDone, title: 'Get your growth plan', href: `/app/setup/${id}` },
    { done: (approvals ?? 0) > 0, title: 'Approve your first posts', href: `${base}/inbox` },
    { done: (replied ?? 0) > 0, title: 'Reply to someone who needs you', href: `${base}/listening` },
    prelaunch
      ? { done: !!page?.published_at, title: 'Publish your waitlist page', href: `${base}/waitlist` }
      : { done: signals.snippet, title: 'Add tracking to your site', href: `${base}/analytics#snippet` },
    { done: signups > 0 || (published ?? 0) > 2, title: 'Get your first signups', href: `${base}/kit?tab=network` },
    { done: signals.weekly_plan, title: 'Put it on autopilot', href: `${base}/content` },
  ];
  const doneCount = path.filter((p) => p.done).length;
  const current = path.findIndex((p) => !p.done);
  const opp = (analysis?.opportunities as { title: string; why: string }[] | undefined)?.[0];
  const handle = handleOf(ws.url, ws.product_name);

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const stats = [
    { n: week('conversations'), l: 'people found', i: Icon.ear },
    { n: week('posts') + week('replies'), l: 'posts out', i: Icon.megaphone },
    { n: week('clicks'), l: 'clicks', i: Icon.arrow },
    { n: signups, l: 'signups', i: Icon.heart },
  ];

  return (
    <div className="pr-body dash">
      <header className="dash-head">
        <div>
          <p className="dash-date">{today}</p>
          <h1>{greet()}, {ws.product_name}</h1>
        </div>
      </header>

      <div className="dash-bento">
        <Link href={next.href} className="dash-hero">
          <svg className="dash-spark" viewBox="0 0 200 200" aria-hidden="true"><path d="M100 0C104 70 130 96 200 100 130 104 104 130 100 200 96 130 70 104 0 100 70 96 96 70 100 0Z" /></svg>
          <svg className="dash-spark s2" viewBox="0 0 200 200" aria-hidden="true"><path d="M100 0C104 70 130 96 200 100 130 104 104 130 100 200 96 130 70 104 0 100 70 96 96 70 100 0Z" /></svg>
          <span className="dash-k">Your next step</span>
          <h2>{next.title.replace(/\s*\(.*\)$/, '')}</h2>
          <span className="dash-go">Start <i>{Icon.arrow}</i></span>
          <span className="dash-track" aria-label={`${doneCount} of ${path.length} steps to first users done`}>
            {path.map((p, i) => <i key={p.title} className={p.done ? 'done' : i === current ? 'now' : ''} />)}
          </span>
        </Link>

        <Link href={`${base}/inbox`} className="dash-tile t-mesh">
          <span className="dash-tile-h">Waiting for your OK<i>{Icon.external}</i></span>
          <b>{pending ?? 0}</b>
          <small>{pending ? 'drafts ready to go' : 'all caught up'}</small>
        </Link>

        <Link href={analysis ? `${base}/growth` : `/app/setup/${id}`} className="dash-tile t-lime">
          <span className="dash-tile-h">Growth score<i>{Icon.external}</i></span>
          <b>{analysis?.growth_score ?? '–'}<em>/100</em></b>
          <small>{opp?.title ?? 'Ready after setup'}</small>
        </Link>
      </div>

      <div className="dash-strip" aria-label="This week">
        <span className="dash-strip-k">This week</span>
        {stats.map((x) => <span key={x.l} className="dash-stat"><i>{x.i}</i><b>{x.n}</b>{x.l}</span>)}
      </div>

      <div className="dash-cols">
        <section>
          <div className="dash-sec-h">
            <h2>Ready for your OK</h2>
            {(pending ?? 0) > 0 && <Link href={`${base}/inbox`} className="dash-more">See all</Link>}
          </div>
          {waiting?.length ? (
            <ul className="post-grid">
              {waiting.slice(0, 2).map((w) => (
                <PostCard key={w.id} ws={id} id={w.id} name={ws.product_name} handle={handle} logo={kit?.logo_url ?? null} platform={w.platform} type={w.type} text={String((w.content as { text?: string }).text ?? w.title)} />
              ))}
            </ul>
          ) : (
            <div className="dash-card dash-empty">
              <span>{Icon.check}</span>
              <b>Nothing waiting</b>
              <p>New drafts show up here for your OK.</p>
            </div>
          )}
        </section>

        <section className="dash-card dash-path">
          <div className="dash-sec-h"><h2>Path to first users</h2><span className="dash-faint">{doneCount}/{path.length}</span></div>
          <div className="dash-bar"><i style={{ width: `${(doneCount / path.length) * 100}%` }} /></div>
          <ol>
            {path.map((p, i) => (
              <li key={p.title} className={p.done ? 'done' : i === current ? 'now' : ''}>
                <Link href={p.href}><span className="dot">{p.done ? Icon.check : i + 1}</span>{p.title}</Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
