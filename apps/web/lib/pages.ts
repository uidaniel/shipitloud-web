import 'server-only';
import { themeFromPalette, type Theme } from '@shipitloud/templates/color';
import { supabaseAdmin } from '@/lib/supabase/server';

export interface PublicPage {
  id: string;
  slug: string;
  workspaceId: string;
  name: string;
  url: string | null;
  headline: string;
  subhead: string | null;
  cta: string;
  logo: string | null;
  theme: Theme;
  showBadge: boolean;
  published: boolean;
}

export const isSlug = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s);

/** A founder's hosted waitlist page, read with the service role (public pages have no session). */
export async function getPublicPage(slug: string): Promise<PublicPage | null> {
  if (!isSlug(slug)) return null;
  const sb = supabaseAdmin();
  const { data: page } = await sb.from('waitlist_pages').select('id, slug, workspace_id, headline, subhead, cta, show_badge, published_at').eq('slug', slug).maybeSingle();
  if (!page) return null;
  const [{ data: ws }, { data: kit }, { data: brain }] = await Promise.all([
    sb.from('workspaces').select('product_name, url, plan').eq('id', page.workspace_id).single(),
    sb.from('brand_kits').select('logo_url, palette').eq('workspace_id', page.workspace_id).maybeSingle(),
    sb.from('brand_brains').select('one_liner, summary').eq('workspace_id', page.workspace_id).maybeSingle(),
  ]);
  if (!ws) return null;
  return {
    id: page.id,
    slug: page.slug,
    workspaceId: page.workspace_id,
    name: ws.product_name,
    url: ws.url,
    headline: page.headline || brain?.one_liner || ws.product_name,
    subhead: page.subhead || brain?.summary || null,
    cta: page.cta || 'Join the waitlist',
    logo: kit?.logo_url ?? null,
    theme: themeFromPalette(kit?.palette ?? []),
    // The badge is required on the free plan (viral loop); paid plans can turn it off.
    showBadge: ws.plan === 'free' ? true : page.show_badge,
    published: !!page.published_at,
  };
}

export const consentFor = (name: string) => `Email me about the ${name} launch and early access. Unsubscribe any time.`;
