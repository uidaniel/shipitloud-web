import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { readUnsubscribeToken } from '@shipitloud/engine';
import { supabaseAdmin } from '@/lib/supabase/server';
import '../../p/pages.css';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };
export const dynamic = 'force-dynamic';

async function unsubscribe(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  const id = readUnsubscribeToken(token);
  if (!id) return;
  await supabaseAdmin().from('waitlist_signups').update({ unsubscribed_at: new Date().toISOString() }).eq('id', id).is('unsubscribed_at', null);
  revalidatePath(`/u/${token}`);
}

async function resubscribe(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  const id = readUnsubscribeToken(token);
  if (!id) return;
  await supabaseAdmin().from('waitlist_signups').update({ unsubscribed_at: null }).eq('id', id);
  revalidatePath(`/u/${token}`);
}

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readUnsubscribeToken(token);
  const db = supabaseAdmin();
  const { data: s } = id ? await db.from('waitlist_signups').select('workspace_id, unsubscribed_at').eq('id', id).maybeSingle() : { data: null };
  const { data: ws } = s ? await db.from('workspaces').select('product_name').eq('id', s.workspace_id).single() : { data: null };
  const product = ws?.product_name ?? 'this list';
  return (
    <div className="wp">
      <div className="wp-in">
        <main className="wp-main" style={{ maxWidth: 440 }}>
          {!s ? (
            <><h1 style={{ fontSize: 34 }}>This link doesn’t work</h1><p className="wp-sub">It may be incomplete. Try the link in the email again, or reply to the email and ask to be removed.</p></>
          ) : s.unsubscribed_at ? (
            <>
              <h1 style={{ fontSize: 34 }}>You’re unsubscribed</h1>
              <p className="wp-sub">You won’t get any more emails about {product}. Your place on the waitlist is kept.</p>
              <form action={resubscribe} style={{ marginTop: 24 }}><input type="hidden" name="token" value={token} /><button className="wp-ghost" style={{ background: 'transparent', cursor: 'pointer' }}>Changed your mind? Subscribe again</button></form>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 34 }}>Stop emails about {product}?</h1>
              <p className="wp-sub">You’ll keep your place on the waitlist.</p>
              <form action={unsubscribe} style={{ marginTop: 24 }}><input type="hidden" name="token" value={token} /><button className="wp-btn">Unsubscribe</button></form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
