import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlog, getPost, listPosts } from '@/lib/blog';
import { readingMinutes, renderMarkdown } from '@/lib/markdown';
import { site } from '@/lib/site';
import { BlogShell } from '../shell';
import { ViewBeacon } from './view';

export const revalidate = 300;

type P = { params: Promise<{ slug: string; post: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug, post: ps } = await params;
  const blog = await getBlog(slug);
  const post = blog && (await getPost(blog.workspaceId, ps));
  if (!blog || !post) return {};
  const title = post.meta.title || post.title;
  const description = post.meta.description || post.excerpt || undefined;
  return {
    title: { absolute: title }, description,
    alternates: { canonical: `/blog/${blog.slug}/${post.slug}` },
    openGraph: { title, description, type: 'article', publishedTime: post.published_at, modifiedTime: post.updated_at },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export default async function Article({ params }: P) {
  const { slug, post: ps } = await params;
  const blog = await getBlog(slug);
  if (!blog) notFound();
  const post = await getPost(blog.workspaceId, ps);
  if (!post) notFound();
  const { html, headings } = renderMarkdown(post.body);
  const related = (await listPosts(blog.workspaceId, 8)).filter((p) => p.id !== post.id).slice(0, 3);
  const comparison = post.kind === 'best' || post.kind === 'alternative' || post.kind === 'versus';
  const cta = blog.productUrl ? `${blog.productUrl}${blog.productUrl.includes('?') ? '&' : '?'}utm_source=blog&utm_medium=article&utm_campaign=${post.slug}` : null;
  const url = `${site.url}/blog/${blog.slug}/${post.slug}`;
  const updated = Date.parse(post.updated_at) - Date.parse(post.published_at) > 86_400_000;

  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: post.title, description: post.meta.description ?? post.excerpt, datePublished: post.published_at, dateModified: post.updated_at, mainEntityOfPage: url, publisher: { '@type': 'Organization', name: blog.product, ...(blog.logo ? { logo: { '@type': 'ImageObject', url: blog.logo } } : {}) } },
    ...(post.faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: post.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: blog.title, item: `${site.url}/blog/${blog.slug}` }, { '@type': 'ListItem', position: 2, name: post.title, item: url }] },
  ];

  return (
    <BlogShell blog={blog}>
      <ViewBeacon postId={post.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <article className="bl-article">
        <nav className="bl-crumbs" aria-label="Breadcrumb"><Link href={`/blog/${blog.slug}`}>{blog.title}</Link></nav>
        <h1>{post.title}</h1>
        <p className="bl-meta">{date(post.published_at)}{updated ? ` · Updated ${date(post.updated_at)}` : ''} · {readingMinutes(post.body)} min read</p>
        {comparison && <p className="bl-disclosure">We make {blog.product}, one of the options discussed here. We&apos;ve tried to be fair to the others.</p>}
        <div className="bl-layout">
          {headings.filter((h) => h.level === 2).length >= 3 && (
            <aside className="bl-toc" aria-label="On this page">
              <b>On this page</b>
              <ol>{headings.filter((h) => h.level === 2).map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
            </aside>
          )}
          <div className="bl-body">
            <div className="bl-prose" dangerouslySetInnerHTML={{ __html: html }} />
            {post.faq.length > 0 && (
              <section className="bl-faq" aria-labelledby="faq">
                <h2 id="faq">Questions people ask</h2>
                {post.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
              </section>
            )}
            {cta && (
              <section className="bl-ctabox">
                <div><b>{blog.product}</b>{blog.oneLiner && <p>{blog.oneLiner}</p>}</div>
                <a className="bl-cta" href={cta} rel="noopener">Try {blog.product}</a>
              </section>
            )}
            {related.length > 0 && (
              <section className="bl-related" aria-labelledby="related">
                <h2 id="related">Keep reading</h2>
                <ul>{related.map((r) => <li key={r.id}><Link href={`/blog/${blog.slug}/${r.slug}`}>{r.title}</Link></li>)}</ul>
              </section>
            )}
          </div>
        </div>
      </article>
    </BlogShell>
  );
}
