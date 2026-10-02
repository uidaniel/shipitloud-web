import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Inter } from 'next/font/google';
import { site } from '@/lib/site';
import './globals.css';

// Stand-in for Apple's SF Pro inside the MacBook mockup on non-Apple devices.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { type: 'website', siteName: site.name, title: site.tagline, description: site.description, url: site.url },
  twitter: { card: 'summary_large_image', title: site.tagline, description: site.description },
};

export const viewport: Viewport = {
  themeColor: '#07070B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
