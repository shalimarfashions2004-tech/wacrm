'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { AI_RATES, AI_RATE_CHECKED_ON } from '@/lib/ai/costs';
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
  }).format(n);
const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
export function AiCostEstimate({
  recorded,
}: {
  recorded?: {
    estimatedUsd: number;
    unpricedCalls: number;
    pricedCalls: number;
    rateCheckedOn: string;
  };
}) {
  const [calls, setCalls] = useState(1000);
  const [input, setInput] = useState(1000);
  const [output, setOutput] = useState(200);
  const [fx, setFx] = useState(90);
  const fields = [
    {
      id: 'ai-cost-calls',
      label: 'AI replies or drafts',
      value: calls,
      set: setCalls,
    },
    {
      id: 'ai-cost-input',
      label: 'Input tokens per reply',
      value: input,
      set: setInput,
    },
    {
      id: 'ai-cost-output',
      label: 'Output tokens per reply',
      value: output,
      set: setOutput,
    },
    {
      id: 'ai-cost-fx',
      label: 'Planning ₹ per US$ (editable assumption)',
      value: fx,
      set: setFx,
    },
  ];
  return (
    <section
      className="bg-card-2 space-y-3 rounded-2xl p-4"
      aria-label="AI cost estimate"
    >
      <h3 className="text-sm font-medium">
        AI costs, separate from WhatsApp charges
      </h3>
      {recorded && (
        <p className="text-sm">
          Recorded usage at current published rates:{' '}
          <strong>{usd(recorded.estimatedUsd)}</strong> for{' '}
          {recorded.pricedCalls} logged calls.{' '}
          {recorded.unpricedCalls > 0 && (
            <strong>
              {recorded.unpricedCalls} calls have no verified rate and are
              excluded.
            </strong>
          )}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        An estimate, not your provider balance or invoice. Missing logs,
        embeddings, tests, taxes, exchange fees and usage outside this CRM are
        excluded. Cached-input discounts are not applied. No AI spending cap is
        enforced by this display.
      </p>
      <details>
        <summary className="cursor-pointer text-sm">
          Plan the cost of AI replies
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.id} htmlFor={f.id} className="space-y-1 text-xs">
              {f.label}
              <Input
                id={f.id}
                type="number"
                min={0}
                max={1000000}
                value={f.value}
                onChange={(e) =>
                  f.set(
                    Math.min(1000000, Math.max(0, Number(e.target.value) || 0))
                  )
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {AI_RATES.map((rate) => {
            const total =
              (calls * (input * rate.input + output * rate.output)) / 1000000;
            return (
              <p key={rate.provider} className="text-sm">
                <a
                  href={rate.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {rate.label}
                </a>
                : {usd(total)} ≈ {inr(total * fx)} for {calls} replies.
              </p>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Rates checked {AI_RATE_CHECKED_ON}. These are examples, not
          confirmation of your saved model. Input includes the customer message,
          conversation history, instructions and retrieved knowledge. Longer
          chats and Malayalam token counts can change the cost. A draft costs AI
          usage even if you never send it.
        </p>
      </details>
      <div className="flex flex-wrap gap-4 text-xs">
        <a
          className="underline"
          href="https://platform.openai.com/usage"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenAI actual usage
        </a>
        <a
          className="underline"
          href="https://platform.claude.com/settings/usage"
          target="_blank"
          rel="noopener noreferrer"
        >
          Claude actual usage
        </a>
        <a className="underline" href="/settings?tab=whatsapp">
          WhatsApp costs and campaign allowance
        </a>
      </div>
    </section>
  );
}
