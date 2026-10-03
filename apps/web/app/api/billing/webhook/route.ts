import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyWebhook, type BillingEvent } from '@shipitloud/engine';
import { supabaseAdmin } from '@/lib/supabase/server';
import { processEvent } from '@/lib/billing';

// Dodo Payments webhooks (Standard Webhooks signatures). Every event is stored once by webhook-id;
// a failure returns 500 so Dodo retries.
export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifyWebhook(process.env.DODO_WEBHOOK_SECRET ?? '', {
    id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature'),
  }, body);
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  let event: BillingEvent;
  try { event = JSON.parse(body) as BillingEvent; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (!event?.type || !event.data) return NextResponse.json({ ok: true, ignored: true });
  try {
    const r = await processEvent(supabaseAdmin(), req.headers.get('webhook-id')!, event);
    const ws = event.data.metadata?.workspace_id;
    if (typeof ws === 'string') revalidatePath(`/app/${ws}`, 'layout');
    return NextResponse.json({ ok: true, result: r });
  } catch (err) {
    console.error('billing webhook failed', err);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
