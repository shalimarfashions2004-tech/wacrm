import { getInboxReplyApproval } from './delivery-policy';

// An in-process capability, never accepted from HTTP JSON. Only the send core
// issues it after account, opt-out and service-window checks succeed.
export interface InboxReplyPermit {
  readonly phoneNumberId: string;
  readonly to: string;
  readonly expiresAt: number;
}
const issued = new WeakSet<InboxReplyPermit>();

export function issueInboxReplyPermit(
  phoneNumberId: string,
  to: string,
  inboundAt: number
): InboxReplyPermit {
  const permit = Object.freeze({
    phoneNumberId,
    to,
    expiresAt: Math.min(inboundAt + 24 * 60 * 60 * 1000, Date.now() + 30_000),
  });
  issued.add(permit);
  return permit;
}

export function isInboxReplyPermitted(args: {
  phoneNumberId: string;
  to: string;
  inboxReplyPermit?: InboxReplyPermit;
}): boolean {
  const permit = args.inboxReplyPermit;
  const approval = getInboxReplyApproval();
  return Boolean(
    permit &&
    issued.has(permit) &&
    approval &&
    permit.phoneNumberId === approval.phoneNumberId &&
    permit.phoneNumberId === args.phoneNumberId &&
    permit.to === args.to &&
    permit.expiresAt > Date.now()
  );
}
