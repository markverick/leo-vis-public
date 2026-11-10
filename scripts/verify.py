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

# GSL limits apply to the complete graph, independently of route/radius selection.
from collections import Counter
for path in models:
    document = json.loads(gzip.decompress(path.read_bytes()) if path.name.endswith('.gz') else path.read_bytes())
    rules = document['provenance']['attachment_rules']
    topology = document['provenance']['topology']
    if topology == 'hypatia_starlink_550':
        assert rules['gateway'] == {'capacity': 8, 'minimum_elevation_deg': 25.0}, path
        assert rules['satellite']['gateway_capacity_by_version'] == {}, path
        assert rules['satellite']['default_gateway_capacity'] is None, path
    if topology == 'starlinkocm_463km_version_budget':
        assert rules['gateway'] == {'capacity': 32, 'minimum_elevation_deg': 10.0}, path
        assert rules['satellite']['gateway_capacity_by_version'] == {'V1.5': 2, 'V2 Mini': 3, 'V2 Mini optimized': 3}, path
        assert rules['selection'] == 'shortest_distance_pairs_first', path
    caps = rules['satellite']['gateway_capacity_by_version']
    # Raw snapshots identify satellites by name; the adjacent processed CSV
    # provides their versions. Viewer payloads carry versions directly.
    if document['satellites'] and isinstance(document['satellites'][0], str):
        source = root / ('data/satellites.csv' if topology.startswith('starlinkocm') else 'data/plus-grid/satellites.csv')
        versions = {'sat-' + r['satellite_id']: r.get('version') for r in csv.DictReader(source.open())}
    else:
        versions = {'sat-' + r['satellite_id']: r.get('version') for r in document['satellites']}
    for phase in ('before', 'after'):
        counts = Counter()
        for gateway in document['gateways']:
            links = gateway['attachments_' + phase]
            assert len(links) <= rules['gateway']['capacity'] and len(links) == len(set(links)), path
            counts.update(links)
        if caps:
            assert all(versions[s] in caps and count <= caps[versions[s]] for s, count in counts.items()), path
print('Verified satellite-side and gateway-side GSL limits in every exported model.')

# PoP mode must keep each physical destination in the user's modeled region.
for path in models:
    if path.name == 'snapshot.json':
        continue
    document = json.loads(gzip.decompress(path.read_bytes()) if path.name.endswith('.gz') else path.read_bytes())
    pops = {p['pop_id'] for p in document['pops']}
    gateways = {g['id']:g for g in document['gateways']}
    users = {u['id']:u for u in document['users']}
    edges = {tuple(sorted(e)) for e in document['isls']}
    assert len(pops) == 52, path
    assert all(g['assigned_pop_id'] in pops for g in gateways.values()), path
    for phase, state in document['snapshots'].items():
        assert set(state['pop_paths']) == set(users), path
        assert state['audit']['pop_paths_independent_forward_bfs'], path
        for uid, route in state['pop_paths'].items():
            assert route['pop_id'] == users[uid]['assigned_pop_id'], path
            assert route['destination_prefix'] == '/pop/'+route['pop_id'], path
            nodes = route['nodes']
            if nodes:
                assert nodes[0] == users[uid]['satellite'], path
                assert nodes[-1] == route['selected_gateway_id'], path
                assert gateways[nodes[-1]]['assigned_pop_id'] == route['pop_id'], path
                assert nodes[-2] in gateways[nodes[-1]]['attachments_'+phase], path
                assert route['network_hops'] == len(nodes)-1 and route['isl_hops'] == len(nodes)-2, path
                assert all(tuple(sorted((a,b))) in edges for a,b in zip(nodes[:-2],nodes[1:-1])), path
            else:
                assert route['selected_gateway_id'] is None and route['network_hops'] is None, path
print('Verified PoP prefixes, regional destinations, and physical paths in every topology.')
