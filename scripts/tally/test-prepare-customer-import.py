"""Synthetic source reconciliation checks; no production files or provider calls."""
import contextlib
import csv
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).with_name("prepare-customer-import.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Preparation(unittest.TestCase):
    def write(self, path, rows):
        with path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

    def prepare(self, customers, invoices):
        folder = Path(self.directory.name)
        customer_file, invoice_file = folder / "customers.csv", folder / "invoices.csv"
        self.write(customer_file, customers)
        self.write(invoice_file, invoices)
        originals = customer_file.read_bytes(), invoice_file.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            module.prepare(customer_file, invoice_file, folder / "private")
        self.assertEqual(originals, (customer_file.read_bytes(), invoice_file.read_bytes()))
        return folder / "private"

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)

    def buyer(self, name="Synthetic Buyer", phone="6000000001", orders=3, gross="999"):
        return {"buyer": name, "phone": phone, "orders": orders, "lifetime_gross": gross}

    def invoices(self):
        return [{"buyer": "Synthetic Buyer", "vtype": "GST SALES (B2B)", "vno": str(i), "date": day, "gross": "100.11"}
                for i, day in enumerate(["2025-05-23", "2025-05-24", "2026-05-23"])]

    def test_exact_money_and_trailing_year_boundary_preserve_originals(self):
        folder = self.prepare([self.buyer()], self.invoices())
        receipt = json.loads((folder / "QUALITY_RECEIPT.json").read_text())
        with (folder / "SHALIMAR_CUSTOMER_DATA_REVIEWED_2026-10-08.csv").open() as handle:
            row = next(csv.DictReader(handle))
        self.assertEqual(row["lifetime_gross"], "300.33")
        self.assertEqual(row["gross_12m"], "200.22")
        self.assertEqual(row["orders_12m"], "2")
        self.assertEqual(row["language"], "unknown")
        self.assertNotIn("consent", row)
        self.assertEqual(receipt["customer_master_amounts_recomputed_from_invoices"], 1)
        self.assertTrue(receipt["gross_reconciled"])

    def test_invoice_count_mismatch_stops_preparation(self):
        with self.assertRaisesRegex(ValueError, "invoice counts"):
            self.prepare([self.buyer(orders=2)], self.invoices())

    def test_duplicate_vouchers_stop_preparation(self):
        invoices = self.invoices()
        with self.assertRaisesRegex(ValueError, "Duplicate invoice"):
            self.prepare([self.buyer(orders=4)], invoices + [invoices[0]])

    def test_all_shared_numbers_and_internal_outlets_are_held(self):
        customers = [self.buyer("Synthetic A",orders=1),self.buyer("Synthetic B",orders=1),self.buyer("Freedom Feel It",phone="6000000002",orders=1)]
        invoices = [{**self.invoices()[0],"buyer":c["buyer"],"vno":str(i)} for i,c in enumerate(customers)]
        receipt=json.loads((self.prepare(customers,invoices)/"QUALITY_RECEIPT.json").read_text())
        self.assertEqual(receipt["phone_states"], {"shared_phone":2,"internal_outlet":1})

    def test_public_repository_output_is_refused(self):
        with self.assertRaisesRegex(ValueError,"outside the public repository"):
            module.prepare(Path("missing"),Path("missing"),Path(__file__).resolve().parents[2]/"private-data")


if __name__ == "__main__":
    unittest.main()
