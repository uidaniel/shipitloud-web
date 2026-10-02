'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/** Form submit button that shows a spinner and locks while the server action runs. */
export function Submit({ children, pending: label, className = 'pr-btn pr-btn-primary', name, value, title, disabled }: {
  children: ReactNode;
  pending?: string;
  className?: string;
  name?: string;
  value?: string;
  title?: string;
  disabled?: boolean;
}) {
  const { pending, data } = useFormStatus();
  // When several buttons share a form, only the clicked one spins.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={mine || undefined} name={name} value={value} title={title}>
      {mine && <span className="spin" aria-hidden="true" />}
      {mine && label ? label : children}
    </button>
  );
}

type Kept = { values?: Record<string, string | string[]> } | undefined;
/** After a failed save, a field shows what was submitted; otherwise its saved value. */
export function kept(state: Kept, name: string, fallback: string): string {
  const v = state?.values?.[name];
  return typeof v === 'string' ? v : Array.isArray(v) ? v.join('\n') : fallback;
}
/** Checkboxes: was it submitted? Radios (pass `value`): was this option the one submitted? */
export function keptOn(state: Kept, name: string, fallback: boolean, value?: string): boolean {
  if (!state?.values) return fallback;
  const v = state.values[name];
  if (value === undefined) return v !== undefined;
  return v === value || (Array.isArray(v) && v.includes(value));
}
