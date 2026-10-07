# Hemy360 viewer lab — team handoff

## Purpose and status

This repository is a local research viewer for combining BIM, K2/XGRIDS LCC2 Gaussian splats, point clouds, image markers and 360° photo bubbles. It is a prototype for the future Hemy360 digital twin, not a production Hemy360 integration. The pages are `/` (That Open BIM lab) and `/lcc2.html` (combined scan/BIM pilot).

The BIM page uses Three.js, That Open Components, Fragments and web-ifc. The scan page adds the licensed XGRIDS LCC Web SDK. The lab currently contains BS17 and HG62-specific routes and assumptions. A fresh checkout contains code and the web-ifc runtime, but no scan, photo, IFC, Fragments or XGRIDS SDK datasets.

## Quick start

1. Install a supported Node.js version and pnpm. Run `pnpm install`.
2. Obtain the licensed XGRIDS Web SDK through the approved team channel. Run `./scripts/install-xgrids-web-sdk.ps1 -Archive <zip-path>` in PowerShell. Do not commit the SDK.
3. Copy `.env.example` to `.env.local` and set only the local roots you need. Keep raw scans and photos outside the repository.
4. Run `pnpm dev`, then open `/` or `/lcc2.html?scan=bs17-loftet` on the reported local address. The BS17 page needs the matching local files to render.
5. Run `pnpm build` before sharing a change. The normal build excludes local model/scan data.

The viewer has a **Norsk / English** selector on both pages. The preference persists locally, and `?lang=en` or `?lang=no` can select a language in a shared local link. UI copy is maintained in `src/i18n.ts`; keep technical IDs, model metadata, source labels and measured values unchanged when translating.

## Current capabilities

| Area | Current lab behavior | Boundary |
| --- | --- | --- |
| BIM | Load IFC or Fragments; inspect model elements; use visibility, section and selection controls | Large IFC conversion in the browser can exhaust memory. Fragments are preferred for the tested full models. |
| LCC2 / 3DGS | Stream an LCC2 export through the XGRIDS SDK; switch some scans to point display | Requires the complete LCC2 export and licensed SDK. A `.lcc2` manifest alone is insufficient. |
| Scan markers | Show GCP, POI, HDE and POV markers with front and fisheye photos; open a provisional 360° bubble | Image seam and orientation are not calibrated. Markers are observations, not asset records. |
| Scan alignment | Visually compare BS17 loft and Hendrix in a shared provisional frame; inspect possible GCP matches | Candidate matches and BIM registration are not survey-approved. Do not use the visual overlay as measured truth. |
| Sections | Apply X, Y and Z cuts to scans, BIM and markers in the combined page | Height separation is a viewing aid and does not alter source coordinates. |

## Architecture map

- `src/main.ts` and `src/ui-templates/`: That Open BIM lab.
- `src/lcc2-pilot.ts`, `lcc2.html` and `src/lcc2-pilot.css`: combined scan/BIM page.
- `src/i18n.ts`: shared Norwegian/English UI copy and language selector behavior.
- `vite.config.ts`: local read-only scan/photo middleware and code-only build rules.
- `scripts/`: local conversion, scan inspection and index generation tools.
- `public/wasm/`: distributable web-ifc runtime and its license.
- `.env.example`: names of optional local scan and photo roots.

## Data and integration rules

The six-digit capture suffix is the stable link between a K2 raw capture and its processed export. Preserve capture IDs, point source labels and original GNSS status. Treat `status=4` as a potential RTK fixed anchor; `status=1` is single and insufficient for georeferencing. A shared GCP name requires confirmation that two observations refer to the same physical target. Record source, CRS, transformation, residuals and approval state when adding alignments.

Hemy360 Hard Asset IDs, Fabric IQ ontology links and IFC GUIDs should be linked through explicit, versioned references. Do not infer that a visible splat is an approved Hard Asset or write unverified scan properties back to BIM/asset records. Before production integration, define authenticated model/photo delivery, tenant isolation, authorization, asset identity mapping, update semantics, provenance and performance budgets with the Hemy360 team.

## Collaboration workflow

- Use English for issues, pull requests, architecture notes and team-facing documentation. UI copy goes into both language variants.
- Keep changes narrow and state which local datasets and SDK version were used for verification. Include screenshots or measured results when changing alignment, rendering or performance.
- Keep raw scans, model exports, photos, derived point indexes, `.env.local`, credentials and the licensed SDK outside Git. The ignore rules are in `.gitignore`.
- Ask a reviewer to inspect coordinate and identity changes separately from visual/UI changes. A successful build does not validate georeferencing or Hemy360 integration.

## Suggested next work

1. Replace BS17-specific paths and model assumptions with a versioned dataset manifest and authenticated content endpoints.
2. Formalize scan/BIM coordinate frames and GCP candidate review, with accepted residual thresholds and an approval trail.
3. Define stable links from selectable BIM/scan objects to Hemy360 Hard Assets and Fabric IQ, then test the round trip against a small approved sample.
4. Measure cold-load time, peak RAM/VRAM and interaction performance with representative datasets on target hardware.

## Known limitations of the language layer

The language selector translates viewer-owned labels and common status messages. Content supplied by IFC/LCC2 files and messages emitted by third-party components remain in their source language. The current module also bridges legacy UI text created directly by the existing pages; new viewer-owned text should be added to `src/i18n.ts` in both languages. Translation coverage should be checked when adding features.
