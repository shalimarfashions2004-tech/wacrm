# Inbox authentication rejection — 7 October 2026

The owner reported that an Inbox reply did not arrive and CRM displayed “Delivery is unconfirmed.” A filtered read of production Vercel errors showed Meta returning “Authentication Error” for the send endpoint. The owner then ran Test Connection and supplied its explicit result: the saved access token had expired. No tokens, message contents or recipient numbers were read into this report.

The send core previously collapsed every provider exception into an uncertain-delivery warning after reserving a message row. It now distinguishes a structured Meta 4xx rejection with a numeric code from a network timeout, invalid response or server error. Definite rejections are saved as failed with a safe explanation; ambiguous attempts retain the existing warning and reservation. The change never retries or enables another delivery path. Provider logs now contain a disposition and numeric code rather than raw provider error text.

The owner must replace the expired token privately with a system-user token assigned to the existing WhatsApp account and carrying messaging/management permissions, then repeat Test Connection and Verify Registration. A successful configuration read does not itself prove delivery. Do not resend the previously failed content automatically.

Validation before deployment: 103 Vitest files / 1,169 tests passed, typecheck passed, and lint passed for all four changed code/test files. The focused rejection tests cover code zero, permission and payment rejections, 5xx ambiguity and failed error persistence. The application build and production deployment/readback are recorded separately when completed.

The campaign runtime work remains separate and disabled. Migration 050 was confirmed installed by the owner's SQL Editor receipt (INR 1,000/month, zero reserved, managed delivery OFF). The additional runtime migration is not part of this Inbox fix.

## Production and owner recovery readback

Hotfix 1c037a2 deployed directly through Vercel as dpl_13XtvuoAHdmRTj4sKiA5C4BYyd5q, READY and aliased to crm.shalimarfashions.com. Public login returned 200; unauthenticated config returned 401. The owner privately replaced the expired token, supplied valid/subscribed/registered CRM readback, and confirmed that one fresh “Connection check” arrived on their personal WhatsApp. This is owner-confirmed delivery evidence; no agent message was sent.
