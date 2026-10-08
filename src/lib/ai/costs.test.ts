import { describe, it, expect } from 'vitest';
import { estimateAiCostUsd, summarizeAiCost } from './costs';
describe('AI cost estimates', () => {
  it('uses both input and output rates with million-token units', () => {
    expect(
      estimateAiCostUsd({
        provider: 'openai',
        model: 'gpt-5.4-mini',
        prompt_tokens: 1000,
        completion_tokens: 200,
      })
    ).toBeCloseTo(0.00165);
    expect(
      estimateAiCostUsd({
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        prompt_tokens: 1000,
        completion_tokens: 200,
      })
    ).toBeCloseTo(0.002);
  });
  it('reports unknown models instead of treating them as free', () => {
    expect(
      summarizeAiCost([
        {
          provider: 'openai',
          model: 'unknown',
          prompt_tokens: 1000,
          completion_tokens: 200,
        },
      ])
    ).toMatchObject({ unpricedCalls: 1, pricedCalls: 0 });
  });
  it.each([-1, NaN, Infinity])('does not price invalid usage %s', (value) => {
    expect(
      estimateAiCostUsd({
        provider: 'openai',
        model: 'gpt-5.4-mini',
        prompt_tokens: value,
        completion_tokens: 200,
      })
    ).toBeNull();
  });
});
