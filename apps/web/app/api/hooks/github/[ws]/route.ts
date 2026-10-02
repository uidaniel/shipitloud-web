import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// GitHub webhook (PRD section 6: "GitHub webhook or changelog feed triggers posts").
// Published releases, and pushes whose commits start with "feat:", become product updates that get drafted into posts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'too large' }, { status: 413 });
  const db = supabaseAdmin();
  const { data: src } = await db.from('content_sources').select('webhook_secret').eq('workspace_id', ws).maybeSingle();
  if (!src?.webhook_secret) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const expected = `sha256=${createHmac('sha256', src.webhook_secret).update(raw).digest('hex')}`;
  const ok = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const event = req.headers.get('x-github-event');
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (event === 'ping') return NextResponse.json({ ok: true, pong: true });

  let update: { source: string; external_id: string; title: string; body: string; url: string | null } | null = null;
  if (event === 'release' && body.action === 'published') {
    const r = body.release as { id: number; name?: string; tag_name: string; body?: string; html_url: string; draft?: boolean; prerelease?: boolean };
    if (r && !r.draft) update = { source: 'github_release', external_id: String(r.id), title: r.name || r.tag_name, body: (r.body ?? '').slice(0, 2000), url: r.html_url };
  } else if (event === 'push') {
    const repo = body.repository as { default_branch?: string } | undefined;
    const ref = String(body.ref ?? '');
    const commits = (body.commits as { id: string; message: string; url: string }[] | undefined) ?? [];
    const feats = commits.filter((c) => /^feat(\(.+\))?!?:/i.test(c.message));
    if (repo?.default_branch && ref === `refs/heads/${repo.default_branch}` && feats.length) {
      const lines = feats.map((c) => c.message.split('\n')[0]!.replace(/^feat(\(.+\))?!?:\s*/i, ''));
      update = { source: 'github_push', external_id: String(body.after ?? feats[0]!.id), title: lines[0]!.slice(0, 200), body: lines.slice(1).join('\n').slice(0, 2000), url: feats[0]!.url };
    }
  }
  if (!update) return NextResponse.json({ ok: true, ignored: true });

  const { data } = await db.from('product_updates').upsert({ workspace_id: ws, ...update, published_at: new Date().toISOString() }, { onConflict: 'workspace_id,source,external_id', ignoreDuplicates: true }).select('id');
  for (const u of data ?? []) {
    await db.rpc('enqueue_job', { p_workspace: ws, p_type: 'content.update_posts', p_payload: { update_id: u.id }, p_run_at: new Date().toISOString(), p_key: `update:${u.id}` });
  }
  return NextResponse.json({ ok: true, created: data?.length ?? 0 });
}
