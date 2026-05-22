# Showcase Scene Comparison Plan

## Status
Planned spike for a follow-up branch after the current artwork/shadow tuning PR lands.

## Goal
Build a controlled showcase scene that lets us compare artwork tuning presets side-by-side without disturbing the normal store bootstrap.

The immediate use case is the current branch work on artwork boxes:
- roughness / metalness tuning
- fresnel edge lift
- shadow contact grounding

The comparison scene should keep the rest of the setup stable so each row or grouping isolates one tuning family at a time.

## Why This Exists
We need a review-friendly way to inspect material and lighting changes before committing to a final look.

Right now the normal scene bootstrap is optimized for a full store build, not for controlled visual comparison. The existing deferred startup seam is useful, but it should be extended into an explicit mode rather than overloaded with ad hoc debug behavior.

## Current Seam To Reuse
The current scene startup path already defers world building until after controls are ready:
- `client/src/core/SteamBrickAndMortarApp.ts` starts scene setup after the render loop is live.
- `client/src/scene/SceneCoordinator.ts` already exposes a deferred `startSceneSetup()` entry point.

That is the right place to branch into a showcase path.

## Proposed Shape

### 1. Add A Showcase Scene Mode
Extend scene bootstrap so it can choose between:
- normal store build
- empty/debug scene
- showcase comparison scene

This should be a config-driven branch rather than a hardcoded special case.

Likely extension points:
- `client/src/scene/SceneCoordinator.ts`
- `client/src/scene/SceneManager.ts`
- any debug/startup wiring that currently chooses between normal build and debug behavior

### 2. Build A Showcase Layout
The showcase scene should render a fixed grid or lane layout with repeatable camera framing.

Recommended first pass:
- 3 comparison columns
- 1 row per tuning family
- one family changes at a time
- all non-target tunables stay at current defaults

That gives us a clean read on each change without cross-talk.

### 3. Use Current Defaults As Baseline
For the first version, keep the preset values conservative and familiar.

Each grouping should have:
- a baseline/default box
- one or two comparison variants for the active family
- the remaining families fixed to current defaults

This keeps the scene easy to interpret and avoids mixing too many variables at once.

## Comparison Matrix

### Row 1: Roughness / Metalness
Compare the current scalar defaults against a couple of adjacent variants.

### Row 2: Fresnel Edge Lift
Compare the current default edge lift against lower and higher emphasis options.

### Row 3: Shadow Contact Grounding
Compare the current shadow contact settings against softer and tighter contact variants.

If we want a tighter first pass, we can start with only one row and make the other two rows placeholders.

## Implementation Strategy

### Phase 1: Scene Branching
1. Identify or formalize the existing debug/empty-scene startup path.
2. Add a showcase mode flag to scene bootstrap.
3. Route showcase mode through a dedicated builder instead of normal store construction.

### Phase 2: Showcase Builder
1. Lay out the comparison scene with stable camera and lighting.
2. Spawn three boxes per active comparison set.
3. Apply one tuning family per grouping while holding all other values constant.

### Phase 3: Review Controls
1. Add a simple way to select which comparison family is being shown.
2. Add a reset path so the scene can return to defaults.
3. Add debug labels or markers only if they improve review clarity.

### Phase 4: Validation
1. Capture side-by-side screenshots for the three families.
2. Verify the scene still boots cleanly from the normal path.
3. Verify the showcase path does not alter production scene construction.

## Acceptance Criteria
- We can launch a branch-local showcase scene without affecting the default store build.
- The scene shows side-by-side comparisons with only one tuning family varying per grouping.
- The comparison layout is stable enough for screenshot review.
- The normal startup path remains unchanged.

## Open Questions
- Should the showcase scene use a true empty room, or a minimal store slice with only the relevant shelves and lights?
- Should the comparison grid be controlled by a debug flag, a query parameter, or a temporary UI control?
- Do we want one showcase scene per tuning family, or a single grid that can swap active families?
- Should the comparison path reuse live app data, or should it pin a small set of fixed test games for consistency?

## Out Of Scope
- Production UI polish for the showcase selector.
- A permanent in-game photo mode.
- Any broader renderer refactor beyond what is needed to branch scene setup cleanly.

## Suggested Next Step
After the current PR feedback is resolved and the branch merges, create a fresh spike branch and implement the showcase mode behind the existing deferred scene startup seam.