/** Explain an explicit Graph 4xx rejection without exposing its raw payload.
 * Network errors, malformed bodies and server failures remain uncertain.
 */
export function explainSendRejection(
  error: unknown
): { code: number; message: string } | null {
  if (!(error instanceof Error) || error.name !== 'MetaApiError') return null;
  const meta = error as Error & { code?: number | null; httpStatus?: number };
  if (
    typeof meta.code !== 'number' ||
    !Number.isInteger(meta.code) ||
    typeof meta.httpStatus !== 'number' ||
    meta.httpStatus < 400 ||
    meta.httpStatus >= 500
  )
    return null;
  let reason: string;
  if (meta.code === 0 || meta.code === 190) {
    reason =
      'Meta rejected authentication. In Settings → WhatsApp, test the saved connection and check the token’s whatsapp_business_messaging permission and WhatsApp account access.';
  } else if (
    meta.code === 10 ||
    meta.code === 131005 ||
    (meta.code >= 200 && meta.code <= 299)
  ) {
    reason =
      'The saved token does not have permission to send for this WhatsApp account. Check the system user’s account assignment and whatsapp_business_messaging permission in Meta.';
  } else if (meta.code === 131042) {
    reason =
      'Meta rejected the message because of a payment or billing eligibility issue. Check this WhatsApp account’s payment settings in Meta.';
  } else if (meta.code === 131047) {
    reason =
      'Meta says the 24-hour reply window is closed. Wait for a new customer message before sending a free-text reply.';
  } else if (meta.code === 133010) {
    reason =
      'Meta says this sender is not registered. Check Verify Registration in Settings → WhatsApp.';
  } else if (meta.code === 131031 || meta.code === 368) {
    reason =
      'Meta has restricted this WhatsApp account. Check Account Quality in Meta.';
  } else if (
    [4, 17, 32, 613, 80007, 130429, 131048, 131056].includes(meta.code)
  ) {
    reason =
      'Meta is limiting message requests. Wait and review the account’s messaging limits before another attempt.';
  } else {
    reason =
      'Meta rejected this message. Check the sender, recipient and message settings before another attempt.';
  }
  return {
    code: meta.code,
    message: `${reason} No message was accepted by this request. (Meta code ${meta.code})`,
  };
}
