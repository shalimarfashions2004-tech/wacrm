import { describe, it, expect, vi } from 'vitest';
import { readPages, readBatches } from './read-pages';
describe('complete paginated selections', () => {
  it('does not silently lose rows beyond the default database response cap', async () => {
    const source = Array.from({ length: 2353 }, (_, id) => ({ id }));
    const query = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));
    expect(await readPages(query)).toEqual(source);
    expect(query).toHaveBeenCalledTimes(5);
  });
  it('refuses a partial audience when a later page fails', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ data: Array(500).fill({}), error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Consent unavailable' },
      });
    await expect(readPages(query)).rejects.toThrow('Consent unavailable');
  });
  it('bounds large ID filters', async () => {
    const ids = Array.from({ length: 1201 }, (_, i) => String(i));
    const read = vi.fn(async (batch: string[]) => batch);
    expect(await readBatches(ids, read)).toEqual(ids);
    expect(Math.max(...read.mock.calls.map(([batch]) => batch.length))).toBe(
      200
    );
  });
});
