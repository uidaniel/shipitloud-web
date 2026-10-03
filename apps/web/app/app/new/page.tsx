import type { Metadata } from 'next';
import { requireUser } from '@/lib/supabase/server';
import { LogoIcon } from '@/components/logo';
import { NewWorkspaceForm } from './form';

export const metadata: Metadata = { title: 'Add your product' };

export default async function NewWorkspace({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  await requireUser();
  const { url } = await searchParams;
  return (
    <div className="pr-onb">
      <div className="pr-onb-card pr-fade-in">
        <div style={{ marginBottom: 32 }}><LogoIcon size={34} /></div>
        <div className="pr-steps" aria-label="Step 1 of 3"><i className="on" /><i /><i /></div>
        <h1>What are you launching?</h1>
        <p className="sub">Paste your product&apos;s link. We&apos;ll read it and set up everything else.</p>
        <NewWorkspaceForm url={(url ?? '').slice(0, 300)} />
      </div>
    </div>
  );
}
