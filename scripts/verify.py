"""Verify every exported payload, local link, and download checksum."""
import hashlib
from html.parser import HTMLParser
import json
import gzip
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


# Private evaluation figures must never enter a public Pages artifact.
for private_path in (
    'figures/plus-grid-gateway-hops-t0.png',
    'figures/ocm-gateway-hops-t0.png',
    'figures/index.html',
):
    assert not (root / private_path).exists(), f'Private artifact in public export: {private_path}'

manifest = json.loads((root / "data/manifest.json").read_text())
for row in manifest:
    path = root / row["path"]
    content = path.read_bytes()
    assert len(content) == row["bytes"], path
    assert hashlib.sha256(content).hexdigest() == row["sha256"], path
for path in root.rglob("*"):
    if path.suffix in (".json", ".geojson"):
        json.loads(path.read_text())
    if path.name.endswith(".json.gz"):
        json.loads(gzip.decompress(path.read_bytes()))
    if path.suffix == ".html":
        parser = Links()
        parser.directory = path.parent
        parser.feed(path.read_text())
print(f"Verified {len(manifest)} exported files, JSON payloads, and local links.")

# Every model must retain all admitted source destinations, even without GSLs.
import csv
inventory = {g['gateway_id'] for g in csv.DictReader((root/'data/gateways.csv').open())}
models = [root/'data/snapshot.json', root/'data/plus-grid/snapshot.json',
          root/'data/ocm/topology.data.json', root/'data/plus-grid/topology.data.json']
models += list((root/'data/fleet').glob('*.json.gz'))
for path in models:
    document = json.loads(gzip.decompress(path.read_bytes()) if path.name.endswith('.gz') else path.read_bytes())
    actual = [g['id'] for g in document['gateways']]
    assert len(actual) == len(inventory) and set(actual) == inventory, path
    assert not document['provenance'].get('gateway_exclusions', {}).get('gateway_ids'), path
print(f'Verified all {len(models)} model payloads retain the same {len(inventory)} gateway sites.')
