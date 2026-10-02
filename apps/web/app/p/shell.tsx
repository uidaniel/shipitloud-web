import type { CSSProperties, ReactNode } from 'react';
import type { PublicPage } from '@/lib/pages';
import { site } from '@/lib/site';

/** Brand-themed frame shared by the waitlist page and the "you're on the list" page. */
export function PageShell({ page, children }: { page: PublicPage; children: ReactNode }) {
  const t = page.theme;
  const vars = { '--bg': t.bg, '--fg': t.fg, '--muted': t.muted, '--accent': t.accent, '--on-accent': t.onAccent } as CSSProperties;
  return (
    <div className="wp" style={vars}>
      <style>{`html{--wp-bg:${t.bg}}`}</style>
      <div className="wp-in">
        <div className="wp-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {page.logo && <img src={page.logo} alt="" />}
          <span>{page.name}</span>
        </div>
        <main className="wp-main">{children}</main>
        <footer className="wp-foot">
          <span>{page.url ? <a href={page.url} rel="noopener">{page.url.replace(/^https?:\/\//, '')}</a> : null}</span>
          {page.showBadge && (
            <a className="wp-badge" href={`${site.url}/?utm_source=badge&utm_campaign=${page.slug}`} target="_blank" rel="noopener">
              Launched with <b>ShipItLoud</b>
            </a>
          )}
        </footer>
      </div>
    </div>
  );
}
