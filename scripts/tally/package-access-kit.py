"""Build a reproducible public kit containing code/instructions only, never shop data."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[2]
downloads = root / "public" / "downloads"
filenames = ("SHALIMAR_TALLY_CHECK.ps1", "SHALIMAR_TALLY_START_HERE.html")
entries = {name: (downloads / name).read_bytes() for name in filenames}
manifest = {
    "kit_version": 1,
    "purpose": "Local read-only company identity check; no customer export or upload",
    "files": {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()},
}
entries["MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
destination = downloads / "SHALIMAR_TALLY_ACCESS_KIT.zip"
with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
    for name, data in entries.items():
        info = ZipInfo(name, date_time=(2026, 10, 8, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
print(f"Access kit prepared: {destination.name} ({destination.stat().st_size} bytes)")
