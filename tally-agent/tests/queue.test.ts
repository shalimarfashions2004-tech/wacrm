import { describe, expect, it } from 'vitest';
import { BoundedQueue } from '../src/queue';
describe('BoundedQueue', () => {
  it('bounds items and tracks retry metadata without retaining error text', () => { const q = new BoundedQueue<{ value: number }>(1); const id = crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`; q.enqueue({ value: 1 }, id); expect(() => q.enqueue({ value: 2 })).toThrow(/full/); q.markRetry(id, new Error('secret token')); const retry = q.peek(Date.now() + 2000); expect(retry?.attempts).toBe(1); expect(retry?.lastError).toBe('retry failed'); expect(retry?.lastError).not.toContain('secret'); q.remove(id); expect(q.size).toBe(0); });
});
