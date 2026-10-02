import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Refund Policy' };

export default function Refund() {
  const mail = <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>;
  return (
    <LegalPage title="Refund Policy">
      <p>We want you to feel the product working. If it doesn&apos;t, here&apos;s how refunds work.</p>

      <h2>Launch Pass (one-time)</h2>
      <ul>
        <li>Full refund within 14 days of purchase if you have not yet approved or exported any assets from your launch kit.</li>
        <li>If you have used part of the kit, we will review partial refund requests within 14 days of purchase case by case.</li>
      </ul>

      <h2>Grow and Scale (monthly)</h2>
      <ul>
        <li>Cancel any time from your account. You keep access until the end of the month you paid for, and you will not be charged again.</li>
        <li>Your first payment on any plan is refundable within 7 days if you ask us.</li>
        <li>We don&apos;t refund partial months after that, except where the law requires it.</li>
      </ul>

      <h2>Our Grow guarantee</h2>
      <p>
        If {site.name} doesn&apos;t find at least 25 high-intent conversations for your product in your first 30 days on Grow or Scale,
        your next month is free.
      </p>

      <h2>Ad spend</h2>
      <p>
        Money spent on ads is paid directly to the ad platform (such as Meta or Google) and can&apos;t be refunded by us. Your spend
        caps and kill switch are there to keep it under your control.
      </p>

      <h2>UK and EU customers</h2>
      <p>
        You may have a legal right to cancel digital services within 14 days. When you start using the service straight away, you agree
        that this right ends once the service has been fully provided, and a partial refund may apply for the part not yet used.
      </p>

      <h2>How to ask</h2>
      <p>
        Email {mail} from the address on your account with your order number. Approved refunds go back to your original payment method
        through our merchant of record, usually within 5–10 business days.
      </p>
    </LegalPage>
  );
}
