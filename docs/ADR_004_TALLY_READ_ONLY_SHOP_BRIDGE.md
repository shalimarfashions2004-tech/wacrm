# ADR-004: read-only TallyPrime bridge on the shop computer

**Status:** Local access diagnostic implemented; production sync proposed and blocked on shop readback.
**Date:** 8 October 2026
**Decision owner:** Shalimar Fashions owner for shop access and activation.

## Context

The owner wants Tally-backed customer histories and English/Malayalam image broadcasts. The owner confirmed TallyPrime and an available shop computer, requested help arranging access, and will check the exact release/company tomorrow. No remote connection, Tally HTTP service, company GUID, sales export, CRM import or template approval has been verified in this change.

The existing Customer Data page is an aggregate historical reference. Its source ends 23 May 2026 and cannot substantiate a complete three-year history or a current broadcast audience. Consent cannot be inferred from invoices. The repository is public; customer exports and credentials must remain outside it.

## Decision

Use an outward-only bridge running on the same shop computer as TallyPrime. First verify local read access with an identity-only diagnostic. After release/company confirmation, validate the sales field map against one closed month and an independent Tally control report. Only then implement and provision a narrow account-bound upload capability into the existing CRM.

The diagnostic sends one XML `Export` request to `127.0.0.1`, with a Company collection filtered by the exact supplied company name. It requests only Name and GUID, hashes the identifier for the operator receipt, and returns an explicit `crm_sync: not_connected`. The release is staff-reported. There is no remote-host option, redirect, proxy, credential, file export, upload, installation, scheduler or Tally write-back. XML DTDs are prohibited and response size/time are bounded.

Production sync will be distinct from this diagnostic; a successful local check must never be promoted to a successful data sync. Add source-company, period, coverage, file/content hashes, parser version, voucher/ledger identifiers, reconciliation status and last successful receipt to the future import contract. Machine ingestion must use a dedicated scope and account determined by its key, not an arbitrary account ID in the payload. Ordinary staff review continues to use existing account authentication and RLS.

## Options considered

| Option | Complexity | Access implications | Decision |
| --- | --- | --- | --- |
| Local outward-only shop bridge | Moderate; PC must run during sync | Narrow CRM key; no public Tally listener | Preferred after initial source validation |
| Existing privately approved remote session | Moderate; operator availability needed | Remote control is broader than a data-read capability | Optional setup assistance only if owner arranges it |
| Public Tally port | Simple to reach, unsafe exposure | Exposes an ERP interface supporting import/execute operations | Rejected |
| Manual CSV/XML uploads | Low initial effort; weak freshness | Reviewed files can support a controlled first import | Useful fallback; clearly label dated sources |
| Third-party bridge/database loader | Potentially faster; operational dependency | Installation, licensing, data destinations and permissions need review | No installation or account connection in this change |

## Delivery stages and acceptance

1. **Access:** exact company and release confirmed; local identity receipt reviewed; shop technician reviews HTTP configuration if needed. No remote access is granted by preparing this kit.
2. **One-month reconciliation:** export sales and compare independent Tally invoice count/gross/tax controls; reject duplicates, cancellations, amendments or mismatches not yet mapped. Preserve original files privately.
3. **Private CRM import:** additive tested schema, reviewed source/ledger identities, idempotent imports and audit receipts. Separate customer identity from a phone number; do not automatically merge businesses sharing a phone. Publish only reconciled data. Obtain live schema/save/readback evidence separately.
4. **History and segments:** show observed coverage, spend, purchase count, recency and product interest only from reliable detail. Import up to three years if available. Missing history remains visible. Incremental corrections, cancellations, outages and replay must be tested before unattended scheduling.
5. **Consent and language:** separate explicit WhatsApp marketing opt-in with source/date/wording/evidence. Unknown, revoked, ambiguous or suppressed contacts remain excluded. Staff review language rather than send two versions automatically.
6. **Template and delivery:** sync exact approved English/Malayalam image templates; inspect stable image media and provider status; perform one explicitly approved controlled image test and save delivery/reply receipts. Freeze a campaign’s audience/content before owner approval. Preserve current consent rechecks, uncertain-delivery holds and ₹1,000/month managed reservation controls.

## Consequences

This reaches shop data without exposing Tally to the internet. Setup and sync depend on the shop computer being available, so freshness and last receipt must be visible. Source validation delays the final schema until actual fields and controls are known, reducing the chance of a wrong-company or double-counted import.

Manual Inbox replies and existing provider credentials are untouched. Managed delivery remains disabled. This change creates no contacts or consent rows, changes no production settings, and proves no production connection. AI draft assistance is a separate workstream; no customer histories are sent to an AI provider and no automatic replies are enabled.

## References checked for preparation

- [Tally integration prerequisites](https://help.tallysolutions.com/pre-requisites-for-integrations/): running TallyPrime, loaded company and local HTTP service.
- [Tally XML integration](https://help.tallysolutions.com/xml-integration/): XML over HTTP, local port configuration and request structure.
- [Tally XML tags](https://help.tallysolutions.com/understanding-tally-xml-tags/): Export retrieves data; Import changes data; Execute runs actions; collection and static-variable structure.

Actual compatibility with the shop release remains a required live check.
