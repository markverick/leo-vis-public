"""Verify every exported payload, local link, and download checksum."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import urlsplit, unquote

root = Path(__file__).resolve().parents[1] / "site"


class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key not in ("href", "src") or not value:
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            assert (self.directory / unquote(parsed.path)).is_file(), value


manifest = json.loads((root / "data/manifest.json").read_text())
for row in manifest:
    path = root / row["path"]
    content = path.read_bytes()
    assert len(content) == row["bytes"], path
    assert hashlib.sha256(content).hexdigest() == row["sha256"], path
for path in root.rglob("*"):
    if path.suffix in (".json", ".geojson"):
        json.loads(path.read_text())
    if path.suffix == ".html":
        parser = Links()
        parser.directory = path.parent
        parser.feed(path.read_text())
print(f"Verified {len(manifest)} exported files, JSON payloads, and local links.")
