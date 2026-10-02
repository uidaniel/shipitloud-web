import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Owner-only CSV export of their own signups (RLS restricts the query to the owner's workspace).
export async function GET(_req: Request, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const sb = await supabaseServer();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) return NextResponse.redirect(new URL('/login', _req.url));
  const { data: page } = await sb.from('waitlist_pages').select('id, slug').eq('workspace_id', ws).maybeSingle();
  if (!page) return new NextResponse('Not found', { status: 404 });
  const { data } = await sb.from('waitlist_signups').select('email, consent, consent_text, source, campaign, referral_code, referral_count, created_at').eq('page_id', page.id).order('created_at');
  const rows = [['email', 'consent', 'consent_text', 'source', 'campaign', 'referral_code', 'referrals', 'joined_at'].join(','),
    ...(data ?? []).map((r) => [r.email, r.consent, r.consent_text, r.source, r.campaign, r.referral_code, r.referral_count, r.created_at].map(csv).join(','))];
  return new NextResponse(rows.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${page.slug}-signups.csv"` },
  });
}
