import type { Metadata } from 'next';
import Link from 'next/link';
import { CANCEL_REASONS, offerFor, type CancelReason } from '@shipitloud/engine';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { Icon } from '@/components/app/icons';
import { cancelSubscription } from '../../../billing-actions';

export const metadata: Metadata = { title: 'Cancel plan' };

// One click plus an optional reason (PRD section 25). A matching offer is shown once; declining cancels at once.
export default async function Cancel({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ offer?: string; c?: string }> }) {
  const { ws: id } = await params;
  const { offer: offerId, c } = await searchParams;
  const { sb, ws } = await requireWorkspace(id);
  const { data: cancel } = c ? await sb.from('cancellations').select('id, reason, offer_shown').eq('id', c).eq('workspace_id', id).maybeSingle() : { data: null };
  const offer = cancel && cancel.offer_shown === offerId ? offerFor(cancel.reason as CancelReason, { trustOn: false }) : null;

  if (offer && cancel) {
    return (
      <div className="pr-body" style={{ maxWidth: 620 }}>
        <section className="cx-offer">
          <span className="k">Before you go</span>
          <h1>{offer.title}</h1>
          <p>{offer.body}</p>
          <div className="cx-actions">
            <form action={cancelSubscription}><input type="hidden" name="ws" value={id} /><input type="hidden" name="c" value={cancel.id} /><input type="hidden" name="step" value="accept" /><Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="One moment…">{offer.cta}</Submit></form>
            <form action={cancelSubscription}><input type="hidden" name="ws" value={id} /><input type="hidden" name="c" value={cancel.id} /><input type="hidden" name="step" value="decline" /><Submit className="pr-btn pr-btn-ghost pr-btn-lg" pending="Cancelling…">No thanks, cancel</Submit></form>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="pr-body" style={{ maxWidth: 620 }}>
      <div className="pr-page-h"><h1 className="pr-h1">Cancel your plan</h1><p className="pr-lead">Nothing more is charged. {ws.product_name} moves to the Free plan, and your plan, assets and history stay for 12 months.</p></div>
      <form action={cancelSubscription} className="pr-section">
        <input type="hidden" name="ws" value={id} /><input type="hidden" name="step" value="start" />
        <div className="pr-section-h"><h2>Why are you leaving? <span className="pr-hint" style={{ fontWeight: 400 }}>Optional</span></h2></div>
        <div className="pr-section-b">
          <div className="cx-reasons">
            {CANCEL_REASONS.map((r) => <label key={r.id}><input type="radio" name="reason" value={r.id} /><span>{r.label}</span></label>)}
          </div>
          <textarea className="pr-textarea" name="comment" rows={3} placeholder="Anything we should know? (optional)" maxLength={1000} />
        </div>
        <div className="pr-section-f" style={{ justifyContent: 'space-between' }}>
          <Link className="pr-btn pr-btn-ghost" href={`/app/${id}/billing`}>{Icon.undo} Keep my plan</Link>
          <Submit className="pr-btn pr-btn-danger" pending="Cancelling…">Cancel plan</Submit>
        </div>
      </form>
    </div>
  );
}
