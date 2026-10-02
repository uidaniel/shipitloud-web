'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LogoIcon } from '@/components/logo';
import { site } from '@/lib/site';

const product = [
  { id: 'how', label: 'How it works' },
  { id: 'control', label: 'Approval inbox' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'kit', label: 'Launch kit' },
  { id: 'pricing', label: 'Pricing' },
];
const stages = [
  { id: 'how', label: 'Launch', note: 'Kit, waitlist, 30-day plan' },
  { id: 'how', label: 'Grow', note: 'Replies, content, ads' },
];
const legal = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refund', label: 'Refunds' },
];

// Floating header: logo left, a centered Menu pill that opens into a panel, and the waitlist CTA right.
export function SiteNav({ onHome = true }: { onHome?: boolean }) {
  const [open, setOpen] = useState(false);
  // Stays true through the closing animation so the panel can shrink back into the button.
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const prefix = onHome ? '' : '/';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !toggle.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    panel.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const close = () => setOpen(false);

  useEffect(() => {
    if (open) { setShown(true); return; }
    if (!shown) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setShown(false), reduce ? 0 : 380);
    return () => window.clearTimeout(t);
  }, [open, shown]);

  // The reveal grows from the centre of the button that was clicked.
  useLayoutEffect(() => {
    const p = panel.current;
    const b = toggle.current;
    if (!shown || !p || !b) return;
    const pr = p.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    p.style.setProperty('--ox', `${br.left + br.width / 2 - pr.left}px`);
    p.style.setProperty('--oy', `${br.top + br.height / 2 - pr.top}px`);
  }, [shown]);

  return (
    <header className={`fnav${open ? ' is-open' : ''}${shown ? ' is-shown' : ''}`}>
      <Link href="/" className="fnav-logo" aria-label={`${site.name} home`}>
        <LogoIcon size={30} square={false} />
        <span className="fnav-word">ShipIt<b>Loud</b></span>
      </Link>

      <div className="fnav-center">
        <button
          ref={toggle}
          type="button"
          className="fnav-pill"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="fnav-burger" aria-hidden="true"><i /><i /></span>
          <span className="fnav-pill-label">{open ? 'Close' : 'Menu'}</span>
        </button>

        <div ref={panel} id="site-menu" className={`fnav-panel${open ? ' is-in' : ' is-out'}`} hidden={!shown}>
          <div className="fnav-cols">
            <div>
              <p className="fnav-k">Product</p>
              <nav aria-label="Main" className="fnav-big">
                {product.map((it) => (
                  <a key={it.label} href={`${prefix}#${it.id}`} onClick={close}>{it.label}</a>
                ))}
              </nav>
            </div>
            <div>
              <p className="fnav-k">Two stages</p>
              <div className="fnav-stages">
                {stages.map((s) => (
                  <a key={s.label} href={`${prefix}#${s.id}`} onClick={close}>
                    <b>{s.label}</b>
                    <span>{s.note}</span>
                  </a>
                ))}
              </div>
              <a href={`${prefix}#join`} className="fnav-panel-cta" onClick={close}>
                Join the waitlist <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div className="fnav-foot">
            <a href={`mailto:${site.contactEmail}`}>Contact</a>
            <span className="fnav-foot-r">
              {legal.map((l) => <Link key={l.href} href={l.href} onClick={close}>{l.label}</Link>)}
            </span>
          </div>
        </div>
      </div>

      <a href={`${prefix}#join`} className="fnav-cta">Join waitlist</a>
    </header>
  );
}
