'use client';

import { useActionState } from 'react';
import { createWorkspace } from '../actions';
import { Submit } from '@/components/app/ui';

export function NewWorkspaceForm() {
  const [state, action] = useActionState(createWorkspace, {});
  return (
    <form action={action}>
      <div>
        <label className="pr-label" htmlFor="url">Product link</label>
        <input id="url" name="url" className="pr-input" placeholder="yourproduct.com" inputMode="url" autoComplete="url" autoFocus style={{ height: 44, fontSize: 15 }} />
      </div>
      <div>
        <label className="pr-label" htmlFor="product_name">Product name</label>
        <input id="product_name" name="product_name" className="pr-input" placeholder="Balans" required maxLength={80} style={{ height: 44, fontSize: 15 }} />
        <p className="pr-hint">No site yet? Leave the link empty. You can describe it on the next step.</p>
      </div>
      {state.error && <p className="pr-error" role="alert">{state.error}</p>}
      <Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="Setting up…">Continue</Submit>
    </form>
  );
}
