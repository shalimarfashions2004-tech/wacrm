/** Small browser-memory cache for display reads, never for authorization or sending.
 * No credentials are retained in keys. Scope comes from the resolved account;
 * direct PostgREST requests must also carry that user's JWT. Writes, account
 * changes and refocusing invalidate reads, including pending cache fills.
 */
type Fetcher = typeof fetch;
interface Scope {
  userId: string;
  accountId: string;
  role: string;
}
interface Entry {
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  expires: number;
}

const TABLES = new Set([
  'contacts',
  'tags',
  'contact_tags',
  'custom_fields',
  'contact_custom_values',
  'pipelines',
  'pipeline_stages',
  'deals',
  'notifications',
  'automations',
  'quick_replies',
]);
const API_READS = new Set([
  '/api/flows',
  '/api/flows/templates',
  '/api/ai/knowledge',
  '/api/tags',
]);
const TTL_MS = 10_000;
// Explicit application state for a sanitized screen snapshot. HTTP responses
// remain no-store; this is per-tab memory, like already-rendered form state.
const VIEW_READS = new Set(['/api/settings/snapshot']);
const VIEW_TTL_MS = 60_000;
const MAX_ENTRIES = 64;
const MAX_BYTES = 256_000;

function tokenUser(header: string | null): string | null {
  // This is a cache-partition check only. The backend still verifies the JWT.
  try {
    const token = header?.match(/^Bearer (.+)$/i)?.[1];
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    );
    return typeof claims.sub === 'string' &&
      typeof claims.exp === 'number' &&
      claims.exp * 1000 > Date.now()
      ? claims.sub
      : null;
  } catch {
    return null;
  }
}

export class AccountReadCache {
  private scope: Scope | null = null;
  private generation = 0;
  private scopeGeneration = 0;
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<Response>>();
  constructor(
    private transport: Fetcher,
    private supabaseOrigin: string,
    private appOrigin: () => string
  ) {}

  setScope(next: Scope | null) {
    if (JSON.stringify(this.scope) !== JSON.stringify(next)) {
      this.scopeGeneration++;
      this.invalidate();
    }
    this.scope = next ? { ...next } : null;
  }
  invalidate() {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
  }

  fetch: Fetcher = (input, init) => this.read(input, init, false);
  viewFetch: Fetcher = (input, init) => this.read(input, init, true);

  private async read(
    input: Parameters<Fetcher>[0],
    init: Parameters<Fetcher>[1],
    view: boolean
  ) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), this.appOrigin());
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const database =
      url.origin === this.supabaseOrigin &&
      url.pathname.startsWith('/rest/v1/');
    const application =
      url.origin === this.appOrigin() && url.pathname.startsWith('/api/');
    if ((database || application) && !['GET', 'HEAD'].includes(method)) {
      this.invalidate();
      try {
        return await this.transport(input, init);
      } finally {
        this.invalidate();
      }
    }
    const headers = new Headers(init?.headers ?? request?.headers);
    const scope = this.scope;
    const table = url.pathname.slice('/rest/v1/'.length);
    const sensitiveQuery = Array.from(url.searchParams.keys()).some((key) =>
      /token|secret|api.?key|password|pin|authorization/i.test(key)
    );
    const viewEligible =
      view &&
      application &&
      VIEW_READS.has(url.pathname) &&
      !url.search &&
      method === 'GET' &&
      !headers.has('authorization');
    const eligible =
      scope &&
      ['GET', 'HEAD'].includes(method) &&
      !init?.signal &&
      !request &&
      !sensitiveQuery &&
      !/token|secret|api_key|password|registration_pin|messages|conversations|profiles|accounts|automation_steps|consent|budget|ledger|approval|delivery/i.test(
        url.searchParams.get('select') ?? ''
      ) &&
      ((!view &&
        database &&
        TABLES.has(table) &&
        tokenUser(headers.get('authorization')) === scope.userId) ||
        (!view &&
          application &&
          API_READS.has(url.pathname) &&
          init?.credentials !== 'omit') ||
        (viewEligible && init?.credentials !== 'omit'));
    if (!eligible) return this.transport(input, init);
    if (init?.cache === 'no-store' || init?.cache === 'reload') {
      this.invalidate();
      if (!viewEligible) return this.transport(input, init);
      // A forced view refresh still updates application state for the next
      // screen, while bypassing every HTTP cache and the old memory entry.
    }
    const key = JSON.stringify([
      scope,
      view,
      method,
      url.href,
      [
        'accept',
        'prefer',
        'range',
        'range-unit',
        'accept-profile',
        'content-profile',
      ].map((h) => headers.get(h)),
    ]);
    const stored = this.entries.get(key);
    if (stored && stored.expires > Date.now()) return restore(stored);
    if (stored) this.entries.delete(key);
    let work = this.pending.get(key);
    const scopeGeneration = this.scopeGeneration;
    if (!work) {
      const generation = this.generation;
      work = (async () => {
        const response = await this.transport(input, init);
        // PostgREST paginated lists can return 206 with a Content-Range count.
        // Leave errors and large/non-JSON responses intact, including streaming.
        if (
          ![200, 206].includes(response.status) ||
          (!viewEligible &&
            /no-store/i.test(response.headers.get('cache-control') ?? '')) ||
          response.headers.get('x-crm-view-cache') === 'skip' ||
          !response.headers.get('content-type')?.includes('application/json') ||
          Number(response.headers.get('content-length')) > MAX_BYTES
        )
          return response;
        const body = await boundedBody(response);
        if (body !== null && generation === this.generation) {
          const entry: Entry = {
            body,
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
            expires: Date.now() + (viewEligible ? VIEW_TTL_MS : TTL_MS),
          };
          if (this.entries.size >= MAX_ENTRIES)
            this.entries.delete(this.entries.keys().next().value!);
          this.entries.set(key, entry);
        }
        return response;
      })();
      this.pending.set(key, work);
    }
    try {
      const response = await work;
      if (scopeGeneration !== this.scopeGeneration)
        throw new DOMException('Account changed', 'AbortError');
      return response.clone();
    } finally {
      if (this.pending.get(key) === work) this.pending.delete(key);
    }
  }
}

function restore(entry: Entry) {
  return new Response(entry.body || null, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

async function boundedBody(response: Response): Promise<string | null> {
  const reader = response.clone().body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        // Do not await tee cancellation: the caller still needs the original.
        void reader.cancel().catch(() => {});
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
export const crmReadCache = new AccountReadCache(
  (input, init) => globalThis.fetch(input, init),
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : '',
  () =>
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin
);
export const crmFetch: Fetcher = (input, init) =>
  crmReadCache.fetch(input, init);
export const crmViewFetch: Fetcher = (input, init) =>
  crmReadCache.viewFetch(input, init);
