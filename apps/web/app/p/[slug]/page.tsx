import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getPublicPage } from '@/lib/pages';
import { PageShell } from '../shell';
import { SignupForm } from './signup';
import '../pages.css';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await getPublicPage((await params).slug);
  if (!page?.published) return { title: 'Not found', robots: { index: false } };
  return { title: `${page.name}: ${page.headline}`, description: page.subhead ?? undefined, openGraph: { title: page.headline, description: page.subhead ?? undefined } };
}

export default async function WaitlistPage({ params }: Params) {
  const page = await getPublicPage((await params).slug);
  if (!page?.published) notFound();
  return (
    <PageShell page={page}>
      <h1>{page.headline}</h1>
      {page.subhead && <p className="wp-sub">{page.subhead}</p>}
      <Suspense>
        <SignupForm slug={page.slug} name={page.name} cta={page.cta} />
      </Suspense>
    </PageShell>
  );
}
