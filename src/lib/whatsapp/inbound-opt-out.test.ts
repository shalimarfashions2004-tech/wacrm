import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { persistInboundOptOut } from './inbound-opt-out'

type MockDb = {
  calls: { table: string; operation: string; payload?: unknown }[]
  from: (table: string) => Record<string, unknown>
}

function makeDb(): MockDb {
  const calls: { table: string; operation: string; payload?: unknown }[] = []
  return {
    calls,
    from(table: string) {
      const chain: Record<string, unknown> = {
        update: (payload: unknown) => {
          calls.push({ table, operation: 'update', payload })
          return chain
        },
        upsert: (payload: unknown) => {
          calls.push({ table, operation: 'upsert', payload })
          return chain
        },
        eq: () => chain,
        then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
      }
      return chain
    },
  } as MockDb
}

describe('inbound WhatsApp opt-out persistence', () => {
  it('ignores ordinary inbound text', async () => {
    const db = makeDb()
    await expect(
      persistInboundOptOut(db as unknown as SupabaseClient, {
        accountId: 'a1',
        contactId: 'c1',
        messageId: 'm1',
        text: 'new stock',
      }),
    ).resolves.toBe(false)
    expect(db.calls).toHaveLength(0)
  })

  it('writes hard suppression and consent opt-out evidence', async () => {
    const db = makeDb()
    await expect(
      persistInboundOptOut(db as unknown as SupabaseClient, {
        accountId: 'a1',
        contactId: 'c1',
        messageId: 'm1',
        text: 'STOP',
        at: '2026-10-01T10:00:00.000Z',
      }),
    ).resolves.toBe(true)
    expect(db.calls.map((call) => [call.table, call.operation])).toEqual([
      ['contacts', 'update'],
      ['contact_consents', 'upsert'],
    ])
    expect(db.calls[1].payload).toMatchObject({
      account_id: 'a1',
      contact_id: 'c1',
      status: 'opted_out',
      source: 'whatsapp_inbound',
      revoked_at: '2026-10-01T10:00:00.000Z',
    })
  })
})
