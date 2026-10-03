import type { Metadata } from 'next';
import '../product.css';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin' }, robots: { index: false, follow: false } };

// Light admin area in the product's style. Access is checked on every page (lib/admin.ts).
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="pr">
      <div className="pr-shell adm-shell">
        <main className="pr-main">{children}</main>
      </div>
    </div>
  );
}
