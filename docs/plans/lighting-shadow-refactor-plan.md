# Lighting Shadow Refactor Plan

## Goal
Reduce complexity in `LightingRenderer` by separating shadow policy from lighting lifecycle orchestration while preserving current behavior and startup characteristics.

## Why now
Recent shadow fixes improved correctness, but shadow logic is still spread across lifecycle setup, quality changes, and room updates. The next pass should reduce policy duplication and make intent easier to maintain.

## Current boundary problems
- `LightingRenderer` owns startup/upgrade lifecycle, room adaptation, fixture management, and shadow policy in one class.
- Shadow caster gating has historically diverged between directional and spotlight paths.
- Directional shadow camera fitting depends on room footprint but is configured inline with light setup logic.

## Target architecture
1. `LightingLifecycleCoordinator` (or keep in `LightingRenderer` initially)
- Owns setup/upgrade/toggle orchestration and quality mode transitions.

2. `ShadowPolicy`
- Owns global shadow enable/type decisions.
- Owns per-light shadow application policy.
- API shape (example):
  - `applyRendererShadowPolicy(renderer, config)`
  - `applyLightShadowPolicy(light, config)`
  - `fitDirectionalShadowCamera(light, roomDimensions)`

3. `RoomLightingAdapter`
- Owns room-dimension-driven light updates.
- Calls directional shadow-camera refit only when width/depth changes.

## Incremental rollout
### Step 1 (done in current branch)
- Introduce one shared per-light shadow policy method used by directional and dramatic spotlight paths.
- Refit directional shadow cameras only when room width/depth changes.
- Add regression coverage for both behaviors.

### Step 2
- Extract shadow helpers to a dedicated module while preserving existing call sites.
- Keep behavior identical; no feature changes.

### Step 3
- Move room-driven adaptation logic into a focused helper/module.
- Keep event wiring in `LightingRenderer` until stable.

### Step 4
- Optional: split lifecycle orchestration into a coordinator if class still feels overloaded after Steps 2-3.

## Validation checklist
- Shadow behavior remains correct for:
  - `shadowMapEnabled` on/off
  - `shadowQuality` off/low/medium/high
  - room resize (width/depth changes)
- No startup regression from basic/upgrade lighting phases.
- No new light-registry or UI diagnostics regressions.

## Non-goals
- Changing the visual look of all lighting profiles.
- Reworking signage/artwork material shading strategy in this pass.
