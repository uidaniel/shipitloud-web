import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase/server';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ['', '/pricing', '/terms', '/privacy', '/refund'].map((path) => ({
    url: `${site.url}${path}`,
    changeFrequency: path ? 'monthly' : 'weekly',
    priority: path ? 0.5 : 1,
  }));
  // Hosted blogs live under this domain until a founder sets up their own, so their articles belong here too.
  try {
    const db = supabaseAdmin();
    const { data: blogs } = await db.from('blogs').select('workspace_id, slug').eq('published', true);
    const slugOf = new Map((blogs ?? []).map((b) => [b.workspace_id, b.slug]));
    if (slugOf.size) {
      const { data: posts } = await db.from('blog_posts').select('workspace_id, slug, updated_at').eq('status', 'published').in('workspace_id', [...slugOf.keys()]).limit(5000);
      for (const s of new Set(slugOf.values())) pages.push({ url: `${site.url}/blog/${s}`, changeFrequency: 'weekly', priority: 0.6 });
      for (const p of posts ?? []) pages.push({ url: `${site.url}/blog/${slugOf.get(p.workspace_id)}/${p.slug}`, lastModified: p.updated_at, changeFrequency: 'monthly', priority: 0.7 });
    }
  } catch { /* the static pages are still listed */ }
  return pages;
}
