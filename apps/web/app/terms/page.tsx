import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Terms() {
  const e = site.legalEntity;
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern your use of {site.name} (the &ldquo;Service&rdquo;), operated by {e} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an
        account, joining the waitlist or buying a plan, you agree to them.
      </p>

      <h2>1. The Service</h2>
      <p>
        {site.name} helps founders launch and market their products. It drafts launch assets, posts, replies, emails, visuals and ads,
        and can publish them to connected platforms on your behalf.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 and able to enter a contract.</li>
        <li>You are responsible for your account, your connected platform accounts and everything published under them.</li>
        <li>Keep your login secure and tell us promptly about any unauthorised use.</li>
      </ul>

      <h2>3. Approvals, automation and limits</h2>
      <ul>
        <li>By default nothing posts, sends or spends without your approval. If you turn on trust mode, items that pass our checks may be approved automatically within the rules you set.</li>
        <li>Ad spend is always capped by the daily and total limits you set. Ad spend is paid by you directly to the ad platform and is not part of your {site.name} plan.</li>
        <li>You are responsible for following the rules of each platform you connect (for example X, LinkedIn, Reddit, Meta and Google). We may block or pause actions that we believe would break those rules.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of your content, brand assets and data, including your waitlist contacts. You give us a licence to process
        them only to provide the Service. Content we generate for you is yours to use once you approve it. You must have the rights to
        anything you upload and must not use the Service to publish unlawful, deceptive or infringing material, including fake reviews.
      </p>

      <h2>5. AI-generated output</h2>
      <p>
        Drafts are produced with AI and can contain mistakes. Review them before approving. We do not guarantee any particular number
        of users, signups or sales.
      </p>

      <h2>6. Plans, billing and cancellation</h2>
      <ul>
        <li>Prices are shown on our <Link href="/pricing">pricing page</Link> in USD, GBP and EUR. Payments are processed by our merchant of record, which also handles sales tax and VAT.</li>
        <li>Subscriptions renew automatically each month until cancelled. You can cancel at any time; access continues until the end of the paid period.</li>
        <li>Each plan includes usage caps shown in your account. When a cap is reached, generation pauses until the next period.</li>
        <li>Refunds are covered by our <Link href="/refund">refund policy</Link>.</li>
      </ul>

      <h2>7. Acceptable use</h2>
      <p>
        Do not use the Service to send spam, scrape or misuse platform data, impersonate others, run prohibited ad categories, or
        attempt to break, overload or reverse-engineer the Service.
      </p>

      <h2>8. Suspension and termination</h2>
      <p>
        We may suspend or close accounts that break these terms or put platforms, other users or us at risk. You can close your account
        at any time and export or delete your data.
      </p>

      <h2>9. Disclaimers and liability</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for indirect or consequential losses,
        lost profits, or actions taken by third-party platforms (such as account restrictions), and our total liability is limited to
        the amount you paid us in the 12 months before the claim. Nothing in these terms limits rights you have under consumer law
        that cannot be excluded.
      </p>

      <h2>10. Changes</h2>
      <p>We may update these terms. If changes are material, we will tell you by email or in the product before they take effect.</p>

      <h2>11. Contact</h2>
      <p>
        {e} · <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
      </p>
    </LegalPage>
  );
}
