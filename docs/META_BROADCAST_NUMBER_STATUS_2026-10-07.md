# Broadcast number verification — 7 October 2026

## Latest checkpoint — outbound lock and business profile

This checkpoint supersedes earlier pending-action wording below; older observations are retained as history.

- The user confirmed the corrected CRM connection worked and that the incoming TEST appeared in CRM Inbox. These are user readbacks, not independent agent access to CRM.
- The user's next failure is the CRM's intentional outbound policy: `Live WhatsApp delivery is disabled`. A restricted, expiring manual test implementation is now prepared and tested locally; see [implementation, activation and rollback](WHATSAPP_MANUAL_TEST_2026-10-07.md). It is now deployed with a one-attempt test approval expiring at **09:51:10 UTC / 10:51:10 a.m. UK time on 7 October 2026**. Vercel deployment and domain routing were read back successfully. The user was asked to perform the exact approved test; outgoing delivery remains unconfirmed.
- Vercel's initial saved credential returned HTTP 403 `Not authorized`. The user completed a fresh sign-in and access was restored. The three temporary test settings were saved as production Secrets; global live delivery remains dry-run / false. See the linked test runbook and deployment evidence.
- Live WhatsApp Manager profile inspection showed **Shalimar Fashions**, approved display name, category **Clothing and Apparel**, correct new phone, and Connected. Profile photo, description, address, email and websites were blank. The official-business-account request button was disabled. No profile change was submitted; permission to upload the brown source logo remains pending.
- The observed approved name does not explain why the user's WhatsApp screen did not show it. No cache/delay cause was established. Meta's official-business-account documentation lists eligibility including business verification, approved display name, two-step verification and platform tenure. Earlier phone readback showed PIN disabled; the agent has not changed it or submitted a badge request.
- Latest local checks after code changes: **100 test files / 1,132 tests passed**, typecheck passed, lint **0 errors / 37 existing warnings**, and Webpack build passed with CI dummy configuration. A subsequent production Turbopack build passed and Vercel routing was verified. No live-send result is implied.

## Owning-account subscription and single-test approval

The user subsequently reported **“DONE WOERKRED”** after correcting the missing leading digit and saving with a new token. This is user-reported connection success; the agent has not independently read CRM settings. The user explicitly confirmed that the real inbound **TEST** to **+91 70253 20333** appeared in **CRM Inbox**. This provides user readback for incoming delivery; it is not an independent agent inspection. No outgoing test has been sent. The user next reported missing photo, business name and verification on the business number’s customer-facing WhatsApp profile; live profile inspection is pending.

After the user requested the next connection and real testing, the agent submitted **POST `28787952197487898/subscribed_apps`** in SF's authenticated Explorer. Meta returned **`{"success": true}`**. A separate GET readback is pending. This closes the approval gate for this specific app subscription; no token was created or copied.

The user authorized one test to their personal WhatsApp number supplied in chat, using **“Shalimar Connect test — please reply OK.”** The recipient is deliberately omitted from this repository document. No message has been sent. CRM configuration/readback, production delivery controls, and a valid messaging window or approved template still need verification. This does not authorize a customer broadcast or broadly enabling automated sending.

Because browser access to CRM remains restricted in this session, the user was asked to save phone ID `1391671597361924` and WABA ID `28787952197487898` in the existing CRM connection, keep credentials private, and report **Test Connection** and **Verify Registration** results. That user handoff is pending. The CRM first required the access token to be re-entered. A subsequent user-supplied error contained WABA `8787952197487898`, which is missing the leading `2` from the verified ID `28787952197487898`. The user was instructed to correct the exact ID and retest before treating the token as invalid. This error is not evidence that the correct account is inaccessible.

## Payment follow-up — 7 October 2026

