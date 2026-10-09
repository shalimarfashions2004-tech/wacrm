/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles and Supabase row fixtures are intentionally structural. */
import { describe, expect, it } from 'vitest';
import { readTallyXml } from '../src/tally-xml';
const response = (body: string, type = 'text/xml') => new Response(body, { status: 200, headers: { 'content-type': type } });
const fetcher = (r: Response) => async () => r;
describe('readTallyXml', () => {
  it('accepts localhost and returns a document', async () => { const doc = await readTallyXml('http://127.0.0.1:9000', '<Export/>', { fetchImpl: fetcher(response('<ROOT><NAME>ok</NAME></ROOT>')) }); expect((doc as any).documentElement.tagName).toBe('ROOT'); });
  it('rejects non-whitespace outside the root and URL userinfo', async () => { await expect(readTallyXml('http://localhost:9000', '<x/>', { fetchImpl: fetcher(response('junk<x/>')) })).rejects.toThrow(/Malformed/); await expect(readTallyXml('http://user:pass@localhost:9000', '<x/>')).rejects.toThrow(/localhost/); });
  it.each(['<<ROOT/>', '<ROOT/>< '])('rejects malformed surrounding tokens %s', async (body) => { await expect(readTallyXml('http://localhost:9000', '<x/>', { fetchImpl: fetcher(response(body)) })).rejects.toThrow(/Malformed/); });
  it('rejects non-local URLs', async () => { await expect(readTallyXml('http://192.168.1.2:9000', '<x/>')).rejects.toThrow(/localhost/); });
  it('rejects malformed XML and DTDs', async () => { await expect(readTallyXml('http://localhost:9000', '<x>', { fetchImpl: fetcher(response('<x>')) })).rejects.toThrow(/Malformed/); await expect(readTallyXml('http://localhost:9000', '<x/>', { fetchImpl: fetcher(response('<!DOCTYPE x SYSTEM "evil"><x/>')) })).rejects.toThrow(/DTD/); });
  it('rejects non XML responses and oversized responses', async () => { await expect(readTallyXml('http://localhost:9000', '<x/>', { fetchImpl: fetcher(response('{}', 'application/json')) })).rejects.toThrow(/not XML/); await expect(readTallyXml('http://localhost:9000', '<x/>', { maxResponseBytes: 3, fetchImpl: fetcher(response('<x/>')) })).rejects.toThrow(/size limit/); });
});
