import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Data Processing Agreement' };

export default function Page() {
  const mail = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Data Processing Agreement">
      <p>
        This agreement applies when you use {site.name} to process personal data of your own users or waitlist (for example
        signups, emails and events from your app). You are the controller; {site.legalEntity} is the processor.
      </p>

      <h2>What we process, and why</h2>
      <ul>
        <li><b>Data:</b> email addresses, names if you send them, your own user ids, signup and activity events, waitlist referrals.</li>
        <li><b>People:</b> your waitlist signups and your product&apos;s users.</li>
        <li><b>Purpose:</b> only to run the features you turn on: waitlist emails, onboarding and win-back emails, and results by channel.</li>
        <li><b>Duration:</b> while your account is active, then deleted under our retention rules (below).</li>
      </ul>

      <h2>Our commitments</h2>
      <ul>
        <li>We process personal data only on your instructions, which are your settings in {site.name}.</li>
        <li>Everyone with access is bound by confidentiality.</li>
        <li>Security: encryption in transit, encrypted platform tokens, row-level access controls, and least-privilege access.</li>
        <li>We use the sub-processors listed on our <a href="/subprocessors">sub-processors page</a>, and give notice before adding new ones.</li>
        <li>We help you answer people&apos;s requests to access, export or delete their data. Contacts who unsubscribe or ask to be deleted are honored across emails and exports.</li>
        <li>We tell you without undue delay, and within 72 hours where possible, if a breach affects your data.</li>
        <li>On deletion of your workspace, your users&apos; data is deleted after the 7-day grace period, and from backups within 30 days.</li>
      </ul>

      <h2>International transfers</h2>
      <p>Where data leaves the UK or EU, we rely on standard contractual clauses with our providers.</p>

      <h2>Contact</h2>
      <p>Questions or a signed copy: {mail}.</p>
    </LegalPage>
  );
}
