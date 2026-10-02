'use client';

import { useActionState, useEffect, useState } from 'react';
import { Submit } from './ui';
import { saveBrand } from '@/app/app/actions';

export interface BrandData {
  one_liner: string | null;
  summary: string | null;
  target_customer: string | null;
  pain_points: string[];
  keywords: string[];
  competitors: string[];
  content_pillars: string[];
  confidence: number | null;
  sources: string[];
  tone: string | null;
}

const join = (a: string[]) => a.join('\n');

function Field({ label, hint, name, value, rows }: { label: string; hint?: string; name: string; value: string; rows?: number }) {
  const id = `f-${name}`;
  return (
    <div>
      <label className="pr-label" htmlFor={id}>{label}</label>
      {rows ? (
        <textarea id={id} name={name} className="pr-textarea" defaultValue={value} rows={rows} style={{ minHeight: 0 }} />
      ) : (
        <input id={id} name={name} className="pr-input" defaultValue={value} />
      )}
      {hint && <p className="pr-hint">{hint}</p>}
    </div>
  );
}

/** Review and edit the brand brain. Used in onboarding (with Confirm) and on the Brand page. */
export function BrandEditor({ ws, brand, onboarding }: { ws: string; brand: BrandData; onboarding?: boolean }) {
  const [state, action] = useActionState(saveBrand, {});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={action} className="pr-section pr-fade-in" key={brand.one_liner ?? 'b'}>
      <input type="hidden" name="ws" value={ws} />
      {onboarding && <input type="hidden" name="confirm" value="1" />}
      <div className="pr-section-h">
        <h2>{onboarding ? 'Here’s what we understood' : 'Brand brain'}</h2>
        <p>
          Every post, reply and ad starts from this. Fix anything that’s off.
          {brand.confidence != null && brand.confidence < 50 && ' Your site didn’t say much, so check this closely.'}
        </p>
      </div>
      <div className="pr-section-b">
        <Field label="What it does, in one line" name="one_liner" value={brand.one_liner ?? ''} />
        <Field label="Who it’s for" name="target_customer" value={brand.target_customer ?? ''} rows={2} />
        <div className="pr-grid-2">
          <Field label="Problems it solves" hint="One per line" name="pain_points" value={join(brand.pain_points)} rows={5} />
          <Field label="What people search or post" hint="One per line. We listen for these." name="keywords" value={join(brand.keywords)} rows={5} />
        </div>
        <div className="pr-grid-2">
          <Field label="Alternatives people use today" hint="One per line" name="competitors" value={join(brand.competitors)} rows={4} />
          <Field label="Content themes" hint="One per line" name="content_pillars" value={join(brand.content_pillars)} rows={4} />
        </div>
        <Field label="Voice" hint="How your posts should sound, in a few words" name="tone" value={brand.tone ?? ''} />
        {!!brand.sources.length && (
          <p className="pr-hint" style={{ margin: 0 }}>Read from {brand.sources.map((s) => new URL(s).pathname === '/' ? new URL(s).hostname : new URL(s).pathname).join(', ')}</p>
        )}
      </div>
      <div className="pr-section-f">
        {state.error && <span className="pr-error" role="alert" style={{ margin: 0, marginRight: 'auto' }}>{state.error}</span>}
        {saved && <span className="pr-fade-in" style={{ marginRight: 'auto', color: 'var(--ok)', fontSize: 13, alignSelf: 'center' }}>Saved</span>}
        <Submit className={onboarding ? 'pr-btn pr-btn-primary pr-btn-lg' : 'pr-btn pr-btn-primary'} pending="Saving…">
          {onboarding ? 'Looks right, continue' : 'Save'}
        </Submit>
      </div>
    </form>
  );
}
