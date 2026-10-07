# Hemy360 viewer lab

Local research app for viewing IFC-derived BIM together with XGRIDS LCC2 scans, scan points, photos and panoramas. The BIM viewer uses Three.js and That Open Components/Fragments. The scan viewer additionally uses the XGRIDS LCC Web SDK.

This repository contains application code only. Scan data, IFC/Fragments models, photos, derived point indexes and the XGRIDS SDK are not included. `README.local.md` is an ignored copy of the original internal lab notes on the originating workstation.

For team scope, current capabilities, data boundaries and collaboration rules, see [Team handoff](docs/TEAM_HANDOFF.md).

## Local setup

1. Install Node.js and pnpm, then run `pnpm install`.
2. Obtain the licensed XGRIDS LCC Web SDK separately and run `./scripts/install-xgrids-web-sdk.ps1 -Archive <path-to-zip>` in PowerShell. The SDK is not redistributed here.
3. Copy `.env.example` to `.env.local` and fill in only the local scan/photo roots you need. `.env.local` is ignored by Git.
4. Run `pnpm dev -- --port 4175`. Open the BIM page at `http://127.0.0.1:4175/` or the combined BS17 viewer at `http://127.0.0.1:4175/lcc2.html?scan=bs17-loftet&theme=hemy` when matching local data are available. Do not open `lcc2.html` directly from the file system: its scripts, styles and scan streams require the local server.

The BS17 viewer has a **Design / Theme** selector. **Hemy 360** uses the proposed platform styling; **Lab · mørk** keeps the existing viewer layout. Switching themes keeps the current scene and layer selection. The selected theme is saved in this browser. Add `theme=hemy` or `theme=classic` to a link to choose a theme explicitly.

The source currently contains BS17-specific routes and references. Without the corresponding local data, those models and scans cannot load.

## BS17 capture catalog and BIM filters

Set `HEMY_BS17_CATALOG_ROOT` to the parent folder of the additional BS17 LCC2 export folders. The viewer discovers each manifest inside its export folder. Captures declaring the shared EPSG:32632 frame and offset can be selected together; captures in a separate local frame open individually. The viewer does not correct registration or vertical datum. Model order, visibility and display can be saved in the browser with **Save my preferences**. A `layers=` URL parameter takes precedence over saved layer selection.

The BS17 BIM filter reads IFC class, object names, spatial structure and property sets from the local Fragments model. For example, **MMI 300** filters the `MMI level` property. Some IFC layers and systems may not survive Fragments conversion. To retain layer membership for the local BS17 model, create an ignored sidecar index from the corresponding IFC export:

```text
node scripts/build-ifc-viewer-index.mjs <source.ifc> public/models/BS17-SEMY-ARST-ASBUILT-v2.index.json
```

The IFC source and generated index remain local or in an access-controlled data store. The sidecar is optional; the viewer reports when a filter field has no readable values. The current BS17 IFC has presentation layers but no IFC system assignments.

## Builds and hosting

`pnpm build` creates a code-only `dist/` and copies the web-ifc WASM runtime. It excludes all local files under `public/` except the WASM runtime. Do not upload a local data build to a web host. `HEMY_INCLUDE_LOCAL_DATA=1` is intended only for a controlled local preview; with that setting Vite copies `public/` into `dist/`.

The local Vite server has read-only middleware for configured scan and photo folders. A production web server must provide authenticated model and image endpoints, including byte-range access for streamed LCC2 content. The current code is a lab, not a deployed Hemy360 integration.
