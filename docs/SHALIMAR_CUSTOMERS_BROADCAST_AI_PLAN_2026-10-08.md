# Shalimar customer data, WhatsApp campaigns and AI plan

Prepared 8 October 2026. Owner: Shalimar Fashions. This is the implementation and acceptance plan; it does not claim a live Tally connection, imported consent or active AI auto-replies.

## Objective and current evidence

Give staff one reliable customer history, select a relevant opted-in audience, review an English or Malayalam image message, and understand costs before approving delivery. AI should help staff answer correctly before it is allowed to reply automatically.

The existing customer-data page uses a reviewed **aggregate snapshot**, not live customer records. Its source window is **1 April 2024–23 May 2026**: 26 workbooks, 2,353 customer rows and 8,087 invoices. It cannot substantiate a complete three-year history. The current parser/report also identifies blank phones, multiple phones and indicative product totals that need reconciliation. A purchase record is not WhatsApp marketing permission.

Latest owner evidence: after a private token rotation, a fresh Inbox “Connection check” arrived on the personal test phone. Meta was read live on 7 October: Shalimar Fashions portfolio 965749722599371; WABA 28787952197487898; sender +91 70253 20333; phone ID 1391671597361924; Connected; display name Shalimar Fashions Approved. Blue-badge “Submit request” was disabled. Recheck drift-prone provider state before activation.

## Goals and exclusions

- Reconcile imported invoices and purchase totals to the authoritative dated Tally sections.
- Connect reviewed customer rows to Contacts, with a traceable source ID and separate consent evidence.
- Prepare image templates in English (`en`) and Malayalam (`ml`), including store contacts and STOP instructions.
- Enforce saved-source approval, current consent and a shared ₹1,000/month managed spending reservation.
- Show Meta estimates, protected reservations and AI estimates separately from actual provider bills.
- Start AI with staff-reviewed drafts and confirmed business knowledge.

The first phase excludes ERP write-back, automatically opting in historical purchasers, unattended AI replies, stock promises from stale spreadsheets, broadcast retries of uncertain attempts, and any guaranteed verification badge.

## P0: customer import and audience quality

As an administrator, I can preview an import before it changes Contacts. Store an immutable source receipt (file hash, period, row counts, gross/tax totals, parser version), staging rows and a reconciliation report. Preserve source files. Parse only the authoritative first monthly invoice section through its first Grand Total, excluding duplicated/stacked sections.

Acceptance:

1. Each month reconciles invoice count and gross/tax totals; mismatches block publication.
2. Map customers using reviewed Tally/customer keys. Normalize India phones; quarantine blanks, ambiguous multi-number rows, duplicates and internal outlets. Never silently choose a second number.
3. Contacts retain source links; repeat imports use source keys/hash to avoid duplicates. Display last sync and actual coverage dates.
4. Store invoices and invoice items separately. Expose rolling 12/24/36-month spend and frequency only where coverage supports the period; show “insufficient history” otherwise.
5. Record language preference explicitly. Unknown language needs staff review; avoid sending both versions by default.
6. Collect WhatsApp opt-in source, timestamp, wording version and evidence independently. Unknown/revoked consent is excluded. STOP updates suppression immediately.
7. Audiences show total, eligible and excluded counts with reasons; all reads are paginated. Freeze recipient IDs and parameters before approval. Recheck consent at every claim.

## P0: image campaign and costs

As an admin, I prepare a saved campaign, see its actual image, text, footer, call button, recipients and reserved cost, then explicitly approve and send.

Acceptance:

- Meta must approve the exact synced name/language/category/content. An image and its template text are one message. English and Malayalam sent separately are two messages.
- JPEG/PNG image limit: 5 MB. Upload/URL errors surface before submission; the image must remain publicly retrievable by Meta. Use controlled immutable assets for approved campaigns; replacing bytes behind a saved URL needs a new review.
- The server accepts source IDs, not arbitrary caller phones, prices or approval actors. The permanent database claim happens before one provider POST. Accepted receipts are saved; uncertain attempts are held for review and never automatically retried.
- Shared calendar month uses Asia/Kolkata. ₹2 is reserved per managed attempt, including unsuccessful/uncertain attempts; ₹1,000 permits at most 500 attempts at that reservation. It is an allowance, not the Meta invoice or prepaid balance.
- Actual Meta bills/top-ups live in Meta Billing & payments. Current-rate marketing estimates and AI estimates show their dates, assumptions and exclusions.
- Waiting workflows remain unapprovable until their scheduler has live evidence. AI, Flows and general API sends retain their separate disabled delivery policy.

