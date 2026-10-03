import { NextResponse } from 'next/server';
import { requireWorkspace, supabaseAdmin } from '@/lib/supabase/server';

// Data export (PRD section 25): the founder's workspace as one JSON file, any time. Secrets (platform tokens,
// API key hashes) are never included. Every export is written to the audit log.
const TABLES = [
  'brand_brains', 'voice_profiles', 'brand_kits', 'growth_analyses', 'channel_plans', 'setup_progress',
  'assets', 'approvals', 'actions', 'mentions', 'listen_configs', 'content_sources', 'launch_plans', 'directory_submissions',
  'blog_posts', 'seo_keywords', 'waitlist_pages', 'email_settings', 'end_users', 'lifecycle_settings', 'ad_campaigns', 'ads',
  'subscriptions', 'cancellations', 'usage',
] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ ws: string }> }) {
  const { ws: id } = await params;
  const { sb, user, ws } = await requireWorkspace(id);
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), workspace: ws };
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select('*').eq('workspace_id', id).limit(5000);
    out[t] = error ? { error: 'not available' } : data;
  }
  const { data: page } = await sb.from('waitlist_pages').select('id').eq('workspace_id', id).maybeSingle();
  if (page) out.waitlist_signups = (await sb.from('waitlist_signups').select('email, source, referral_count, created_at, unsubscribed_at').eq('page_id', page.id).limit(50000)).data ?? [];
  await supabaseAdmin().from('admin_audit_log').insert({ admin_id: user.id, action: 'workspace.exported', target: id });
  const name = `${ws.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-shipitloud-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}
