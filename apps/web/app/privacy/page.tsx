import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Privacy() {
  const e = site.legalEntity;
  const mail = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {e} (&ldquo;we&rdquo;) runs {site.name}. This policy explains what personal data we collect, why, and the choices you have. It
        applies to our website, waitlist and product.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Waitlist:</b> your email, the product URL you paste (optional), your consent and the time you gave it, who referred you, and where you came from (for example a referral link or campaign tag).</li>
        <li><b>Fraud prevention:</b> a one-way hash of your IP address, used to block fake signups and referral abuse. We do not store your raw IP address with your signup.</li>
        <li><b>Account (once the product opens):</b> name, email, timezone, notification preferences, your product and brand information, and access tokens for platforms you connect, encrypted at rest.</li>
        <li><b>Payments:</b> handled by our merchant of record. We receive your plan and billing status, not your full card details.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run the waitlist, show your position and count your referrals (our legitimate interest, and to do what you asked).</li>
        <li>To email you about the launch and early access (your consent, which you can withdraw at any time).</li>
        <li>To provide the product and support (performance of our contract with you).</li>
        <li>To keep the service secure and prevent abuse (our legitimate interest).</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        Service providers that host or process data for us under contract: database and hosting (Supabase, Vercel), email delivery
        (Resend), payments (our merchant of record), error monitoring and product analytics, and AI providers that generate drafts
        from your product information. We do not sell your personal data.
      </p>

      <h2>International transfers</h2>
      <p>
        Our providers may process data outside the UK and EU, including in the United States. Where they do, we rely on safeguards
        such as standard contractual clauses.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Waitlist data is kept until launch plus 12 months, or until you ask us to delete it. Account data is kept while your account is
        open and deleted within 30 days of closing it, except where we must keep records by law.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live (including under the UK GDPR, EU GDPR and California CCPA), you can ask to access, correct, export
        or delete your data, object to or restrict processing, and withdraw consent. Every marketing email has an unsubscribe link.
        To make a request, email {mail}. You can also complain to your local data protection authority.
      </p>

      <h2>Founders&apos; waitlists</h2>
      <p>
        When founders use {site.name} to run their own waitlists, they control their contacts&apos; data and we process it on their
        behalf under a data processing agreement.
      </p>

      <h2>Cookies</h2>
      <p>
        This site uses only cookies that are needed for it to work. If we add analytics or advertising cookies, we will ask visitors
        in the UK and EU for consent first.
      </p>

      <h2>Contact</h2>
      <p>{e} · {mail}</p>
    </LegalPage>
  );
}
