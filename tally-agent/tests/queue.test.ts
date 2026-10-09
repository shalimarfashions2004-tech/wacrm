import { describe, expect, it } from 'vitest';
import { BoundedQueue } from '../src/queue';
describe('BoundedQueue', () => {
  it('bounds items and tracks retry metadata without retaining error text', () => { const q = new BoundedQueue<{ value: number }>(1); const item = q.enqueue({ value: 1 }, 'a'); expect(() => q.enqueue({ value: 2 })).toThrow(/full/); q.markRetry('a', new Error('secret token')); const retry = q.peek(Date.now() + 2000); expect(retry?.attempts).toBe(1); expect(retry?.lastError).toBe('retry failed'); expect(retry?.lastError).not.toContain('secret'); q.remove('a'); expect(q.size).toBe(0); });
});
