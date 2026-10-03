import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireWorkspace } from '@/lib/supabase/server';
import { Submit } from '@/components/app/ui';
import { billingMode } from '@/lib/billing';
import { plans } from '@/lib/site';
import { testCheckout } from '../../../billing-actions';

export const metadata: Metadata = { title: 'Test checkout' };

// Stands in for Dodo's hosted checkout until the account is approved. No card, nothing charged.
export default async function TestCheckout({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ plan?: string; trial?: string }> }) {
  const { ws: id } = await params;
  const { plan = 'grow', trial = '0' } = await searchParams;
  const { user, ws } = await requireWorkspace(id);
  if (billingMode() !== 'simulator') redirect(`/app/${id}/upgrade`);
  const p = plans.find((x) => x.id === plan) ?? plans.find((x) => x.id === 'grow')!;
  const days = Number(trial) || 0;
  return (
    <div className="pr-body" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
      <form action={testCheckout} className="tc">
        <input type="hidden" name="ws" value={id} /><input type="hidden" name="plan" value={p.id} /><input type="hidden" name="trial" value={days} />
        <span className="tc-test">Test mode · no card is charged</span>
        <h1>{p.name} for {ws.product_name}</h1>
        <div className="tc-line"><span>{p.name}{p.period === 'month' ? ' · monthly' : ' · one-time'}</span><b>${p.price.USD}</b></div>
        {days > 0 && <div className="tc-line"><span>Free trial</span><b>{days} days</b></div>}
        <div className="tc-line tc-total"><span>Due today</span><b>{days > 0 ? '$0' : `$${p.price.USD}`}</b></div>
        <label className="pr-label">Email</label>
        <input className="pr-input" value={user.email ?? ''} readOnly />
        <label className="pr-label">Card</label>
        <input className="pr-input" value="4242 4242 4242 4242 · 12/34 · 123" readOnly />
        <Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="Processing…">{days > 0 ? `Start ${days}-day trial` : `Pay $${p.price.USD}`}</Submit>
        <small>The real checkout is Dodo Payments’ secure page. This one only exists before it’s connected.</small>
      </form>
    </div>
  );
}
