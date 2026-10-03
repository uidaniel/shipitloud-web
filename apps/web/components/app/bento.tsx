import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/app/icons';

// The colorful tiles from Home, for any page: a label, one big number (or a short phrase) and a caption.
// Tones: violet (the hero), mesh (pastel), lime, mint, ink, plain.

export type Tone = 'violet' | 'mesh' | 'lime' | 'mint' | 'ink' | 'plain';
export interface TileItem { label: string; value: ReactNode; unit?: string; sub?: ReactNode; href?: string; tone?: Tone; text?: boolean }

const SPARK = 'M100 0C104 70 130 96 200 100 130 104 104 130 100 200 96 130 70 104 0 100 70 96 96 70 100 0Z';
export const Spark = ({ className = 'spark' }: { className?: string }) => <svg className={className} viewBox="0 0 200 200" aria-hidden="true"><path d={SPARK} /></svg>;

export function Tiles({ items, wideFirst }: { items: TileItem[]; wideFirst?: boolean }) {
  return (
    <div className={`tiles${wideFirst ? ' wide-first' : ''}`}>
      {items.map((t) => {
        const body = (
          <>
            {t.tone === 'violet' && <Spark />}
            <span className="tile-h">{t.label}{t.href && <i>{Icon.external}</i>}</span>
            <b className={t.text ? 'txt' : undefined}>{t.value}{t.unit && <em>{t.unit}</em>}</b>
            {t.sub != null && <small>{t.sub}</small>}
          </>
        );
        const cls = `tile ${t.tone ?? 'plain'}`;
        return t.href ? <Link key={t.label} href={t.href} className={cls}>{body}</Link> : <div key={t.label} className={cls}>{body}</div>;
      })}
    </div>
  );
}

/** A locked feature as a hero: what it does, three things you get, and the way in. */
export function Upsell({ kicker, title, body, points, href, cta }: { kicker: string; title: string; body: string; points: string[]; href: string; cta: string }) {
  return (
    <section className="upsell">
      <Spark />
      <div>
        <span className="k">{kicker}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        <Link href={href} className="upsell-go">{cta} <i>{Icon.arrow}</i></Link>
      </div>
      <ul>{points.map((p) => <li key={p}><i>{Icon.check}</i>{p}</li>)}</ul>
    </section>
  );
}
