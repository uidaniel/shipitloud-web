import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/supabase/server';
import { competitorStatements } from '@shipitloud/engine';
import { renderMarkdown } from '@/lib/markdown';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { decide, setArticleLive } from '../../../actions';
import { ArticleEditor } from '../forms';
import '../../../../blog/blog.css';

export const metadata: Metadata = { title: 'Article' };

export default async function ArticlePage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { ws: wsId, id } = await params;
  const { view = 'read' } = await searchParams;
  const { sb, ws } = await requireWorkspace(wsId);
  const { data: post } = await sb.from('blog_posts').select('id, title, slug, keyword, body, meta, faq, seo_score, seo_tips, status, asset_id, published_at, views').eq('id', id).eq('workspace_id', wsId).maybeSingle();
  if (!post) notFound();
  const [{ data: blog }, { data: asset }] = await Promise.all([
    sb.from('blogs').select('slug').eq('workspace_id', wsId).maybeSingle(),
    post.asset_id ? sb.from('assets').select('id, status, flags').eq('id', post.asset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const verify = [...post.body.matchAll(/\[verify:?\s*([^\]]{3,200})\]/gi)].map((m) => m[1]!.trim());
  const { data: brain } = await sb.from('brand_brains').select('competitors').eq('workspace_id', wsId).maybeSingle();
  const claims = competitorStatements([post.body, ...(post.faq as { a: string }[]).map((f) => f.a)].join('\n'), brain?.competitors ?? []);
  const pending = asset?.status === 'pending';
  const publishing = asset && ['approved', 'auto_approved'].includes(asset.status) && post.status === 'draft';
  const { html } = view === 'read' ? renderMarkdown(post.body) : { html: '' };
  const meta = post.meta as { title?: string; description?: string };
  const faq = post.faq as { q: string; a: string }[];

  return (
    <div className="pr-body pr-article-page">
      {publishing && <meta httpEquiv="refresh" content="4" />}
      <div className="pr-content-head">
        <div style={{ minWidth: 0 }}>
          <Link href={`/app/${wsId}/blog`} className="pr-auth-link">← Blog</Link>
          <h1 className="pr-h1" style={{ marginTop: 6 }}>{post.title}</h1>
          <p className="pr-lead">For the search “{post.keyword}”{post.status === 'published' ? ` · ${post.views.toLocaleString('en-US')} views` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {pending && asset && (
            <>
              <form action={decide}><input type="hidden" name="ws" value={wsId} /><input type="hidden" name="asset" value={asset.id} /><input type="hidden" name="decision" value="reject" /><Submit className="pr-btn pr-btn-ghost" pending="…">Reject</Submit></form>
              <form action={decide}><input type="hidden" name="ws" value={wsId} /><input type="hidden" name="asset" value={asset.id} /><input type="hidden" name="decision" value="approve" /><Submit className="pr-btn pr-btn-primary" pending="Publishing…" disabled={ws.kill_switch}>{Icon.check} Approve and publish</Submit></form>
            </>
          )}
          {publishing && <span className="pr-chip pr-chip-violet"><span className="spin" style={{ width: 10, height: 10 }} /> Publishing…</span>}
          {post.status === 'published' && blog && (
            <>
              <a className="pr-btn" href={`/blog/${blog.slug}/${post.slug}`} target="_blank" rel="noopener noreferrer">{Icon.external} View live</a>
              <form action={setArticleLive}><input type="hidden" name="ws" value={wsId} /><input type="hidden" name="post" value={post.id} /><input type="hidden" name="live" value="false" /><Submit className="pr-btn pr-btn-ghost" pending="…">Take down</Submit></form>
            </>
          )}
          {post.status === 'unpublished' && (
            <form action={setArticleLive}><input type="hidden" name="ws" value={wsId} /><input type="hidden" name="post" value={post.id} /><input type="hidden" name="live" value="true" /><Submit className="pr-btn pr-btn-primary" pending="…" disabled={ws.kill_switch}>Put it back up</Submit></form>
          )}
        </div>
      </div>

      <div className="pr-article-grid">
        <div style={{ minWidth: 0, display: 'grid', gap: 14 }}>
          <nav className="pr-tabs" aria-label="Article">
            <Link href={`/app/${wsId}/blog/${id}`} aria-current={view === 'read' ? 'page' : undefined}>Read</Link>
            <Link href={`/app/${wsId}/blog/${id}?view=edit`} aria-current={view === 'edit' ? 'page' : undefined}>Edit</Link>
          </nav>
          {view === 'edit' ? <ArticleEditor ws={wsId} post={{ id: post.id, title: post.title, body: post.body, meta }} /> : (
            <div className="pr-section"><div className="pr-section-b"><div className="bl-prose pr-preview" dangerouslySetInnerHTML={{ __html: html }} /></div></div>
          )}
        </div>
        <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="pr-section">
            <div className="pr-section-h" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="pr-score-big" style={{ color: (post.seo_score ?? 0) >= 85 ? 'var(--ok)' : (post.seo_score ?? 0) >= 70 ? 'var(--warn)' : 'var(--err)' }}>{post.seo_score ?? '–'}</span>
              <div><h2>SEO score</h2><p>{post.seo_tips.length ? `${post.seo_tips.length} thing${post.seo_tips.length === 1 ? '' : 's'} to improve` : 'Ready for search'}</p></div>
            </div>
            {post.seo_tips.length > 0 && <ul className="pr-tips">{post.seo_tips.map((t: string) => <li key={t}>{t}</li>)}</ul>}
          </div>
          {verify.length > 0 && (
            <div className="pr-section" style={{ borderColor: 'rgba(251,191,36,.35)' }}>
              <div className="pr-section-h"><h2>Check these facts</h2><p>We weren&apos;t sure. Confirm or remove each [verify] mark in Edit.</p></div>
              <ul className="pr-tips">{verify.map((v) => <li key={v}>{v}</li>)}</ul>
            </div>
          )}
          {claims.length > 0 && (
            <div className="pr-section" style={{ borderColor: 'rgba(251,191,36,.35)' }}>
              <div className="pr-section-h"><h2>About other products</h2><p>Make sure each of these is true today, or reword it to be about fit, not facts. Wrong claims about competitors can get you in trouble.</p></div>
              <ul className="pr-tips">{claims.map((c, i) => <li key={i}><b>{c.competitor}:</b> {c.sentence}</li>)}</ul>
            </div>
          )}
          {!!asset?.flags?.filter((f: string) => !/fact.* to check|about other products/.test(f)).length && (
            <div className="pr-section"><div className="pr-section-h"><h2>Claims to check</h2></div><ul className="pr-tips">{asset.flags.filter((f: string) => !/fact.* to check|about other products/.test(f)).map((f: string) => <li key={f}>{f}</li>)}</ul></div>
          )}
          <div className="pr-section">
            <div className="pr-section-h"><h2>In search results</h2></div>
            <div className="pr-section-b pr-serp">
              <span>{blog ? `…/blog/${blog.slug}/${post.slug}` : post.slug}</span>
              <b>{meta.title || post.title}</b>
              <p>{meta.description}</p>
            </div>
          </div>
          {faq.length > 0 && (
            <div className="pr-section">
              <div className="pr-section-h"><h2>FAQs</h2><p>Shown at the end and marked up for Google.</p></div>
              <ul className="pr-tips">{faq.map((f) => <li key={f.q}><b>{f.q}</b><br />{f.a}</li>)}</ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
