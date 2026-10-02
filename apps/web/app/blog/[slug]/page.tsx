import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlog, listPosts } from '@/lib/blog';
import { readingMinutes } from '@/lib/markdown';
import { BlogShell } from './shell';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const blog = await getBlog((await params).slug);
  if (!blog) return {};
  return {
    title: { absolute: blog.title }, description: blog.description ?? undefined,
    alternates: { canonical: `/blog/${blog.slug}`, types: { 'application/rss+xml': `/blog/${blog.slug}/rss.xml` } },
    openGraph: { title: blog.title, description: blog.description ?? undefined, type: 'website' },
  };
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export default async function BlogIndex({ params }: { params: Promise<{ slug: string }> }) {
  const blog = await getBlog((await params).slug);
  if (!blog) notFound();
  const posts = await listPosts(blog.workspaceId);
  return (
    <BlogShell blog={blog}>
      <section className="bl-hero">
        <h1>{blog.title}</h1>
        {blog.description && <p>{blog.description}</p>}
      </section>
      {posts.length ? (
        <ol className="bl-list">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/${blog.slug}/${p.slug}`}>
                <h2>{p.title}</h2>
                {p.excerpt && <p>{p.excerpt}</p>}
                <span>{date(p.published_at)} · {readingMinutes(p.body)} min read</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : <p className="bl-empty">The first article is on its way.</p>}
    </BlogShell>
  );
}
