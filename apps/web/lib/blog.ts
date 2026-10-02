import 'server-only';
import { cache } from 'react';
import { themeFromPalette, type Theme } from '@shipitloud/templates/color';
import { isSlug } from '@/lib/pages';
import { supabaseAdmin } from '@/lib/supabase/server';

// Hosted blogs are public: read with the service role, and only ever published posts.

export interface PublicBlog { workspaceId: string; slug: string; title: string; description: string | null; product: string; productUrl: string | null; oneLiner: string | null; logo: string | null; theme: Theme }
export interface PostCard { id: string; slug: string; title: string; excerpt: string | null; published_at: string; updated_at: string; body: string }
export interface PublicPost extends PostCard { keyword: string; meta: { title?: string; description?: string }; faq: { q: string; a: string }[]; kind: string | null }

const postSlug = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(s);

export const getBlog = cache(async (slug: string): Promise<PublicBlog | null> => {
  if (!isSlug(slug)) return null;
  const db = supabaseAdmin();
  const { data: blog } = await db.from('blogs').select('workspace_id, slug, title, description, published').eq('slug', slug).maybeSingle();
  if (!blog?.published) return null;
  const [{ data: ws }, { data: kit }, { data: brain }] = await Promise.all([
    db.from('workspaces').select('product_name, url').eq('id', blog.workspace_id).single(),
    db.from('brand_kits').select('logo_url, palette').eq('workspace_id', blog.workspace_id).maybeSingle(),
    db.from('brand_brains').select('one_liner').eq('workspace_id', blog.workspace_id).maybeSingle(),
  ]);
  if (!ws) return null;
  return {
    workspaceId: blog.workspace_id, slug: blog.slug, title: blog.title, description: blog.description, product: ws.product_name, productUrl: ws.url,
    oneLiner: brain?.one_liner ?? null, logo: kit?.logo_url ?? null, theme: themeFromPalette(kit?.palette ?? []),
  };
});

export const listPosts = cache(async (workspaceId: string, limit = 50): Promise<PostCard[]> => {
  const { data } = await supabaseAdmin().from('blog_posts').select('id, slug, title, excerpt, published_at, updated_at, body').eq('workspace_id', workspaceId).eq('status', 'published').order('published_at', { ascending: false }).limit(limit);
  return (data ?? []) as PostCard[];
});

export const getPost = cache(async (workspaceId: string, slug: string): Promise<PublicPost | null> => {
  if (!postSlug(slug)) return null;
  const db = supabaseAdmin();
  const { data } = await db.from('blog_posts').select('id, slug, title, excerpt, body, keyword, meta, faq, published_at, updated_at, keyword_id').eq('workspace_id', workspaceId).eq('slug', slug).eq('status', 'published').maybeSingle();
  if (!data) return null;
  const { data: k } = data.keyword_id ? await db.from('seo_keywords').select('kind').eq('id', data.keyword_id).maybeSingle() : { data: null };
  return { ...data, kind: k?.kind ?? null } as PublicPost;
});
