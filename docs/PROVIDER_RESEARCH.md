# Provider research (30 September 2026)

Meta’s official pricing page says billing is per delivered message, based on recipient market and category. It lists marketing, utility, authentication and service categories; service replies in the 24-hour customer-service window are described as free on the page, while provider pages announce a 1 October 2026 change, so the exact rate card must be checked at purchase time: <https://whatsappbusiness.com/products/platform-pricing/>.

| Route | Public evidence checked | Product fit | Cost confidence |
|---|---|---|---|
| Meta Cloud API direct | Official pricing and policy pages | Best ownership, API control, no BSP markup; Shalimar Connect can supply its own inbox and CRM. | Highest for Meta fees; hosting is ours. |
| Gupshup | January 2026 India INR rate card and July 2026 changelog: <https://www.gupshup.ai/resources/wp-content/uploads/2025/12/INR_Jan2026.pdf>, <https://partner-docs.gupshup.io/changelog/july-2026> | Strong Indian support and APIs; markup and account terms must be quoted. | Meta rates public; full landed price requires quote. |
| AiSensy | Pricing page: <https://aisensy.com/pricing/> | Easiest SMB route, broadcasts, segments and multi-agent UI; add-ons and prepaid credits. | Public plan and message rates; recheck effective date. |
| MSG91 | WhatsApp pricing: <https://msg91.com/pricing/whatsapp> | Indian multi-channel option; Titan listed at $0 for 2 months then $7/month, plus Meta rate card. | Platform fee public; usage and support are quote-sensitive. |
| WATI | Pricing help centre: <https://support.wati.io/en/collections/15525494-wati-plans-pricing> | Mature shared inbox/automation; likely easiest non-technical route. | Plan/add-on totals require account quote. |
| Interakt / Gallabox | Public pricing pages were not machine-readable in this pass. | Worth comparing for Indian SMB onboarding and inbox UX. | Do not budget until a written quote. |
| Exotel / Route Mobile / ValueFirst / 360dialog | Enterprise/BSP routes; current public India landed prices were not verified. | Consider for support/SLA or fallback, not first choice for a small self-hosted CRM. | Quote required. |

**Recommendation:** cheapest safe production route is Meta Cloud API direct plus this self-hosted CRM, provided Shalimar can operate the setup and maintain consent evidence. Best value for a non-technical team is an official Indian BSP such as AiSensy or Gupshup after a written quote confirms markup, exportability, GST invoice and number portability. WATI is the easiest turnkey inbox candidate. MSG91 is a credible multi-channel fallback. Unofficial Baileys/WhatsApp Web automation is excluded from production.
