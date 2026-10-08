/** Published standard text rates checked 7 October 2026. Estimates, not invoices.
 * Unknown models are never silently priced at zero. Cache savings, taxes, FX,
 * embeddings, failed/unlogged calls and non-CRM activity are excluded.
 */
export const AI_RATE_CHECKED_ON = '2026-10-07';
export const AI_RATES = [
  {
    provider: 'openai',
    models: ['gpt-5.4-mini'],
    label: 'GPT-5.4 mini',
    input: 0.75,
    output: 4.5,
    source: 'https://developers.openai.com/api/docs/models/gpt-5.4-mini',
  },
  {
    provider: 'anthropic',
    models: ['claude-haiku-4-5', 'claude-haiku-4-5-20251001'],
    label: 'Claude Haiku 4.5',
    input: 1,
    output: 5,
    source: 'https://platform.claude.com/docs/en/about-claude/pricing',
  },
] as const;
export interface CostUsage {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}
export function estimateAiCostUsd(usage: CostUsage): number | null {
  const rate = AI_RATES.find(
    (r) =>
      r.provider === usage.provider &&
      (r.models as readonly string[]).includes(usage.model)
  );
  if (
    !rate ||
    !Number.isFinite(usage.prompt_tokens) ||
    !Number.isFinite(usage.completion_tokens) ||
    usage.prompt_tokens < 0 ||
    usage.completion_tokens < 0
  )
    return null;
  return (
    (usage.prompt_tokens * rate.input + usage.completion_tokens * rate.output) /
    1_000_000
  );
}
export function summarizeAiCost(rows: CostUsage[]) {
  let estimatedUsd = 0;
  let unpricedCalls = 0;
  for (const row of rows) {
    const cost = estimateAiCostUsd(row);
    if (cost === null) unpricedCalls++;
    else estimatedUsd += cost;
  }
  return {
    estimatedUsd,
    unpricedCalls,
    pricedCalls: rows.length - unpricedCalls,
    rateCheckedOn: AI_RATE_CHECKED_ON,
  };
}
