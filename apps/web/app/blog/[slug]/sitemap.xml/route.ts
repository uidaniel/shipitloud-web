import { getBlog, listPosts } from '@/lib/blog';
import { site } from '@/lib/site';

export const revalidate = 300;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blog = await getBlog((await params).slug);
  if (!blog) return new Response('Not found', { status: 404 });
  const posts = await listPosts(blog.workspaceId, 1000);
  const urls = [
    `<url><loc>${esc(`${site.url}/blog/${blog.slug}`)}</loc>${posts[0] ? `<lastmod>${posts[0].updated_at}</lastmod>` : ''}</url>`,
    ...posts.map((p) => `<url><loc>${esc(`${site.url}/blog/${blog.slug}/${p.slug}`)}</loc><lastmod>${p.updated_at}</lastmod></url>`),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