The user completed a ₹100 top-up. Live **Payment activity → WhatsApp Business accounts** in Shalimar Chrome confirms **₹100.00, Manual payment, Funded**, dated **7 October 2026**, for WABA `28787952197487898` and payment account `2059890194635253`. The displayed current balance is **₹99.99**; no explanation for the one-paisa difference was established. A separate ₹3.00 attempt is marked Failed. No payment was initiated by the agent.

The same account previously showed no transactions for 1–7 October. The user's reported earlier ₹500 payment has not been located; its destination and receipt remain unknown. A subsequent authenticated GET for phone `1391671597361924` confirms **CONNECTED**, **VERIFIED**, and overall **can_send_message AVAILABLE**. Phone, WABA `28787952197487898`, business, and SF app each report **AVAILABLE**; payment error `141006` is absent. The unrelated SIP calling configuration errors remain. This establishes that the observed Meta payment block has cleared, not end-to-end CRM readiness. The owning-WABA subscription POST subsequently succeeded; its GET readback and CRM readback remain pending. No live messages have been sent.

## Earlier authenticated provider readback — before top-up

Using the existing authenticated **Graph API Explorer** session for SF in Shalimar Chrome, the agent issued read-only GET requests. No token was copied, generated, or exposed. Selected results are recorded in [provider evidence](evidence/meta-broadcast-provider-readback-2026-10-07.json).

- Phone `1391671597361924` is **+91 70253 20333**, **Shalimar Fashions**, `CONNECTED`, `VERIFIED`, `CLOUD_API`, with display-name status `APPROVED`. Quality is `UNKNOWN`; `is_pin_enabled` is `false`. These last two values are recorded as returned, not interpreted as registration failure.
- **Both** `28787952197487898/phone_numbers` and `4752268255096473/phone_numbers` returned that exact phone. The earlier statement that one was necessarily a wrong-number account was too strong.
- The phone's `health_status` identifies **owning WABA `28787952197487898`** and business `965749722599371`. This is the provider-backed WABA to use for the final CRM pairing, with a matching permanent credential.
- Overall `can_send_message` is **BLOCKED**. The phone, business, and app individually report **AVAILABLE**. The WABA reports **BLOCKED**, error **141006**, describing a payment-method error that blocks business-initiated conversations and instructing addition of a payment method.
- SIP calling errors `138024` and `138025` also appear, describing unconfigured calling. Calling is outside this broadcast setup; no SIP settings were changed.
- ID `4752268255096473` returns SF app `1652179446258694` in `subscribed_apps`. The direct edge **`28787952197487898/subscribed_apps` returns `data: []`**. The earlier subscription success therefore did not establish a subscription on the owning WABA.
- The exact POST to `28787952197487898/subscribed_apps` was prepared in Graph API Explorer but **not submitted**. The Explorer was later returned to GET for status checks. The user has been asked to confirm granting SF incoming-message/status access on this owning account. That approval is pending.
- Direct billing for WABA `28787952197487898` confirms **no payment methods**. The agent opened **Add payment method** and stopped at India / INR / Kolkata location-and-currency selection. The user must complete payment details, bank/UPI approval, and final confirmation. This handoff is pending.
- SF remains unpublished in the dashboard. The new API health response says the app is **AVAILABLE for sending**; do not claim app review is the observed sending blocker. Production webhook delivery and any applicable publication requirements still need separate verification.

## Earlier UI asset observations

The SF app's **Step 2. Production setup → Register your WhatsApp phone number** view explicitly groups the numbers as follows:

| Number | Phone-number ID | WABA ID shown in SF production setup | Registration state at that observation |
| --- | --- | --- | --- |
| +91 70253 20333 | 1391671597361924 | **4752268255096473** | Registered; Business Settings also shows Connected |
| +91 70256 48555 | 1388593764335115 | 28787952197487898 | Unverified |

