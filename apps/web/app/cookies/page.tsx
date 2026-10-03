import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Cookie Policy' };

export default function Page() {
  const mail = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Cookie Policy">
      <p>We keep cookies to the ones {site.name} needs to work. No advertising cookies, no cross-site tracking.</p>

      <h2>Cookies we set</h2>
      <ul>
        <li><b>Sign-in</b> (<code>sb-…-auth-token</code>): keeps you logged in. Removed when you log out.</li>
        <li><b>Sidebar</b> (<code>sil_side</code>): remembers whether you collapsed the sidebar. One year.</li>
        <li><b>Referral</b> (<code>sil_ref</code>): remembers the founder who referred you, so they get their free month. 30 days.</li>
      </ul>

      <h2>Our tracking snippet on founders&apos; sites</h2>
      <p>
        The snippet founders add to their own sites counts visits and signups by channel. It sets no cookies and stores no
        personal data: it uses an anonymous id kept in that site&apos;s own storage.
      </p>

      <h2>Payments</h2>
      <p>Checkout runs on our merchant of record&apos;s pages, which set the cookies they need to take payment safely.</p>

      <h2>Changes</h2>
      <p>If we ever add analytics or advertising cookies, we will ask first. Questions: {mail}.</p>
    </LegalPage>
  );
}
