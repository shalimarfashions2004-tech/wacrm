# Shalimar Meta asset map

Updated: 2026-10-03

This is a readback record for the Shalimar Chrome/Meta Business account. It
contains IDs only; it never contains access tokens, app secrets or PINs.

| Asset | Correct value | Meaning |
|---|---|---|
| Business portfolio | `Shalimar Fashions` / `965749722599371` | The portfolio that owns the production account |
| Production WABA | `1686023546421842` | The account that currently lists the Shalimar Indian number |
| Production display number | `+91 70256 48555` | Listed under the production WABA; current status is **Unverified** |
| Test WABA | `3105529616452879` | Separate Meta test account; do not use for production |
| Reported inaccessible ID | `1523728316440438` | Not listed in the Shalimar portfolio; treat as stale or belonging to another portfolio |

## What the CRM must use

The CRM configuration must be read back from the production WABA and its API
Setup page. The WABA ID must be `1686023546421842` for this portfolio. The
phone **number ID** is different from the display number; copy it only from
Meta's API Setup page and keep it out of chat and Git. Never put the display
number, a WABA name, or the stale ID `1523728316440438` into the phone-number-ID
field.

## Why the current Meta page is blocked

Meta shows the production number as **Unverified** because it is already linked
to a WhatsApp Business app account. The normal Cloud API “Add phone number”
flow tries to register it again and returns “Phone Number In Use”. Keeping the
same number in the app and the CRM requires Meta Embedded Signup coexistence
onboarding (`whatsapp_business_app_onboarding`) through an eligible Tech
Provider/Solution Partner. That onboarding is not enabled in this CRM yet.

Until that onboarding is complete, keep live sending disabled and use the CRM's
dry-run mode. Do not delete the existing WhatsApp account or disconnect the
number as a workaround.
