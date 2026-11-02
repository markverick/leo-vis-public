# LEO visualization public export

Static, self-contained coverage/user/gateway audit and satellite ISL topology inspector.

One viewer supports both Hypatia's idealized toroidal plus-grid (`topology=plus-grid`) and OCM's inferred version-budget ISLs (`topology=ocm`). Combine either with `view=3d`, `view=map`, `view=orbital` (normalized unsnapped), or `view=grid`. For example: https://markverick.github.io/leo-vis-public/topology.html?topology=plus-grid&view=3d

Expected Pages URL: https://markverick.github.io/leo-vis-public/

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
