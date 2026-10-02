import { NextResponse, type NextRequest } from 'next/server';
import { isBot, withTracking } from '@shipitloud/engine';
import { site } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase/server';

// Short link: count the click (people only, not link previews) and send them on with UTM tags and our ref.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{5,12}$/.test(code)) return NextResponse.redirect(site.url, 302);
  const db = supabaseAdmin();
  const { data: link } = await db.from('short_links').select('id, target_url, source, medium, campaign').eq('code', code).maybeSingle();
  if (!link) return NextResponse.redirect(site.url, 302);
  if (!isBot(req.headers.get('user-agent')) && req.method === 'GET') await db.rpc('link_click', { p_link: link.id });
  let to: string;
  try { to = withTracking(link.target_url, { source: link.source, medium: link.medium, campaign: link.campaign, code }); } catch { to = link.target_url; }
  const res = NextResponse.redirect(to, 302);
  res.headers.set('cache-control', 'no-store');
  res.headers.set('referrer-policy', 'no-referrer-when-downgrade');
  return res;
}