Both cards are named Shalimar Fashions. After the user approved the pending webhook action with **do it**, the agent enabled **Subscribe webhooks** for WABA `4752268255096473` in SF. Meta returned **Success Successfully subscribed to webhooks**, and the switch read back **on**. The old WABA `28787952197487898` switch remained **off**. The app-level **Configure Webhooks** section has the saved callback `https://crm.shalimarfashions.com/api/whatsapp/webhook` and the `messages` field is **Subscribed**, version v26.0. A verify token is present; its value was not recorded here or changed. These observations establish the configured subscription, not actual production webhook delivery.

**Resolved by later API evidence:** An earlier update called `28787952197487898` incorrect based on the SF cards above. That conclusion was too strong. Both IDs return the new phone through the API, while the phone's health response identifies owning WABA `28787952197487898`. Subscription readback differs between the IDs as recorded above. No CRM settings were changed using the earlier inference.

The user read back the current CRM values as phone-number ID `1228692947003388` and WABA ID `3105529616452879`. These do not match the new number. This is user-supplied readback, not an authenticated provider check by the agent.

The user completed Meta's PIN entry and Register action, then reported **Registered successfully**. The agent subsequently observed **Registered** in SF production setup and **Connected** in Business Settings for the new number. Its Phone Profile shows ID `1391671597361924`, display name **Shalimar Fashions**, and **Approved** display-name review. No PIN was entered, recorded, exposed, or submitted by the agent.

## Connection blockers observed live

- Existing system user **SHALIMAR**, ID `61594470909790`, initially had access to only two assets: **SF** and **Test WhatsApp Business Account** (`3105529616452879`). On the latest live recheck it has **three assets**: those two plus **Shalimar Fashions — Full access**, whose View asset link explicitly identifies `28787952197487898`. This access change occurred outside the agent's actions. No access or token was changed by the agent. Access to `4752268255096473` remains unverified.
- In **Assign assets → WhatsApp accounts**, searching exact ID `4752268255096473` returned **No business assets found**. Searching exact ID `28787952197487898` matched **Shalimar Fashions**. The later phone-health response identifies that same owning WABA. No broader account was assigned by the agent.
- The CRM IDs supplied by the user point to that test WABA. The new phone/WABA pairing has not been saved or read back in CRM. A prior browser access restriction remains in effect; no alternative route was used to bypass it.
- SF remains **Unpublished**. Its Publish control is disabled; the screen lists **Complete App Review** and **Access verification**. Its webhook setup explicitly warns that unpublished apps receive only dashboard test webhooks and no production data. This is evidence from this app's current UI, not a general assertion about every own-business integration.
- The existing app-review draft `1652180132925292` opens directly even though the main App Review page sometimes errors. Verification, App settings, Allowed usage, and Data handling displayed green completion indicators. Reviewer instructions and the final submission remain unverified. No review, access-verification declaration, or business approval was submitted.
- Business Security Center shows Shalimar Fashions **Verified**, originally verified on 3 October 2026.
- Business Settings with `selected_asset_id=4752268255096473` showed business Verified, account Approved, and **No payment method found**. However, its detail header showed the old number and its Linked WhatsApp accounts table grouped both numbers. Validate the exact WABA/phone pair through the provider API; neither this URL context nor the SF card alone resolves the conflicting evidence. Billing readiness is not established.
- The latest foreground Shalimar tab is SF's **Add payment information** flow, offering debit/credit card or UPI. The agent did not enter or submit payment details. The user was asked to complete it directly and report Meta's confirmation. This billing handoff is pending.

## Earlier observations and follow-up

