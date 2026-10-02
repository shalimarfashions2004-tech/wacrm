export const INVALID_META_ACCESS_TOKEN_MESSAGE =
  'Permanent Access Token contains invalid characters. Copy only the token from Meta, without labels, spaces, quotes or instructions, and paste it into Permanent Access Token.'

/** Check header-safe bearer token syntax, without inspecting or echoing credentials. */
export function isValidMetaAccessToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._~+/-]+=*$/.test(value)
}

export class InvalidMetaAccessTokenError extends Error {
  constructor() {
    super(INVALID_META_ACCESS_TOKEN_MESSAGE)
    this.name = 'InvalidMetaAccessTokenError'
  }
}
