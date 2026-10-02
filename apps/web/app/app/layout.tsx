import type { Metadata } from 'next';
import '../product.css';

export const metadata: Metadata = { title: { default: 'ShipItLoud', template: '%s · ShipItLoud' }, robots: { index: false } };

export default function AppRoot({ children }: { children: React.ReactNode }) {
  return <div className="pr">{children}</div>;
}
