import { NextResponse, type NextRequest } from 'next/server';
import { rateLimited } from '@/lib/waitlist/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

// Article view counter: one per visitor per article per half hour, no cookies or personal data stored.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { post?: string } | null;
  const id = body?.post ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 204 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(`view:${ip}:${id}`, 1, 30 * 60_000)) return new NextResponse(null, { status: 204 });
  const db = supabaseAdmin();
  const { data } = await db.from('blog_posts').select('id').eq('id', id).eq('status', 'published').maybeSingle();
  if (data) await db.rpc('blog_view', { p_post: id });
  return new NextResponse(null, { status: 204 });
}
