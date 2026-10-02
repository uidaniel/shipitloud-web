import { getBlog, listPosts } from '@/lib/blog';
import { site } from '@/lib/site';

export const revalidate = 300;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blog = await getBlog((await params).slug);
  if (!blog) return new Response('Not found', { status: 404 });
  const posts = await listPosts(blog.workspaceId, 30);
  const base = `${site.url}/blog/${blog.slug}`;
  const items = posts.map((p) => `<item><title>${esc(p.title)}</title><link>${base}/${p.slug}</link><guid isPermaLink="true">${base}/${p.slug}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate>${p.excerpt ? `<description>${esc(p.excerpt)}</description>` : ''}</item>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(blog.title)}</title><link>${base}</link><description>${esc(blog.description ?? blog.title)}</description>\n${items.join('\n')}\n</channel></rss>\n`, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}
