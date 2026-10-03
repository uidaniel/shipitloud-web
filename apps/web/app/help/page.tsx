import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal';
import { articles } from '@/lib/help';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Help', description: 'Short answers on setup, channels, trust mode, the Reddit extension, billing and your data.' };

export default function Help() {
  return (
    <LegalPage title="Help" updated={false}>
      <p>Short answers to the things founders ask most. Can’t find yours? Email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>: we reply within a day on business days.</p>
      <ul className="help-list">
        {articles.map((a) => (
          <li key={a.slug}><Link href={`/help/${a.slug}`}><b>{a.title}</b><span>{a.summary}</span></Link></li>
        ))}
      </ul>
      <p>Also: <Link href="/status">System status</Link> · <Link href="/changelog">What’s new</Link></p>
    </LegalPage>
  );
}
