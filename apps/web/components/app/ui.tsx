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
