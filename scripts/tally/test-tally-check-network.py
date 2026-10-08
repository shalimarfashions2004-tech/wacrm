"""Exercise the real PowerShell HTTP path against loopback-only synthetic fixtures."""
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.etree import ElementTree as ET

script = Path(__file__).resolve().parents[2] / "public/downloads/SHALIMAR_TALLY_CHECK.ps1"
pwsh = sys.argv[1]
company = "Synthetic Company"
valid = b'<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION><COMPANY NAME="Synthetic Company"><GUID>synthetic-company-guid</GUID></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>'
requests = []
redirect_hits = []
mode = "valid"


class RedirectTarget(BaseHTTPRequestHandler):
    def do_GET(self):
        redirect_hits.append(self.path)
        self.send_response(200)
        self.end_headers()

    do_POST = do_GET

    def log_message(self, *_):
        pass


target = ThreadingHTTPServer(("127.0.0.1", 0), RedirectTarget)
threading.Thread(target=target.serve_forever, daemon=True).start()


class Fixture(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        root = ET.fromstring(body)
        assert root.findtext("HEADER/TALLYREQUEST") == "Export"
        assert root.findtext("HEADER/TYPE") == "Collection"
        assert root.findtext("BODY/DESC/STATICVARIABLES/SVCURRENTCOMPANY") == company
        assert [node.text for node in root.findall("BODY/DESC/TDL/TDLMESSAGE/COLLECTION/NATIVEMETHOD")] == ["Name", "GUID"]
        assert self.path == "/"
        assert self.headers.get("Authorization") is None
        requests.append(mode)
        if mode == "redirect":
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{target.server_port}/not-allowed")
            self.end_headers()
            return
        if mode == "http_error":
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"PRIVATE_SENTINEL")
            return
        content = {
            "valid": valid,
            "wrong_company": valid.replace(b'Synthetic Company', b'Other Company'),
            "rejected": b'<RESPONSE><LINEERROR>PRIVATE_SENTINEL</LINEERROR></RESPONSE>',
            "malformed": b'<ENVELOPE>',
            "xxe": b'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///private">]><ENVELOPE>&xxe;</ENVELOPE>',
            "too_large": b'x' * 262145,
        }[mode]
        self.send_response(200)
        self.send_header("Content-Type", "text/xml; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        try:
            self.wfile.write(content)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
threading.Thread(target=server.serve_forever, daemon=True).start()
cases = {
    "valid": None,
    "wrong_company": "wrong_company",
    "rejected": "tally_rejected_request",
    "malformed": "invalid_tally_xml",
    "xxe": "invalid_tally_xml",
    "too_large": "response_too_large",
    "redirect": "unexpected_http_status",
    "http_error": "local_request_failed",
}
try:
    for mode, error in cases.items():
        completed = subprocess.run(
            [pwsh, "-NoLogo", "-NoProfile", "-File", str(script), "-ExpectedCompany", company,
             "-ReportedRelease", "synthetic-release", "-Port", str(server.server_port)],
            capture_output=True, text=True, timeout=20, check=True,
        )
        assert "PRIVATE_SENTINEL" not in completed.stdout + completed.stderr
        assert "synthetic-company-guid" not in completed.stdout + completed.stderr
        receipt = json.loads(completed.stdout[completed.stdout.index("{"):])
        assert receipt["crm_sync"] == "not_connected"
        assert receipt["customer_data_uploaded"] is False
        assert receipt["broadcasts_activated"] is False
        if error is None:
            assert receipt["status"] == "company_read_verified"
            assert receipt["company"] == company
        else:
            assert receipt["status"] == "blocked"
            assert receipt["error_code"] == error, (mode, receipt["error_code"])
    assert requests == list(cases)
    assert redirect_hits == [], "The probe followed a redirect"
    print(f"{len(cases)} HTTP fixture cases passed; one Export request each, no redirects or uploads.")
finally:
    server.shutdown()
    target.shutdown()
