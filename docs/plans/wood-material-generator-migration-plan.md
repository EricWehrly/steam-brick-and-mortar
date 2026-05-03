# Wood Material Pipeline Migration Plan

## Context
The codebase currently has two wood material paths:

1. Legacy file-backed path in `WoodMaterialGenerator.createMaterial(...)` with default URLs under `/textures/wood/*`.
2. Active procedural path in `SharedMaterialManager` using `ProceduralTextureWorker` (`wood_planks`, `wood_enhanced`, `wood_normal`).

This dual-path setup creates confusion and makes hosting fixes look inconsistent.

## Current Reality
- Wall wood and MDF veneer currently come from `SharedMaterialManager` prewarm methods.
- `BasicWood` prewarm exists but is intentionally not prewarmed in the active startup path.
- `WoodMaterialGenerator.createProceduralMaterial(...)` exists but has no current call sites.
- The file-backed defaults in `WoodMaterialGenerator.createMaterial(...)` require base-aware URL handling and appear to rely on texture files that may not exist in `client/public/textures/wood/`.

## Problem Statement
The project keeps both:
- a legacy file-backed wood API surface, and
- a newer worker-based procedural pipeline.

This increases maintenance cost and leads to ambiguity about which path is authoritative.

## Decision Target
Choose and enforce one authoritative wood path for runtime:

Preferred: shared worker/procedural path (`SharedMaterialManager` + `ProceduralTextureWorker`).

## Goals
1. Make one wood pipeline authoritative.
2. Remove or explicitly gate dead/legacy entry points.
3. Keep visual output stable (or intentionally improved) with measured diffs.
4. Prevent regressions for hosting/base-path behavior.

## Non-Goals
- Reworking all material systems in one pass.
- Large stylistic refactors unrelated to wood materials.

## Migration Phases

### Phase 1: Usage and ownership audit
- Confirm all runtime consumers of wood-like materials:
  - `MaterialType.WallWood`
  - `MaterialType.MdfVeneer`
  - `MaterialType.BasicWood` (if introduced)
- Document any direct usages of `WoodMaterialGenerator` methods.
- Decide owner:
  - Runtime owner: `SharedMaterialManager`
  - Legacy/testing owner: `WoodMaterialGenerator` (temporary)

### Phase 2: Deprecate legacy file-backed entry path
- Mark `WoodMaterialGenerator.createMaterial(...)` as legacy/deprecated in code comments.
- Stop using file-backed defaults for production runtime.
- If backward compatibility is needed, require explicit URLs (no implicit `/textures/wood/*` defaults).

### Phase 3: Unify procedural profile
- Align wood tuning constants between:
  - `WoodMaterialGenerator` procedural methods
  - `SharedMaterialManager` prewarm methods
- Decide whether to keep `BasicWood`:
  - either prewarm and use it,
  - or remove the unused type and dead helpers.

### Phase 4: Cleanup and enforce
- Remove unused public APIs once callers are migrated.
- Add tests/guards for expected material availability from `SharedMaterialManager`.
- Add docs note in material architecture docs describing canonical path.

## Validation Checklist
1. Runtime shelf/wall materials render correctly with procedural maps.
2. No startup fetch attempts for `/textures/wood/*` unless explicitly opted in.
3. GitHub Pages/base-path behavior unaffected by wood material code.
4. No dead references to removed entry points.

## Risks and Mitigations
- Risk: visual regressions after removing legacy path.
  - Mitigation: screenshot baselines and side-by-side comparisons.
- Risk: hidden caller relies on `createMaterial(...)` defaults.
  - Mitigation: search + temporary runtime warning before removal.
- Risk: startup perf changes.
  - Mitigation: keep worker prewarm and monitor startup timings.

## Candidate Files
- `client/src/utils/materials/WoodMaterialGenerator.ts`
- `client/src/utils/SharedMaterialManager.ts`
- `client/src/utils/textures/ProceduralTextureWorker.ts`
- `client/src/scene/RoomManager.ts`
- `client/src/scene/instancing/InstancedShelfRenderer.ts`

## Suggested Next Step
Implement Phase 1 as a small PR:
- add deprecation note + optional warning in legacy file-backed path,
- confirm no runtime callers,
- decide whether `BasicWood` remains in scope.
