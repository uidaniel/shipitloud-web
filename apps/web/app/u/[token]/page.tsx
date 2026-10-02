import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { readUnsubscribeToken } from '@shipitloud/engine';
import { supabaseAdmin } from '@/lib/supabase/server';
import '../../p/pages.css';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };
export const dynamic = 'force-dynamic';

// The token's id is a waitlist signup or one of the founder's own users (end_users); both are uuids.
async function setUnsubscribed(id: string, at: string | null) {
  const db = supabaseAdmin();
  const q = (t: 'waitlist_signups' | 'end_users') => (at ? db.from(t).update({ unsubscribed_at: at }).eq('id', id).is('unsubscribed_at', null) : db.from(t).update({ unsubscribed_at: null }).eq('id', id));
  await q('waitlist_signups');
  await q('end_users');
}

async function unsubscribe(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  const id = readUnsubscribeToken(token);
  if (!id) return;
  await setUnsubscribed(id, new Date().toISOString());
  revalidatePath(`/u/${token}`);
}

async function resubscribe(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  const id = readUnsubscribeToken(token);
  if (!id) return;
  await setUnsubscribed(id, null);
  revalidatePath(`/u/${token}`);
}

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readUnsubscribeToken(token);
  const db = supabaseAdmin();
  const { data: w } = id ? await db.from('waitlist_signups').select('workspace_id, unsubscribed_at').eq('id', id).maybeSingle() : { data: null };
  const { data: u } = id && !w ? await db.from('end_users').select('workspace_id, unsubscribed_at').eq('id', id).maybeSingle() : { data: null };
  const s = w ?? u;
  const keep = w ? 'Your place on the waitlist is kept.' : 'Your account isn’t affected.';
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
              <p className="wp-sub">You won’t get any more emails about {product}. {keep}</p>
              <form action={resubscribe} style={{ marginTop: 24 }}><input type="hidden" name="token" value={token} /><button className="wp-ghost" style={{ background: 'transparent', cursor: 'pointer' }}>Changed your mind? Subscribe again</button></form>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 34 }}>Stop emails about {product}?</h1>
              <p className="wp-sub">{w ? 'You’ll keep your place on the waitlist.' : 'Your account stays as it is. This only stops these emails.'}</p>
              <form action={unsubscribe} style={{ marginTop: 24 }}><input type="hidden" name="token" value={token} /><button className="wp-btn">Unsubscribe</button></form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
