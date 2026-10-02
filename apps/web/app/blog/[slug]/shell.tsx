import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { PublicBlog } from '@/lib/blog';
import '../blog.css';

/** Brand-themed frame for a founder's hosted blog. */
export function BlogShell({ blog, children }: { blog: PublicBlog; children: ReactNode }) {
  const t = blog.theme;
  const vars = { '--bg': t.bg, '--fg': t.fg, '--muted': t.muted, '--accent': t.accent, '--on-accent': t.onAccent } as CSSProperties;
  const cta = blog.productUrl ? `${blog.productUrl}${blog.productUrl.includes('?') ? '&' : '?'}utm_source=blog&utm_medium=header` : null;
  return (
    <div className="bl" style={vars}>
      <style>{`html,body{background:${t.bg}}`}</style>
      <header className="bl-head">
        <Link href={`/blog/${blog.slug}`} className="bl-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {blog.logo && <img src={blog.logo} alt="" width={28} height={28} />}
          <span>{blog.product}</span><em>Blog</em>
        </Link>
        {cta && <a className="bl-cta" href={cta} rel="noopener">Try {blog.product}</a>}
      </header>
      <main className="bl-main">{children}</main>
      <footer className="bl-foot">
        <span>© {new Date().getFullYear()} {blog.product}</span>
        <a href={`/blog/${blog.slug}/rss.xml`}>RSS</a>
      </footer>
    </div>
  );
}
