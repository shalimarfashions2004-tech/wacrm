# Compliance baseline

This is an engineering control record, not legal advice.

**WhatsApp policy:** Meta’s 23 September 2026 Business Messaging Policy requires the business to have the person’s number and opt-in permission, respect block/opt-out requests, use approved templates to initiate conversations outside the 24-hour service window, secure notices/consents, and provide a clear human escalation path. Source: <https://whatsappbusiness.com/policy/>.

**SMS/DLT:** TRAI’s sender guidance requires Principal Entity registration, registered headers, content templates, consent templates where applicable and transmission of PE ID/header/content ID. Source: <https://www.trai.gov.in/advice-to-senders>. These are SMS controls and do not turn a WhatsApp contact list into consent for SMS.

**DPDP:** MeitY published the Digital Personal Data Protection Rules 2025 in the Gazette with staged commencement. The application must provide notice, purpose limitation, access control, deletion/export handling, processor agreements and retention limits appropriate to the live obligations. Sources: <https://www.meity.gov.in/documents/act-and-policies/digital-personal-dataprotection-rules-2025gDOxUjMtQWa?pageTitle=Digital-Personal-Data-ProtectionRules-2025> and <https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf>.

Implementation rule: imported contacts start as `unknown`; only evidence-backed opt-in can make marketing sendable. STOP, UNSUBSCRIBE, REMOVE, CANCEL, വേണ്ട and ഒഴിവാക്കുക create a hard suppression. A compliance professional should confirm the wording, retention period and any sector-specific requirements before launch.
