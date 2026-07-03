# Feature: Procedural Texture Quality Pass

**Act**: 2 (Intermission — nice to have)  
**Status**: In Progress — **direction changed 2026-07**: adopting a Material Maker authoring/bake pipeline; the runtime worker-generation system is being retired  
**Priority**: Low–Medium  
**Implementation Plans**:
- [`docs/plans/procedural-materials-pipeline-plan.md`](../plans/procedural-materials-pipeline-plan.md) — cross-project tool choice + pipeline (current direction)
- [`docs/plans/procedural-textures-project-plan.md`](../plans/procedural-textures-project-plan.md) — this store's texture inventory + phased adoption
- [`docs/plans/procedural-materials-open-questions.md`](../plans/procedural-materials-open-questions.md) — pending decisions
- `docs/plans/enhanced-textures.md` — **legacy** system reference (worker types, parameter values); useful until Phase 2 retirement completes

## Goal

Improve the visual quality and fidelity of the store's dynamically generated textures — shelves, walls, ceiling, and floor — so surfaces don't visibly read as procedurally generated when standing in the scene.

## Context

Several texture types were implemented during Act 1 as functional placeholders. They work, but they're not at the quality bar needed before showing the app to friends. Three areas are connected by the same underlying concern (procedural texture fidelity) even though they touch different parts of the scene:

- **Shelf surface (MDF veneer)** — current material is generic; needs a more convincing MDF or wood-veneer look with brand-consistent blue accents on shelf components
- **Popcorn ceiling** — implemented but bumpiness, color, and tiling don't read correctly at ceiling scale in VR
- **Wood plank walls** — grain direction, plank scale, and tiling need a second pass to feel like a real video store back wall
- **Floor / carpet** — custom carpet textures are in scope as part of the same fidelity push

These are grouped because they share an approach (iterating procedural worker output, evaluating Godot-based generation as an alternative) and because shelf polish specifically connects to the broader store atmosphere work.

## Acceptance Criteria

- Shelf surface reads as MDF veneer or convincing wood-veneer material; blue accent is brand-consistent
- Ceiling texture reads as realistic popcorn ceiling overhead in VR
- Wall plank texture reads as a real video store back wall (grain direction correct, plank scale appropriate, tiling not obvious)
- Floor/carpet texture is visually convincing at standing height
- No surface visibly reads as procedurally generated to a first-time observer in the scene

## Stories / Tasks

- **Shelf / MDF veneer**: iterate procedural shelf material; apply brand-consistent blue accent to shelf components
- **Popcorn ceiling**: revisit bumpiness, color, and tiling at ceiling scale; tune or replace texture
- **Wood plank walls**: evaluate current proportions, color variation, and grain fidelity; improve or replace
- **Carpet**: design and implement custom carpet texture; integrate with floor rendering
- **Godot investigation** ✅ resolved by direction change: Material Maker (Godot-based) selected as the authoring tool — see the pipeline plan. The worker-based approach is being retired rather than iterated.

## Notes / Open Questions

- Shelf visual polish was originally deferred from Act 1 Feature 6.1.
- Tiered lighting quality is a separate feature — see [Lighting and Atmosphere](./lighting-and-atmosphere.md).
- The Godot investigation is optional — only worth pursuing if the current procedural worker approach has a clear quality ceiling.
- Texture work should be validated under multiple lighting conditions; the lighting preset system affects how these surfaces read.
- Related plan docs: `docs/plans/popcorn-ceiling-plan.md`.
