import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Sub-processors' };

export default function Page() {
  const mail = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Sub-processors">
      <p>The companies that process data for {site.name}, what for, and where.</p>
      <table className="legal-table">
        <thead><tr><th>Provider</th><th>What for</th><th>Where</th></tr></thead>
        <tbody>
          <tr><td>Supabase</td><td>Database, sign-in, file storage</td><td>EU / US</td></tr>
          <tr><td>Netlify or Vercel</td><td>Hosting the app and website</td><td>Global</td></tr>
          <tr><td>Anthropic</td><td>AI that drafts posts, replies and analyses from your product information</td><td>US</td></tr>
          <tr><td>Image and video model providers (fal or Replicate)</td><td>Generating images for posters and videos</td><td>US</td></tr>
          <tr><td>Resend</td><td>Sending email</td><td>US</td></tr>
          <tr><td>Dodo Payments</td><td>Merchant of record: checkout, billing, tax</td><td>Global</td></tr>
          <tr><td>Pexels</td><td>Licensed stock footage (no personal data shared)</td><td>Global</td></tr>
          <tr><td>Meta and Google (only if you run ads)</td><td>Running the ads you approve</td><td>Global</td></tr>
        </tbody>
      </table>
      <p>We give notice before adding a new sub-processor. Questions: {mail}.</p>
    </LegalPage>
  );
}
