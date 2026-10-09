# Shalimar Tally CRM Sync Kit

Requirements: Windows PowerShell, Node.js 20+, TallyPrime open with `SHALIMAR FASHIONS` selected, and Tally's private localhost service on port 9000.

1. Open PowerShell in this folder.
2. Run `npm install` in the parent WACRM checkout, or copy the compiled `dist` folder from the kit.
3. Run `powershell.exe -ExecutionPolicy Bypass -File .\run-sync.ps1`.
4. Enter a closed period only. Read the posted-sales voucher count and gross total for the same period from TallyPrime's Sales Register, then enter those two control totals when prompted. Paste the private CRM key when prompted; it is held in memory and removed after the run.
5. Copy only the returned run receipt. Never send the key in chat or commit it to a file.

The agent reads Tally through `http://127.0.0.1:9000/`, never uses Tally Import/Execute, and submits only to `https://crm.shalimarfashions.com/api/v1/tally/sync` with the `tally:sync` scope. It does not send WhatsApp messages or activate broadcasts.

The closed-period read allows up to 180 seconds per local Tally request and 64 MiB per XML response. Full voucher and inventory records are requested one calendar month at a time; if one busy month exceeds the XML limit, the agent automatically splits only that month into smaller date windows and combines the results locally. These are bounded read limits; the agent still never writes to Tally. The CRM upload is gzip-compressed so a complete closed-period payload can stay below the network request limit.

The Sales Register values are an independent operator readback. The CRM will only create a report snapshot when the posted-sales count and gross total match both the Tally payload and the stored voucher rows. A missing or mismatched control total blocks reports; it does not delete the upload.

To read the controls, keep `SHALIMAR FASHIONS` open, open TallyPrime's Sales Register, set the same From and To dates, and record the posted sales count and gross total shown for that period. Enter the count as a whole number and the amount as INR (for example `1234.05`). Do not include purchases, cancelled vouchers, optional vouchers, or a different period.
