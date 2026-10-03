import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/legal';
import { articles, findArticle } from '@/lib/help';
import { site } from '@/lib/site';

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = findArticle((await params).slug);
  return a ? { title: a.title, description: a.summary } : {};
}

export default async function HelpArticle({ params }: { params: Promise<{ slug: string }> }) {
  const a = findArticle((await params).slug);
  if (!a) notFound();
  const others = articles.filter((x) => x.slug !== a.slug).slice(0, 3);
  return (
    <LegalPage title={a.title} updated={false}>
      <p className="help-sum">{a.summary}</p>
      {a.body.map((p) => <p key={p}>{p}</p>)}
      <h2>Still stuck?</h2>
      <p>Email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> or use Help in the app. We reply within a day on business days.</p>
      <h2>Related</h2>
      <ul>{others.map((o) => <li key={o.slug}><Link href={`/help/${o.slug}`}>{o.title}</Link></li>)}</ul>
      <p><Link href="/help">All help articles</Link></p>
    </LegalPage>
  );
}
