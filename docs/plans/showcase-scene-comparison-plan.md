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
- anonymous store scene
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

### MVP (Minimal Viable Product)
Get a 3-box comparison working end-to-end with zero scaffolding.

**Phase 1: Scene Branching (Simplest Path)**
1. Add `const SHOWCASE_MODE_ENABLED = true` toggle in `SceneCoordinator.ts` (or dedicated file).
2. In `startSceneSetup()`, check the toggle and branch to `this.loadShowcaseScene()` instead of `loadEnhancedScene()`.
3. Reuse skybox, lighting, and material manager from normal path (no alternate setup needed).

**Phase 2: Showcase Builder (Hardcoded Grid)**
1. Create `ShowcaseSceneBuilder` class with a single method: `buildComparisonGrid(tuningFamily: 'roughness' | 'fresnel' | 'shadowContact'): void`.
2. Manually spawn 3 game box instances on a flat plane (e.g., at `y=0`, `x=[-2, 0, 2]`).
3. Apply the active tuning family's 3 presets to each box (default, variant1, variant2).
4. Hold all other tuning families at current defaults.
5. Use `SHOWCASE_REFERENCE_GAMES` to assign the same 3 appIds to all boxes (no library fetching).

**Phase 3: Validation**
1. Verify the scene triggers without errors.
2. Take screenshots; verify only one family varies per comparison.
3. Verify normal startup path is unchanged.

---

### Nice-to-Haves & Future Scope
Once MVP is reviewed and validated, consider:

**Alternate Spawning Paths (Larger Refactor)**
- Extract a `PropSpawner` interface that both `normal` and `showcase` modes can implement.
- Allow `empty`, `demo/anonymous`, and `steam cache` modes to share the same extensible path.
- Probably requires coordination with other upcoming work (demo scene, empty room).

**Two-Shelf Layout with Labels**
- Spawn a second shelf with 9-game grid (3 presets × 3 families).
- Add debug labels above each box (e.g., "Roughness: 0.6").
- Add camera framing adjustments for the larger layout.

**Family Selector & Reset UI**
- Add a simple text UI to select which family is being compared.
- Add a reset path to return to current defaults.

**Reference Game Registry**
- Extract `SHOWCASE_REFERENCE_GAMES` into a more structured registry (e.g., with metadata).
- Reuse the same reference set in other debug/demo contexts.

---

## Revised Implementation Phases

## Acceptance Criteria (MVP)
- ✅ Hardcoded toggle enables showcase mode without affecting normal startup.
- ✅ Showcase scene spawns 3 game boxes with one tuning family varying (other families at defaults).
- ✅ Boxes use fixed reference games (no library fetch).
- ✅ Screenshots show side-by-side comparison clearly.
- ✅ Normal startup path unaffected, verified by running without the toggle.

## Refined Open Questions (Minimal Scope)
1. **Which tuning family should MVP showcase first?**
   - Roughness/metalness, fresnel, or shadow contact?
   - Once working, rotating through all three is trivial; this just determines which one we build/test first.

2. **Fixed reference game set — which appIds should we use?**
   - Should we pull from the existing demo room set, performance fixtures, or define a new minimal set?
   - Criteria: games that load quickly, have visually distinct cover art, load reliably.

3. **Box positioning — fixed layout or camera-relative?**
   - MVP can hardcode `x=[-2, 0, 2], y=0, z=0`. Does this look good from the default camera, or should we adjust the spacing/height?
   - Walkthrough once we have boxes spawned.

## Decisions

### 1. Scene Architecture: Support Alternate Spawning Paths
✅ **Decision**: Architecture should support alternate prop-spawning paths (empty, demo/anonymous, steam cache, showcase).
- MVP will hardcode showcase behavior inline.
- **Nice-to-Have**: Extract a configurable spawning path system that all modes (default, demo, empty, showcase) can reuse.
- This means: don't bake showcase mode into the normal path; keep it separate and extensible.

### 2. Showcase Trigger: Hardcoded File Toggle (Test-Friendly)
✅ **Decision**: Hardcode a boolean in a file we don't intend to commit.
- Example: `const SHOWCASE_MODE_ENABLED = true` in `SceneCoordinator.ts` or a dedicated config file.
- Unit test the trigger logic so we can swap it to query params/UI later without refactoring the branching itself.
- **Nice-to-Have**: Query param integration (`?showcase=1`), UI toggle.

### 3. Layout: Two-Shelf Comparison Grid (Simple First)
✅ **Decision**: Two shelves. One normal. One with 9 games (3×3 grid) per tuning family preset.
- MVP: Hardcode a single grid showing one tuning family's 3 presets side-by-side on a flat plane.
- **Nice-to-Have**: Add second shelf, add labels, add family selector to swap which family is visible.

### 4. Game Data: Fixed Reference Set (Like Demo Room)
✅ **Decision**: Pin a small set of fixed appIds for consistency.
- Define a `SHOWCASE_REFERENCE_GAMES` constant with ~3–4 game appIds (e.g., same set as performance fixtures or demo room).
- **Nice-to-Have**: Expand reference set, expose as configurable registry for future reuse.

---

## Scope Strategy: MVP + Nice-to-Haves

**Why This Split?**
The original open questions each pointed toward significant architectural changes (alternate spawning paths, two-shelf grid, family selector). To deliver fast and validate the concept, we're separating:

- **MVP**: Hardcoded, minimal, gets 3 boxes comparing one tuning family. ~1–2 days of work.
- **Nice-to-Haves**: Larger refactors and UI polish that can be added after MVP validation. Can be deferred or reprioritized based on what we learn.

## Out Of Scope
- Production UI polish for the showcase selector.
- A permanent in-game photo mode.
- Any broader renderer refactor beyond what is needed to branch scene setup cleanly.

## Suggested Next Step
After the current PR feedback is resolved and the branch merges, create a fresh spike branch and implement the showcase mode behind the existing deferred scene startup seam.