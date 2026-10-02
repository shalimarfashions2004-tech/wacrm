import { afterEach, describe, expect, it, vi } from 'vitest'
import { INVALID_META_ACCESS_TOKEN_MESSAGE, isValidMetaAccessToken } from './access-token-input'
import { verifyPhoneNumber } from './meta-api'
import { explainMetaError } from './meta-error-explain'

afterEach(() => vi.unstubAllGlobals())

describe('connection credential input', () => {
  it.each(['', 'Meta → System Users', 'token with spaces', 'token\r\nInjected: value', 'token\u200b', '“token”', 'Bearer token', '••••••••', null, 123])(
    'rejects malformed input without making a provider request: %s',
    async (value) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      expect(isValidMetaAccessToken(value)).toBe(false)
      try {
        await verifyPhoneNumber({ phoneNumberId: '123', accessToken: value as string })
        expect.fail('Expected invalid credential input to fail')
      } catch (error) {
        const explanation = explainMetaError(error, 'verify_number')
        expect(explanation).toMatchObject({
          field: 'access_token', side: 'user', httpStatus: 400,
          summary: INVALID_META_ACCESS_TOKEN_MESSAGE,
          metaMessage: INVALID_META_ACCESS_TOKEN_MESSAGE,
        })
      }
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('passes an opaque header-safe token unchanged to the provider', async () => {
    const token = 'dummy_AZaz09.-~+/=='
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: '123' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(verifyPhoneNumber({ phoneNumberId: '123', accessToken: token })).resolves.toEqual({ id: '123' })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`)
  })
})
