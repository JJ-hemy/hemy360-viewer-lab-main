# BS17 viewer: demo navigation and follow-up

The project picker is a local demo representation of the hierarchy visible in the supplied Hemy Projects screenshot. The proposed “Objektifisering av skannede Hard Assets” entry sits beneath “BS17 - Construction Project: Main Project”; it has not been created as a Dynamics project. The Hemy Projects button opens the project platform, not a specific record, because record identifiers were not supplied.

The sidebar groups scan tools and BIM tools. Active scan layers use compact rows with visibility, overlap priority, and an action menu. On desktop, a short right click opens that menu while right dragging continues to pan. The mobile canvas uses a small toolbar for layer actions, direct surface sectioning, detailed section options, and fit view. Two finger spread/pinch changes zoom and moving both fingers pans; one finger continues to orbit.

Section options use a surface-placed arbitrary-angle plane as the default, a horizontal height cut, and a movable/rotatable/scalable clipping box. World-axis X/Y cuts were removed from the interface because they can run diagonally through the building. On mobile, **Snitt** starts a surface tap; **Snittvalg** opens the full controls. A tap uses a scan raycast and estimates an initial normal from nearby hits, with a camera-facing fallback for noisy splats. Roof taps from above start horizontally. The 3D gizmo and angle controls provide manual refinement. Verify placement against known geometry before using it for measurements or object registration. The local-network preview serves restricted pilot data only while that process is running; it is not a published Hemy360 deployment.

## Next design work

- Develop the BIM model tree further when the proposed GitHub reference is available. Define hierarchy, selection and filter behavior against real IFC structure and properties before changing the current tree.
- Consider a floating scan/BIM toolbar after mobile and desktop use has been observed in the field. Keep scan and BIM commands distinct in the navigation.
- Plan Blender/Bonsai integration for the noted workflows P46a1 (operations), P47b1 (project), and P65. This is a later workflow integration, not part of the demo navigation.
- Validate gestures, frame rate, and control reach on physical mobile devices against the current viewer before replacing its navigation model.