## P0: AI draft setup

As a member of staff, I request a draft grounded in approved shop information, review it and send it through Inbox.

Recommended first knowledge document: name, shop/WhatsApp numbers, address, email, and a clear rule to ask staff about live prices, sizes, stock, opening hours, returns and delivery until those policies are confirmed. Do not ingest PAN, bank records, credentials, full customer histories or private shop documents into a general knowledge base.

Acceptance:

- Admin privately enters their chosen provider API key; configuration and knowledge save/readback are verified in CRM. No token enters reports or client responses.
- Playground checks include English, Malayalam, missing stock/price, returns, STOP, complaints and a request to speak to staff. Unknown answers hand off; no invented discounts or availability.
- Show calls, input/output tokens and current-rate estimated USD in AI → Usage. Unknown model rates are explicitly excluded; recorded usage is best effort and must be reconciled with provider billing.
- Show an editable INR planning exchange-rate assumption, not a claim about the live exchange rate. Draft generation costs AI usage even if not sent.
- Auto-reply remains off until a separate AI spending cap, provider receipt logging, consent/window checks, human handoff and a specifically approved live test are implemented. The campaign cap currently does not enforce AI-provider spending.

## P1: Tally and customer intelligence

Deploy a read-only connector on the intended Tally computer after confirming company and version. Keep its local service off the public internet. Sync customer/item/voucher keys incrementally with durable checkpoints and daily reconciliation. Inspect actual version documentation before choosing XML/JSON/ODBC. Show health, stale data and last successful receipt.

Add recency/frequency/value segments, high/low spend, active months, repeat buyers, category interest and top products by quantity and revenue as separate rankings. Use approved product/category mapping; stock must have a current source timestamp. Publish reviewed segments to the same Contacts-based audience builder rather than a separate sending path.

## P2: bounded AI automation

After draft acceptance, implement a distinct AI allowance and call reservation, maximum output/context sizes, retry policy, alerting and a human takeover switch. Start with one verified FAQ workflow. Require explicit approval of its purpose and contacts, then measure correctness, handoff rate, latency, token cost and opt-outs. Avoid a broad unattended launch.

## Measures and live acceptance

Success criteria: 100% imported months reconciled; zero ambiguous phones admitted automatically; zero marketing sends with unknown consent; zero automatic retries of uncertain delivery; no managed reservation above the cap; correct English/Malayalam image rendering on the controlled test phone; AI answers supported by approved knowledge and visible usage.

Before customer activation, obtain: migration 051 owner receipt, current sender/app/template checks, authenticated CRM save/readback, hosted schema/permissions evidence, concurrent-worker budget test, scheduler receipt where applicable, and one explicitly approved image test with delivery/reply webhook receipts. A local build or Meta acceptance alone is not delivery evidence.

## Decisions and open items

- Use the existing connected sender and preserve the shop WhatsApp number.
- Use a general introduction, no invented offers or product claims.
- Store contact: +91 70256 48555; CRM WhatsApp: +91 70253 20333; email shalimarfashions2004@gmail.com; Ground Floor, near CSB Bank, Market Road, Ernakulam, Kochi 682011. Contact source: owner's branding/business card files; no customer data included.
- Confirm opening hours, returns/delivery policy, preferred language and AI budget before expanding knowledge/automation.
- Meta alone grants the badge. Disabled request status is a blocker, not proof of ineligibility or a pending application. No request/payment has been submitted.

## Pricing sources, checked 7 October 2026

- [Meta pricing calculator](https://whatsappbusiness.com/products/platform-pricing/): India Marketing ₹0.8631 per delivered message, before applicable taxes. Rates can change.
- [Meta FAQ](https://whatsappbusiness.com/resources/faq/): effective 1 October 2026 first 1,000 service messages per phone/month free, then paid. Main pricing-page prose still says free service replies; The India public calculator returned ₹0.115 per paid Service message on 8 October. Account billing is the authority for actual applicable charges.
- [Meta media reference](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3): JPEG/PNG up to 5 MB.
- [OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini): US$0.75/million input tokens, US$4.50/million output tokens. Example: 1,000 replies × (1,000 input + 200 output tokens) ≈ US$1.65, or ₹148.50 at an illustrative ₹90/US$, excluding Meta charges, embeddings and taxes.
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing): Haiku 4.5 US$1/million input, US$5/million output. Same example ≈ US$2, or ₹180 at that illustrative exchange rate.
