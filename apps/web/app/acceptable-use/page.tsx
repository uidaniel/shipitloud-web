import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Acceptable Use Policy' };

export default function Page() {
  const mail = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Acceptable Use Policy">
      <p>{site.name} helps founders talk to people who need what they built. It must never be used to deceive them.</p>

      <h2>You may not use {site.name} to</h2>
      <ul>
        <li>Send spam: bulk unsolicited messages, or posting the same reply across many threads.</li>
        <li>Post fake reviews or testimonials, or pretend to be a customer of your own product.</li>
        <li>Impersonate another person, brand or company, or hide that you made the product you&apos;re promoting.</li>
        <li>Run deceptive ads: false claims, fake scarcity, or hidden costs.</li>
        <li>Break a platform&apos;s rules, get around its limits, or use accounts you don&apos;t own.</li>
        <li>Promote anything illegal, hateful, sexual content involving minors, weapons, or unlicensed financial or medical services.</li>
        <li>Upload footage, music or images you don&apos;t have the right to use.</li>
        <li>Collect people&apos;s data without their consent, or email people who didn&apos;t sign up.</li>
      </ul>

      <h2>How we enforce it</h2>
      <p>
        Drafts are checked before you see them, and replies to people always need your OK unless you switch on trust mode for
        low-risk sites. If we see abuse we may pause outreach, limit your workspace or close it, and we may report illegal activity.
        We tell you why, and you can reply to {mail}.
      </p>
    </LegalPage>
  );
}
