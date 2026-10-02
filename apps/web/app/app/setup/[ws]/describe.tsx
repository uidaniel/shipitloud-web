'use client';

import { useActionState } from 'react';
import { Submit, kept, keptOn } from '@/components/app/ui';
import { buildFromDescription } from '../../actions';

export function DescribeForm({ ws, initial }: { ws: string; initial: string }) {
  const [state, action] = useActionState(buildFromDescription, {});
  return (
    <form action={action}>
      <input type="hidden" name="ws" value={ws} />
      <div>
        <label className="pr-label" htmlFor="description">What does it do, and who is it for?</label>
        <textarea
          id="description"
          name="description"
          className="pr-textarea"
          rows={6}
          defaultValue={kept(state, 'description', initial)}
          placeholder="Balans lets freelancers in Nigeria send an invoice from WhatsApp and get paid straight to their bank. Clients just open a link, no app needed."
          autoFocus
        />
      </div>
      {state.error && <p className="pr-error" role="alert">{state.error}</p>}
      <Submit className="pr-btn pr-btn-primary pr-btn-lg" pending="Starting…">Continue</Submit>
    </form>
  );
}
