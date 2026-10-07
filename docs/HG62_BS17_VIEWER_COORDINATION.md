# Hemy360 viewer coordination: HG62 BIM and BS17 scan lab

Status: proposal for review with the HG62 viewer owner and Hemy360 team. No repository merge, data transfer, or production integration is implied by this note.

## Current work

| | [HG62 digital twin viewer](https://github.com/champeon492-afk/hemy-360-digital-twin) | [Hemy360 viewer lab](https://github.com/jsr-semy/hemy360-viewer-lab) |
| --- | --- | --- |
| Main strength | HG62 IFC/Fragments navigation: spatial and type trees, element search/selection, relationship graph and BIM controls | BS17 LCC2 splats, point display, GCP/POI/HDE/POV markers, photos/360 bubbles, provisional scan alignment and BIM overlay |
| Browser stack | Vite, JavaScript, Three.js 0.182.0, That Open Components/Fragments 3.4.x | Vite, TypeScript, Three.js 0.184.0, That Open Components/Fragments 3.4.x, licensed XGRIDS Web SDK |
| Example data | HG62 IFC-derived model and relationship indexes | BS17 Loft 152950, Hendrix 152958 and ARST IFC-derived Fragments |
| Data delivery | Public GitHub Pages build currently includes `HG62.frag`, `elements.json` and `ifc-relationships.json` | Private code repository; scans, images, IFC/Fragments and SDK are kept outside Git |

The HG62 README describes telemetry and enterprise controls as demonstrations, not live Fabric or equipment connections. The BS17 lab has no production Hemy360 asset update path. Both are valuable prototypes; neither should be described as a completed digital-twin integration.

## Recommended joint pilot

Use **one property and one dataset** for an integration test: BS17 ARST IFC/Fragments plus Loft 152950 and Hendrix 152958 LCC2. Keep the HG62 viewer available as the reference for BIM navigation and relationship UX. Compare the viewers against the same tasks rather than judging them from different buildings.

1. Make the HG62 repository private before using the real HG62 model for team development. Its current GitHub Pages build serves `HG62.frag` and metadata publicly. The repository owner should disable or restrict Pages separately, then verify that the model URL is no longer publicly accessible; a private repository does not by itself guarantee a private Pages site on every GitHub plan. Agree on repository ownership, model hosting and SDK redistribution rules before exchanging more data. Do not copy BS17 scans or photos into a public build.
2. Pin a compatible set of Three.js, That Open Components and Fragments versions. Test worker and `.frag` compatibility before moving components between repositories.
3. Define a small shared data contract: `propertyId`, `sourceId`, `captureId`, `modelVersion`, `kind`, URL, CRS/vertical datum, local-to-property transform, transform status, and access policy. Use IFC `GlobalId` for BIM elements, K2 capture/point IDs for scan observations, and a separate Hemy360 Hard Asset ID for approved operational assets.
4. Prototype BIM tree/selection alongside the BS17 scan layers. A selected BIM element should show its IFC identity and properties; a selected scan point should show its source ID, GNSS status and associated images. Do not silently turn either into an approved Hard Asset.
5. Test common visibility/section controls and a single camera frame. The two applications currently create their own scenes and camera controls; a combined UI alone does not prove that their renderers, picking and clipping are integrated.
6. Validate cold load, peak RAM/VRAM, camera interaction, IFC selection, image opening and coordinate residuals on representative hardware. Record failures and data versions.

## Suggested ownership for the pilot

- HG62 viewer team: BIM spatial/type explorer, element selection, IFC relationship index and model UX.
- BS17 lab team: LCC2 rendering, scan markers/photos, GCP review and scan/BIM registration evidence.
- Joint review: scene architecture, shared data contract, package versions, bilingual UI and acceptance tests.
- Hemy360 platform owners: authenticated content delivery, tenant access, Hard Asset/Fabric IQ identity mapping and API write semantics.

## Decisions before a shared release

- Choose the codebase and ownership model for the eventual common viewer after the BS17 pilot; avoid maintaining two production viewers.
- Treat HG62 and BS17 model data as restricted for this pilot. The HG62 repository owner should change it to private and check the Pages deployment. Earlier public exposure may persist in existing clones, forks or caches; changing visibility does not retract copies already obtained.
- Decide where authenticated, byte-range capable model/image hosting will live. Dropbox is suitable for distributing a test ZIP, not the production stream endpoint.
- Confirm survey control: `status=4` is only a candidate RTK fixed observation until target identity, CRS, height datum and residuals are checked.

## Initial acceptance test

In one browser session, load the BS17 ARST Fragments model with both LCC2 captures; toggle each layer; select one IFC element and one K2 point; open its front image and 360 bubble; inspect the same scene with X/Y/Z sections. The result should be reproducible from a versioned data manifest and should state which alignments are provisional.
