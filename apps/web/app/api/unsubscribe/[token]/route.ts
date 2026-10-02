import { NextResponse, type NextRequest } from 'next/server';
import { readUnsubscribeToken } from '@shipitloud/engine';
import { supabaseAdmin } from '@/lib/supabase/server';

// RFC 8058 one-click unsubscribe: mail clients POST here from the List-Unsubscribe header.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const id = readUnsubscribeToken((await params).token);
  if (!id) return new NextResponse('Invalid link', { status: 400 });
  await supabaseAdmin().from('waitlist_signups').update({ unsubscribed_at: new Date().toISOString() }).eq('id', id).is('unsubscribed_at', null);
  return new NextResponse('Unsubscribed', { status: 200 });
}

// A plain visit goes to the page with a button (link scanners must not unsubscribe people).
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return NextResponse.redirect(new URL(`/u/${(await params).token}`, req.url), 303);
}
