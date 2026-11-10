# LEO visualization public export

Static, self-contained coverage/user/gateway audit and satellite ISL topology inspector.

One viewer supports both Hypatia's idealized toroidal plus-grid (`topology=plus-grid`) and OCM's inferred version-budget ISLs (`topology=ocm`). Combine either with `view=3d`, `view=map`, `view=orbital` (normalized unsnapped), or `view=grid`. For example: https://markverick.github.io/leo-vis-public/topology.html?topology=plus-grid&view=3d

Gateway mapping is selectable: `mapping=closest` preserves geographically closest fixed registration; `mapping=anycast` selects a fewest-hop eligible gateway; `mapping=pop` targets gateways in the user's modeled nearest-PoP region. The destination, route, and radius reachability update together. Radius counts ISLs plus the gateway downlink, excluding user access and virtual outlet cost. Required radii are computed from each model's processed data; unreachable destinations remain unreachable. PoP regions are modeled associations, not measured backhaul.

GSL assumptions follow the model provenance shown in the viewer: plus-grid uses unlimited gateways per satellite, 8 satellites per gateway, and 25° gateway elevation. OCM inferred uses 2 gateways per V1.5 satellite or 3 per V2 Mini/optimized satellite, 32 satellites per gateway, and 10° gateway elevation. OCM links are allocated by globally sorting eligible gateway–satellite pairs by distance and accepting pairs while both endpoints have capacity. User access remains one satellite at 25°. These are idealized topology settings.
Expected Pages URL: https://markverick.github.io/leo-vis-public/

The Topology / shell selector also includes 32 GP-catalog scenarios: the full 11,156-object Starlink snapshot, four major inclination families, and eleven altitude/inclination bands, each with proximity and plus-grid link models. Example: https://markverick.github.io/leo-vis-public/topology.html?topology=gp-all-proximity&view=3d&mapping=anycast

The full catalog retains small/unmatched populations, including objects whose operational state is unknown. The display bands are not certified shells. GP positions are propagated to one common epoch; new links assume a uniform four-terminal budget and sampled geometry limits, with cross-band links disabled by default. These are modeled ISLs, not measured connectivity. OCM remains its separately pinned single-shell reference. Some selections cannot reach every sampled user; the UI reports that without dropping users.

Additional shell datasets are compressed processed JSON loaded on selection. Serving through HTTP and a browser with native gzip `DecompressionStream` support are required. No live external catalog query runs in the browser. The source catalog metadata retains epochs and hashes; raw OCM and collection source trees are not included.

The site contains processed data and source/assumption audits under `site/data/`, with a SHA-256 manifest. No runtime API, map service, or package installation is required. Open the grid inspector to switch between logical plane/slot, geographic, and orbital views.

Coverage is historical (April 9, 2024), gateway deployment includes documented community-source assumptions, and ISLs are inferred. The landing page explains the cost convention and fixed-gateway versus optimistic anycast results. Upstream attribution and rights are retained; no blanket license is asserted for upstream data.

## Validate and preview

```sh
python3 scripts/verify.py
python3 -m http.server 8000 --directory site
```

## GitHub Pages

The root entry page opens `site/` when Pages serves the `main` branch from `/ (root)`. No Jekyll processing is needed. Alternatively, select **GitHub Actions** in **Settings → Pages → Build and deployment → Source**; the `Publish static visualizations` workflow deploys `site/` directly on pushes to `main` and can be rerun from Actions.

## Refreshing the frozen export

The originating research workspace exports an explicit allowlist with `python -m tools.locality.publish_static /path/to/leo-vis-public/site` after regenerating and auditing its maps. Commit the resulting files here. CI verifies manifest hashes, JSON, and relative links before deployment.
