---
name: reference-to-semantic-topview
description: >
  Convert public/reference semiconductor equipment top-view photos, sketches, patents or layouts
  into editable semantic equipment-layout JSON and SVG in Semi-flat Technical Schematic style
  without claiming hidden geometry, precise dimensions or real robot kinematics.
---

# Reference → Semantic Top View Skill v0.3 (design only)

Contracts this skill follows: `docs/design/features/equipment-visualization/DESIGN-v0.4.md` (model), `VIEWS.md`, and `packages/eqv/AGENTS.md` (package rules, synthetic data only). Terms: `GLOSSARY.md` (EV entries are qualified «EV …» where they differ from AP).

## Inputs
- Reference image/drawing and optional manufacturer/model/process/known orientation.
- Existing Catalog of approved Parts/Assembly Templates and theme tokens.
- Optional side views, legends, dimension annotations, specified known wafer paths.
- Source attribution, permitted use, original revision, image quality.

Never upload confidential equipment photos, logs or drawings to external services.

## Ordered workflow / gates
1. **Evidence intake:** record URL/revision/orientation/scale; mark `not to scale` unless dimensions are verified.
2. **Structural segmentation:** identify housing, EFEM, TM, PM, load lock, robot, stage, rail, boat, ports and visible/hidden/unknown.
3. **Hierarchy:** assign parent/child local coordinates and Z levels. Preserve parallel transfer zones.
4. **Robot model:** split base, arms, wrists, blades/end-effectors and holding sites. Arm count must not be confused with blade count. Motion independence defaults to `unknown`.
5. **Port/topology:** model physical ports and possible transfers separately; adjacency is not evidence of connectivity.
6. **Reuse:** search catalog for semantically compatible primitive/assembly before creating variants.
7. **Geometry:** capture recognizable silhouette and relative positions, normalize to viewBox. Prefer simple vector geometry and semantic `<g data-component-id>` groups over traced path clouds.
8. **Uncertainty:** record `certainty` (`verified | assumed | unknown`) and `sourceEvidence` per property. Do not fill unknown chamber stacking, reachability, robot motion constraints or dimensions with plausible guesses.
9. **Style:** restrained outlines/fills, slight corners, no fake 3D; inject platform semantic theme tokens only at embedding boundary.
10. **Export:** JSON authoritative; SVG derived and editable; optional draw.io export derivative. Stable IDs, safe SVG with no external references/scripts.
11. **QA:** schema, uniqueness, parent cycles, port endpoints, Z levels, label overlap, screenshot comparison and component coverage.
12. **Adversarial review:** document alternative interpretations of uncertain shapes, reviewer resolution, what remains unknown.

## Outputs
- `packages/eqv/assets/templates/<id>.template.json` — components, ports, topology, levels, evidence.
- `packages/eqv/assets/templates/<id>.svg` — semantic vector diagram, not a raster embedded in SVG.
- `packages/eqv/assets/qa/<id>.review.md` (create the folder on first use) — verified vs assumed vs unknown, reviewer notes.
- Catalog additions (no `catalog.json` exists yet; list them in the review file): source and reason for a new component.
- Export report: source attribution, certainty per property, what was not validated.

## Blockers
- Conflicting or duplicated unique component IDs.
- Edges referencing missing port IDs, invalid hierarchy/cross-level links.
- Claims of true machine kinematics without source data.
- Static SVG that hardcodes actual running/idle status.
- Final SVG as a single flattened path with no editable semantic grouping.
- An unlicensed or confidential input mistakenly made public.
