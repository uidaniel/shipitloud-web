'use client';

import { useActionState } from 'react';
import { createWorkspace } from '../actions';
import { Submit, kept, keptOn } from '@/components/app/ui';

const FITS = [['launching_soon', 'Launching soon'], ['already_live', 'Already live, need users'], ['exploring', 'Just exploring']] as const;

export function NewWorkspaceForm({ url = '' }: { url?: string }) {
  const [state, action] = useActionState(createWorkspace, {});
  return (
    <form action={action}>
      <fieldset className="pr-fieldset">
        <legend className="pr-label">Which fits you?</legend>
        <div className="pr-seg">
          {FITS.map(([v, l]) => <label key={v}><input type="radio" name="fit" value={v} defaultChecked={keptOn(state, 'fit', false, v)} /><span>{l}</span></label>)}
        </div>
      </fieldset>
      <div>
        <label className="pr-label" htmlFor="url">Website, App Store or Google Play link</label>
        <input id="url" name="url" className="pr-input" placeholder="yourproduct.com or an app store link" inputMode="url" autoComplete="url" defaultValue={kept(state, 'url', url)} style={{ height: 44, fontSize: 15 }} />
      </div>
      <div>
        <label className="pr-label" htmlFor="product_name">Product name</label>
        <input id="product_name" name="product_name" className="pr-input" placeholder="Balans" required maxLength={80} defaultValue={kept(state, 'product_name', '')} style={{ height: 44, fontSize: 15 }} />
        <p className="pr-hint">No site yet? Leave the link empty. You can describe it on the next step.</p>
      </div>
      {state.error && <p className="pr-error" role="alert">{state.error}</p>}
      <Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="Setting up…">Continue</Submit>
    </form>
  );
}
