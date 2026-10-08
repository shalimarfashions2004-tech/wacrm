"""Prepare a PRIVATE CRM import from the existing dated Shalimar working CSVs.

Original files are read only. Output must be outside the public repository.
Invoice-to-customer reconciliation is not a fresh Tally/account/provider check.
"""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


def phone_review(raw):
    value = raw.strip()
    if not value:
        return None, "missing_phone"
    if re.search(r"[,;/|]", value):
        return None, "ambiguous_phone"
    if not re.fullmatch(r"\+?[0-9\s()-]+", value):
        return None, "invalid_phone"
    digits = re.sub(r"[^0-9]", "", value)
    if re.fullmatch(r"0[6-9][0-9]{9}", digits):
        digits = digits[1:]
    if re.fullmatch(r"[6-9][0-9]{9}", digits):
        digits = "91" + digits
    return (digits, "ready") if re.fullmatch(r"91[6-9][0-9]{9}", digits) else (None, "invalid_phone")


def name_key(value):
    return "".join(c for c in unicodedata.normalize("NFKC", value).lower() if c.isalnum())


def money(value):
    return Decimal(value or "0").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def prepare(customer_path, invoice_path, output):
    repo = Path(__file__).resolve().parents[2]
    output = output.resolve()
    if output.is_relative_to(repo):
        raise ValueError("Customer files must stay outside the public repository.")
    with customer_path.open(encoding="utf-8-sig") as handle:
        customers = list(csv.DictReader(handle))
    with invoice_path.open(encoding="utf-8-sig") as handle:
        invoices = list(csv.DictReader(handle))
    if not customers or not invoices:
        raise ValueError("Both source files need records.")
    if len(set(r["buyer"] for r in customers)) != len(customers):
        raise ValueError("Customer master has duplicate exact buyer keys.")
    voucher_keys = [(r["date"], r["vtype"], r["vno"]) for r in invoices]
    if len(set(voucher_keys)) != len(invoices):
        raise ValueError("Duplicate invoice keys must be reviewed before preparing the import.")
    if any(r["vtype"] not in {"GST SALES (B2B)", "GST SALES (Unreg)"} for r in invoices):
        raise ValueError("Unmapped voucher types need review.")
    start = min(date.fromisoformat(r["date"]) for r in invoices)
    as_of = max(date.fromisoformat(r["date"]) for r in invoices)
    try:
        anniversary = as_of.replace(year=as_of.year - 1)
    except ValueError:  # February 29 -> prior February 28, matching calendar-year SQL rules.
        anniversary = as_of.replace(year=as_of.year - 1, day=28)
    cutoff = anniversary + timedelta(days=1)
    by_buyer = defaultdict(list)
    for invoice in invoices:
        by_buyer[invoice["buyer"]].append(invoice)
    if set(by_buyer) != {r["buyer"] for r in customers}:
        raise ValueError("Customer/invoice buyer coverage does not reconcile.")
    rows, phone_counts, name_counts = [], Counter(), Counter()
    corrected_amounts = 0
    for master in customers:
        buyer = master["buyer"]
        if not buyer.strip():
            raise ValueError("An unnamed customer needs review.")
        history = by_buyer[buyer]
        if int(master["orders"]) != len(history):
            raise ValueError("Customer invoice counts do not reconcile.")
        recent = [r for r in history if date.fromisoformat(r["date"]) >= cutoff]
        gross = sum((money(r["gross"]) for r in history), Decimal("0.00"))
        gross_12m = sum((money(r["gross"]) for r in recent), Decimal("0.00"))
        if abs(money(master["lifetime_gross"]) - gross) > Decimal("0.01"):
            corrected_amounts += 1
        raw_phone = master["phone"].strip()
        phone, state = phone_review(raw_phone)
        internal = name_key(buyer) == "freedomfeelit"  # Owner-confirmed own outlet.
        if internal:
            state = "internal_outlet"
        if phone:
            phone_counts[phone] += 1
        name_counts[name_key(buyer)] += 1
        rows.append({
            "source_key": "csv:" + hashlib.sha256(buyer.encode()).hexdigest(),
            "name": buyer, "phone": raw_phone,
            "first_order": min(r["date"] for r in history), "last_order": max(r["date"] for r in history),
            "orders": len(history), "lifetime_gross": str(gross), "gross_12m": str(gross_12m),
            "orders_12m": len(recent), "source_start": str(start), "source_as_of": str(as_of),
            "language": "unknown", "is_internal": str(internal).lower(),
            "_phone": phone, "_state": state,
        })
    for row in rows:
        if row["_state"] == "ready" and phone_counts[row["_phone"]] > 1:
            row["_state"] = "shared_phone"
        if row["_state"] == "ready" and name_counts[name_key(row["name"])] > 1:
            row["_state"] = "duplicate_name"
    output.mkdir(parents=True, exist_ok=True)
    destination = output / "SHALIMAR_CUSTOMER_DATA_REVIEWED_2026-10-08.csv"
    fields = [k for k in rows[0] if not k.startswith("_")]
    with destination.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    review_path = output / "SHALIMAR_PHONE_REVIEW_PRIVATE.csv"
    with review_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, ["source_key", "name", "phone", "reason"])
        writer.writeheader()
        for row in rows:
            if row["_state"] != "ready":
                writer.writerow({"source_key": row["source_key"], "name": row["name"], "phone": row["phone"], "reason": row["_state"]})
    summary = {
        "source_start": str(start), "source_as_of": str(as_of), "customers": len(rows), "invoices": len(invoices),
        "phone_states": dict(Counter(r["_state"] for r in rows)),
        "invoice_count_reconciled": sum(r["orders"] for r in rows) == len(invoices),
        "gross_reconciled": sum((Decimal(r["lifetime_gross"]) for r in rows), Decimal(0)) == sum((money(r["gross"]) for r in invoices), Decimal(0)),
        "customer_master_amounts_recomputed_from_invoices": corrected_amounts,
        "marketing_permission": "unknown; no consent evidence in these source files",
        "language": "unknown; staff review required", "whatsapp_registration_lookup": "not_performed",
        "live_tally_sync": "not_connected", "crm_import": "not_performed", "customer_messages_sent": 0,
        "sources": {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [customer_path, invoice_path]},
        "output_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
    }
    (output / "QUALITY_RECEIPT.json").write_text(json.dumps(summary, indent=2) + "\n")
    (output / "START_HERE.txt").write_text(
        "PRIVATE SHALIMAR CUSTOMER DATA — do not upload these files to GitHub or share publicly.\n\n"
        "Prepared from dated source CSVs; this is not a fresh Tally sync or proof of WhatsApp permission.\n"
        "After migration 052 and the CRM update are installed, open Contacts > Customer Data.\n"
        "Choose SHALIMAR_CUSTOMER_DATA_REVIEWED_2026-10-08.csv, review the dates/counts, then save customer data.\n"
        "Use Add / link reviewed Contacts after reviewing the preview. Existing identity conflicts remain blocked.\n"
        "Review language and independently verified opt-in evidence per customer. No permission is inferred from buying.\n"
        "Then choose an approved English/Malayalam image template and preview the audience. Approval is separate from sending.\n"
        "See QUALITY_RECEIPT.json and SHALIMAR_PHONE_REVIEW_PRIVATE.csv for the audit.\n"
    )
    print(json.dumps({k: v for k, v in summary.items() if k != "sources"}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--customers", type=Path, required=True)
    parser.add_argument("--invoices", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.customers, args.invoices, args.output)
