import type { Metadata } from 'next';
import { Tiles } from '@/components/app/bento';
import Link from 'next/link';
import { headers } from 'next/headers';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { findKeywordIdeas, skipKeyword, writeArticleFor } from '../../actions';
import { KitRefresher } from '../kit/refresher';
import { AddKeyword, BlogSettings } from './forms';

export const metadata: Metadata = { title: 'Blog' };

const KIND: Record<string, string> = { best: 'Best of', alternative: 'Alternative', versus: 'Versus', howto: 'How-to', usecase: 'Use case', question: 'Question' };
const STATUS: Record<string, { label: string; cls: string }> = { draft: { label: 'Needs you', cls: 'pr-chip-warn' }, published: { label: 'Live', cls: 'pr-chip-ok' }, unpublished: { label: 'Taken down', cls: '' } };

export default async function Blog({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ settings?: string }> }) {
  const { ws: id } = await params;
  const { settings } = await searchParams;
  const { sb, ws } = await requireWorkspace(id);
  const [{ data: blog }, { data: keywords }, { data: posts }, { data: jobs }, { data: brain }, { data: cap }] = await Promise.all([
    sb.from('blogs').select('slug, title, description').eq('workspace_id', id).maybeSingle(),
    sb.from('seo_keywords').select('id, keyword, kind, source, why, priority, status').eq('workspace_id', id).in('status', ['idea', 'writing']).order('priority', { ascending: false }).limit(40),
    sb.from('blog_posts').select('id, title, slug, status, seo_score, views, published_at, created_at').eq('workspace_id', id).order('created_at', { ascending: false }).limit(50),
    sb.from('jobs').select('type').eq('workspace_id', id).in('type', ['blog.keywords', 'blog.write']).in('status', ['queued', 'running']),
    sb.from('brand_brains').select('status').eq('workspace_id', id).maybeSingle(),
    sb.from('plan_limits').select('monthly_cap').eq('plan', ws.plan).eq('metric', 'ai_drafts').maybeSingle(),
  ]);
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const origin = host ? `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}` : '';
  const finding = jobs?.some((j) => j.type === 'blog.keywords') ?? false;
  const writing = keywords?.some((k) => k.status === 'writing') ?? false;
  const allowed = (cap?.monthly_cap ?? 0) > 0 && brain?.status === 'ready';
  const blogUrl = blog ? `${origin}/blog/${blog.slug}` : null;

  return (
    <div className="pr-body" style={{ display: 'grid', gap: 22 }}>
      {(finding || writing) && <KitRefresher />}
      <div className="pr-content-head">
        <div>
          <h1 className="pr-h1">Blog</h1>
          <p className="pr-lead">Articles for what your customers search, in your voice.</p>
        </div>
        {allowed ? (
          <form action={findKeywordIdeas}><input type="hidden" name="ws" value={id} /><Submit className="pr-btn pr-btn-primary" pending="Starting…" disabled={finding}>{finding ? 'Finding ideas…' : keywords?.length ? 'Find more ideas' : 'Find what to write about'}</Submit></form>
        ) : brain?.status !== 'ready' ? <Link className="pr-btn pr-btn-primary" href={`/app/setup/${id}`}>Set up your brand first</Link> : <Link className="pr-btn pr-btn-primary" href="/pricing">See plans</Link>}
      </div>

      <Tiles items={[
        { label: 'Ideas to write', value: keywords?.length ?? 0, tone: 'violet', sub: 'searches your customers make' },
        { label: 'Published', value: (posts ?? []).filter((x) => x.status === 'published').length, tone: 'lime', sub: `${(posts ?? []).length} articles in total` },
        { label: 'Views', value: (posts ?? []).reduce((n, x) => n + (x.views ?? 0), 0), tone: 'mesh', sub: 'all time' },
      ]} />

      {blog && blogUrl && (
        <div className="pr-blogbar">
          <span className="pr-live on" aria-hidden="true" />
          <a href={blogUrl} target="_blank" rel="noopener noreferrer" className="pr-link">{blogUrl.replace(/^https?:\/\//, '')}</a>
          <Link href={settings ? `/app/${id}/blog` : `/app/${id}/blog?settings=1`} className="pr-btn pr-btn-ghost pr-btn-sm" style={{ marginLeft: 'auto' }}>{Icon.settings} Settings</Link>
        </div>
      )}
      {settings && blog && <BlogSettings ws={id} slug={blog.slug} title={blog.title} description={blog.description ?? ''} origin={origin} />}

      <section className="pr-section">
        <div className="pr-section-h"><h2>What to write about</h2><p>Ranked by how likely the searcher is to buy.</p></div>
        <div className="pr-section-b" style={{ display: 'grid', gap: 12 }}>
          <AddKeyword ws={id} />
          {finding && !keywords?.length ? (
            <div className="pr-list" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="pr-item"><div className="sk" style={{ width: 34, height: 22 }} /><div style={{ display: 'grid', gap: 8 }}><div className="sk sk-title" /><div className="sk sk-line" style={{ width: '55%' }} /></div><div /></div>)}</div>
          ) : keywords?.length ? (
            <div className="pr-list" style={{ margin: 0 }}>
              {keywords.map((k) => (
                <div key={k.id} className="pr-item pr-fade-in" style={{ alignItems: 'center' }}>
                  <span className={`pr-prio ${k.priority >= 75 ? 'hi' : k.priority >= 50 ? 'mid' : ''}`} title="Buyer intent">{k.priority}</span>
                  <div className="pr-item-main">
                    <span className="pr-item-title">{k.keyword}</span>
                    <div className="pr-item-meta"><span className="pr-chip">{KIND[k.kind] ?? k.kind}</span>{k.source === 'listening' && <span className="pr-chip pr-chip-violet">People asked this</span>}{k.why && <span>{k.why}</span>}</div>
                  </div>
                  <div className="pr-item-act">
                    {k.status === 'writing' ? (
                      <button className="pr-btn pr-btn-sm" disabled aria-busy="true"><span className="spin" /> Writing… about a minute</button>
                    ) : allowed ? (
                      <>
                        <form action={writeArticleFor}><input type="hidden" name="ws" value={id} /><input type="hidden" name="keyword" value={k.id} /><Submit className="pr-btn pr-btn-sm" pending="Starting…">{Icon.edit} Write article</Submit></form>
                        <form action={skipKeyword}><input type="hidden" name="ws" value={id} /><input type="hidden" name="keyword" value={k.id} /><Submit className="pr-btn pr-btn-ghost pr-btn-sm" pending="…" title="Not for us">{Icon.x}</Submit></form>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="pr-hint" style={{ margin: 0 }}>No ideas yet. Find some, or add a search you know your customers make.</p>}
        </div>
      </section>

      <section className="pr-section">
        <div className="pr-section-h"><h2>Articles</h2><p>{posts?.length ? `${posts.filter((p) => p.status === 'published').length} live · ${posts.reduce((n, p) => n + (p.views ?? 0), 0).toLocaleString('en-US')} views` : 'Your articles show up here.'}</p></div>
        {posts?.length ? (
          <div className="pr-list" style={{ margin: 0, border: 0, borderRadius: 0 }}>
            {posts.map((p) => {
              const s = STATUS[p.status] ?? { label: p.status, cls: '' };
              return (
                <div key={p.id} className="pr-item" style={{ alignItems: 'center' }}>
                  <span className={`pr-prio ${(p.seo_score ?? 0) >= 85 ? 'hi' : (p.seo_score ?? 0) >= 70 ? 'mid' : ''}`} title="SEO score">{p.seo_score ?? '–'}</span>
                  <div className="pr-item-main">
                    <Link href={`/app/${id}/blog/${p.id}`} className="pr-item-title" style={{ textDecoration: 'none', color: 'inherit' }}>{p.title}</Link>
                    <div className="pr-item-meta">
                      <span>{p.published_at ? `Live since ${new Date(p.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : `Drafted ${new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</span>
                      {p.status === 'published' && <span>{(p.views ?? 0).toLocaleString('en-US')} views</span>}
                    </div>
                  </div>
                  <div className="pr-item-act">
                    <span className={`pr-chip ${s.cls}`}>{s.label}</span>
                    <Link className="pr-btn pr-btn-sm" href={`/app/${id}/blog/${p.id}`}>{p.status === 'draft' ? 'Read and approve' : 'Edit'}</Link>
                    {p.status === 'published' && blog && <a className="pr-btn pr-btn-ghost pr-btn-sm" href={`/blog/${blog.slug}/${p.slug}`} target="_blank" rel="noopener noreferrer">{Icon.external}</a>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="pr-section-b"><p className="pr-hint" style={{ margin: 0 }}>Pick an idea above and press “Write article”. It takes about a minute.</p></div>}
      </section>
    </div>
  );
}
