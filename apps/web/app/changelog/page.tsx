import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { changelog } from '@/lib/help';

export const metadata: Metadata = { title: 'What’s new', description: 'Everything we shipped, newest first.' };

export default function Changelog() {
  return (
    <LegalPage title="What’s new" updated={false}>
      <ol className="changelog">
        {changelog.map((c) => (
          <li key={c.date + c.title}>
            <time dateTime={c.date}>{new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
            <h2>{c.title}</h2>
            <p>{c.body}</p>
          </li>
        ))}
      </ol>
    </LegalPage>
  );
}
