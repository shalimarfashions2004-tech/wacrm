import { createHash } from 'node:crypto';

export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export interface XmlNode { tagName: string; textContent: string; children: XmlNode[]; getElementsByTagName(name: string): XmlNode[] }
export class SafeXmlDocument {
  constructor(public readonly raw: string, public readonly documentElement: XmlNode) {}
}

function localName(tag: string) { return tag.includes(':') ? tag.slice(tag.lastIndexOf(':') + 1) : tag; }
function node(tagName: string): XmlNode {
  const children: XmlNode[] = [];
  const n: XmlNode = { tagName, children, textContent: '', getElementsByTagName: (name) => {
    const out: XmlNode[] = []; const wanted = localName(name).toLowerCase();
    const visit = (x: XmlNode) => { if (localName(x.tagName).toLowerCase() === wanted) out.push(x); x.children.forEach(visit); };
    visit(n); return out;
  }}; return n;
}

function parseXml(raw: string): SafeXmlDocument {
  if (!raw.trim().startsWith('<')) throw new Error('Malformed XML');
  if (/<!DOCTYPE|<!ENTITY|\bSYSTEM\b|\bPUBLIC\b/i.test(raw)) throw new Error('DTD and external entities are not allowed');
  const root: XmlNode = node('__root__'); const stack = [root];
  const token = /<!--[\s\S]*?-->|<\?[^>]*\?>|<\/?([A-Za-z_][\w:.-]*)(?:\s[^>]*)?\/?>|([^<]+)/g;
  let match: RegExpExecArray | null; let sawRoot = false; let consumed = 0;
  while ((match = token.exec(raw))) { consumed = token.lastIndex;
    const full = match[0]; if (full.startsWith('<!--') || full.startsWith('<?')) continue;
    if (!full.startsWith('<') && !sawRoot && full.trim() !== '') throw new Error('Malformed XML');
    if (!full.startsWith('<') && sawRoot && stack.length === 1 && full.trim() !== '') throw new Error('Malformed XML');
    if (full.startsWith('</')) { const name = match[1]; if (stack.length === 1 || localName(stack.pop()!.tagName).toLowerCase() !== localName(name).toLowerCase()) throw new Error('Malformed XML'); continue; }
    if (full.startsWith('<')) { const name = match[1]; const child = node(name); stack[stack.length - 1].children.push(child); if (stack.length === 1) { if (sawRoot) throw new Error('Malformed XML'); sawRoot = true; } if (!/\/\s*>$/.test(full)) stack.push(child); continue; }
    stack[stack.length - 1].textContent += full;
  }
  if (!sawRoot || stack.length !== 1 || raw.slice(consumed).trim() !== '') throw new Error('Malformed XML');
  const rootNode = root.children[0]; return new SafeXmlDocument(raw, rootNode);
}

export async function readTallyXml(url: string, requestXml: string, options: { maxResponseBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<Document> {
  let parsed: URL; try { parsed = new URL(url); } catch { throw new Error('Tally URL must be localhost'); }
  if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) throw new Error('Tally URL must be localhost');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(parsed, { method: 'POST', body: requestXml, headers: { 'content-type': 'text/xml; charset=utf-8', accept: 'text/xml, application/xml' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Tally response failed (${response.status})`);
    const contentType = response.headers.get('content-type') ?? ''; if (contentType && !/xml/i.test(contentType)) throw new Error('Tally response is not XML');
    const max = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES; const reader = response.body?.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
    if (reader) { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > max) throw new Error('Tally response exceeds size limit'); chunks.push(part.value); } }
    else { const text = await response.text(); if (new TextEncoder().encode(text).byteLength > max) throw new Error('Tally response exceeds size limit'); return parseXml(text) as unknown as Document; }
    const data = new Uint8Array(bytes); let offset = 0; for (const c of chunks) { data.set(c, offset); offset += c.byteLength; }
    return parseXml(new TextDecoder().decode(data)) as unknown as Document;
  } finally { clearTimeout(timeout); }
}

export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function text(node: XmlNode | undefined): string { return node?.textContent.trim() ?? ''; }
export function descendants(root: XmlNode, name: string): XmlNode[] { return root.getElementsByTagName(name).filter((x) => x !== root); }
