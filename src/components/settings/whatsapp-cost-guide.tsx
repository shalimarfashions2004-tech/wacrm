'use client';
import { AiCostEstimate } from '@/components/agents/ai-cost-estimate';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

const format = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
/** Published India marketing quote read from Meta's calculator on 7 October 2026.
 * An estimate only: never drives the protected spending ledger or provider bill.
 */
export function WhatsAppCostGuide() {
  const [quantity, setQuantity] = useState(100);
  const [serviceQuantity, setServiceQuantity] = useState(1000);
  return (
    <section
      className="border-border bg-card space-y-4 rounded-[22px] border p-5"
      aria-label="WhatsApp costs"
    >
      <h3 className="font-medium">Where your WhatsApp money goes</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium">Actual balance and bill</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Open Meta Billing &amp; payments, choose WhatsApp accounts, then
            Shalimar Fashions. Payment activity shows top-ups and charges. This
            CRM does not read your Meta balance.
          </p>
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm underline"
            href="https://business.facebook.com/latest/billing_hub?business_id=965749722599371"
          >
            Open Meta Billing &amp; payments
          </a>
        </div>
        <div>
          <p className="text-sm font-medium">CRM allowance</p>
          <p className="text-muted-foreground mt-1 text-sm">
            The ₹1,000 monthly campaign and workflow ceiling is a limit, not a
            payment. ₹2 is reserved per attempt, including failed or uncertain
            attempts. Manual Inbox replies, AI-provider usage, subscriptions and
            activity outside this CRM are separate.
          </p>
        </div>
      </div>
      <div className="bg-card-2 space-y-2 rounded-2xl p-4">
        <label
          className="text-sm font-medium"
          htmlFor="marketing-estimate-count"
        >
          Estimate an India marketing broadcast
        </label>
        <Input
          id="marketing-estimate-count"
          type="number"
          min={0}
          max={100000}
          value={quantity}
          className="max-w-40"
          onChange={(e) =>
            setQuantity(
              Math.min(
                100000,
                Math.max(0, Math.floor(Number(e.target.value) || 0))
              )
            )
          }
        />
        <p className="text-sm">
          {quantity} delivered messages × ₹0.8631 ≈{' '}
          <strong>{format(quantity * 0.8631)}</strong> before applicable taxes.
        </p>
        <p className="text-sm">
          CRM reservation for {quantity} attempts:{' '}
          <strong>{format(quantity * 2)}</strong>.
        </p>
        <p className="text-muted-foreground text-xs">
          Published quote checked 7 October 2026; confirm current pricing before
          sending. An image header plus its template text is one template
          message. Sending English and Malayalam separately doubles the message
          count. Meta may stop delivery earlier if your balance is insufficient.
        </p>
      </div>
      <p className="text-muted-foreground text-sm">
        Normal Inbox replies use service pricing within 24 hours of the
        customer’s latest message. Meta’s FAQ says the first 1,000 service
        messages per phone number each month are free, with paid delivery from
        message 1,001 starting 1 October 2026. Its main pricing page still says
        service replies are free; confirm the applicable service rate in Meta
        Billing. A promotional template is charged as marketing even if sent to
        one person from Inbox.
      </p>
      <div className="bg-card-2 space-y-2 rounded-2xl p-4">
        <label htmlFor="service-estimate-count" className="text-sm font-medium">
          Estimate normal India chat replies this month
        </label>
        <Input
          id="service-estimate-count"
          type="number"
          min={0}
          max={100000}
          className="max-w-40"
          value={serviceQuantity}
          onChange={(e) =>
            setServiceQuantity(
              Math.min(
                100000,
                Math.max(0, Math.floor(Number(e.target.value) || 0))
              )
            )
          }
        />
        <p className="text-sm">
          First 1,000 service messages: free. Estimated paid replies:{' '}
          {Math.max(0, serviceQuantity - 1000)} × ₹0.115 ≈{' '}
          <strong>{format(Math.max(0, serviceQuantity - 1000) * 0.115)}</strong>{' '}
          before taxes.
        </p>
        <p className="text-muted-foreground text-xs">
          This assumes Meta’s October 2026 FAQ applies and this is the total
          service-message count across the whole business number. Messages from
          other systems also use the free allowance. Promotional templates use
          marketing pricing. This estimate excludes AI usage.
        </p>
      </div>
      <AiCostEstimate />
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
          href="https://whatsappbusiness.com/products/platform-pricing/"
        >
          Meta rate calculator
        </a>
        <a
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
          href="https://whatsappbusiness.com/resources/faq/"
        >
          Current Meta billing FAQ
        </a>
      </div>
    </section>
  );
}
