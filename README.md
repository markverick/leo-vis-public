# LEO visualization public export

Static, self-contained coverage/user/gateway audit and satellite ISL topology inspector.

Expected Pages URL: https://markverick.github.io/leo-vis-public/

The site contains processed data and source/assumption audits under `site/data/`, with a SHA-256 manifest. No runtime API, map service, or package installation is required. Open the grid inspector to switch between logical plane/slot, geographic, and orbital views.

Coverage is historical (April 9, 2024), gateway deployment includes documented community-source assumptions, and ISLs are inferred. The landing page explains the cost convention and fixed-gateway versus optimistic anycast results. Upstream attribution and rights are retained; no blanket license is asserted for upstream data.

## Validate and preview

```sh
python3 scripts/verify.py
python3 -m http.server 8000 --directory site
```

## GitHub Pages

In repository **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. The `Publish static visualizations` workflow deploys `site/` on pushes to `main` and can be rerun from Actions.

## Refreshing the frozen export

The originating research workspace exports an explicit allowlist with `python -m tools.locality.publish_static /path/to/leo-vis-public/site` after regenerating and auditing its maps. Commit the resulting files here. CI verifies manifest hashes, JSON, and relative links before deployment.