- Native Chrome window identified its profile as **Shalimar**.
- Business portfolio: **Shalimar Fashions**, `965749722599371`.
- Existing WhatsApp Business Account: **Shalimar Fashions**, `28787952197487898`; Business Settings and WhatsApp Manager's account selector showed ownership by Shalimar Fashions. Its phone table now shows only the new number; the SF card discrepancy is recorded above.
- New broadcast number: **+91 70253 20333**.
- Phone-number ID shown by WhatsApp Manager: **1391671597361924**.
- Meta initially displayed the six-digit verification-code form for this number. The agent did not enter a code.
- The user confirmed completing verification. WhatsApp Manager then showed **Pending**, replacing **Unverified**, and the phone-verification-required banner disappeared.
- Display name **Shalimar Fashions** initially remained **In review**. After refreshing the first Business Settings tab, the new number instead showed **Name visible to customers**, while its phone status remained **Pending**.
- The agent did not delete, disconnect, or migrate any number or create a WABA. The user later reported deleting the old `+91 70256 48555` Meta entry and instructed continuing with the new number. The live WhatsApp Manager phone table subsequently showed only `+91 70253 20333`, still **Connected**. The old number's mobile-app operation was not checked.
- SF app `1652179446258694` showed **Unpublished** and App Review **Not submitted** for the displayed requests. The later Publish and webhook observations are recorded above.
- Business Settings initially selected WABA `28787952197487898` and showed business **Verified**, account **Approved**, and **No payment method found**. These grouped-account screens do not independently prove phone ownership; see the corrected SF mapping and later observations above.

## Remaining checks

The number is **registered**, but **not confirmed ready for broadcasts**. Registration and display-name approval do not prove webhook delivery, billing readiness, or CRM integration.

1. Read back `subscribed_apps` on **owning WABA `28787952197487898`** after the approved POST returned success. Actual event delivery remains unverified.
2. SHALIMAR access to owning WABA `28787952197487898` is confirmed in the UI, and the phone pair is confirmed by the API. The successful Explorer checks used its existing user token; do not treat them as proof that CRM's permanent credential works. Keep credential entry private and user-controlled.
3. Save and read back the new phone/WABA pairing through the authorized CRM configuration flow, using credentials with matching app, permissions, and asset access. Confirm actual provider registration even if CRM's local registration timestamp has not yet been set.
4. Verify actual production webhook delivery and the app's applicable publication/review requirements. The API reports the app available for sending; only billing is identified as the provider messaging-health blocker. Hand off approval and confirmation screens to the user and do not send unapproved messages.
5. **Completed:** ₹100 funding and subsequent Meta messaging health AVAILABLE were verified for the owning WABA. No payment was initiated by the agent.
6. Verify approved templates, eligible recipients/consent, exact app subscription, and CRM readback before requesting explicit approval for a separate live test. Keep outbound sending disabled until then.

The CRM implementation has phone/WABA pairing checks, optional PIN-based registration, app-subscription checks, and two independent live-delivery flags. These are source observations, not production readback evidence. The only provider configuration change by the agent was the approved new-WABA webhook subscription. No CRM configuration, deployment settings, tokens, PINs, or live-send flags were changed in this check. No messages were sent.

Chrome changed pages during checks, and the UI tool reported user interaction. During the permissions follow-up, the user opened **Delete phone number** for the old `+91 70256 48555`. The agent did not initiate or submit deletion and requested cancellation. The user then explicitly reported completing deletion and directed continuing with the new number. Live readback confirmed the old entry was absent and the new number remained Connected. The cancellation and billing handoffs are closed; see the confirmed top-up and fresh provider health above. CRM provider readback has not been completed.

## Local validation

- 98 test files / 1,104 tests passed.
- Typecheck passed.
- Lint: 0 errors, 37 warnings.
- Local Webpack production build compiled and completed its TypeScript stage, then failed while prerendering `/forgot-password` because the local Supabase URL/API key configuration was missing. This run does not establish a successful build or deployment.
- No application code was changed. This status record and the selected-field provider evidence JSON document the work. The JSON was validated. The application test/build results above are from the earlier same-day run; they were not rerun for these documentation-only updates.

## Reference

Meta's Cloud API registration documentation distinguishes SMS/voice ownership verification from the registration call, which also sets a six-digit two-step verification PIN:

https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-06605a2c-2b74-4d0a-a035-2c227eae61d1
