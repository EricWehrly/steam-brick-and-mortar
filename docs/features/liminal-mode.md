# Feature: Liminal Mode

**Act**: 2 (Best Effort)
**Status**: Not Started — design complete, ready for implementation
**Priority**: Medium

## Goal

An endless-shelf presentation mode: the player stands in a void and the store's shelves
stretch on apparently forever in both directions, the way the Matrix armory scene loads into
an empty void surrounded by endless racks. The immediate vicinity renders at full fidelity;
everything beyond it is cheaply "projected" so the endless extent costs almost nothing to draw.

Liminal is a **modifier on top of an existing layout**, not a new layout shape. v1 ships on the
**Row** layout (the simplest); arc/spoke come later once the modifier is proven.

## The Vision (source intent)

> "There's a scene in the Matrix where they load into an empty void and are surrounded by
> endless rows of racks of guns. I want our games to stretch continually for as far as makes
> sense, but beyond the immediate vicinity we just project. The projection means we cheap out
> on what we're doing — lighting and stuff — so the non-local shelves are *extremely* cheap to
> render while still looking very good in the immediate vicinity."

## Locked Decisions

These were settled during planning and are not open questions:

| Decision | Resolution |
|----------|------------|
| **Architecture** | A **modifier/flag over any layout** (`arc`/`row`/`spoke`), not a 4th `LayoutMode`. Ships on Row first; designed layout-agnostic. |
| **Extent** | **True infinite treadmill** — geometry recycles around the player so there is no end. |
| **Content** | The **real library** (or the current sort/filter/category set), **looped, not duplicated** — unique content equals the library; you only see a game again after walking a full library's worth. |
| **Loop ends** | **Seamless wrap (torus)** — after the last game comes the first; walk forever in either direction. |
| **Projection (v1)** | **Cheap-shaded real geometry** — same instanced shelves/boxes, but distant ones are unlit, cast/receive no shadows, and ignore dynamic lights. |
| **Near/projected boundary** | **Row-count band** — the player's current row ±N rows render full quality; all other rows are projected. (Rationale below.) |
| **Texture LOD** | **Reuse the existing `LodDistanceManager`** distance sweep (already demotes distant boxes HIGH→MID for free). A more aggressive low-res tier is a **later toggle**, not v1. |
| **Environment** | Walls / ceiling / floor must also read as endless. v1 **stretches the room shell** to cover the active window and moves it with the player; **tiling the shell with the same near-high/far-low fidelity approach is the next major feature** after this. |

## Why a Row-Count Band (not a distance ring)

The boundary could be defined two ways: a camera-distance ring (reusing the existing
`LodDistanceManager` pattern) or a row-index band. We chose the **row band**, for a structural
reason rather than a math one:

- The treadmill's natural unit of work is the **row** — recycling repositions a whole row of
  shelves + boxes as a single unit.
- So the cheapest place to flip a row between *full* and *projected* shading is **at recycle
  time, as one discrete event per row** — not a per-frame, per-instance distance test.
- The existing `LodDistanceManager` already runs a per-frame per-instance distance sweep for
  **texture** LOD. We leave that running for textures. Liminal's new lever is **shading +
  shadows**, set per-row at recycle. The two systems **compose**: distance sweep → textures;
  row band → shading.

This keeps liminal's added per-frame cost near zero — it only does work when the player crosses
a row boundary.

## Core Mechanics

### 1. Treadmill / recycling

- A per-frame manager (registered with `RenderLoopRegistry`, reading the camera from
  `DataManager` — same pattern as `LodDistanceManager`) tracks the player's position along the
  endless axis.
- **Endless axis** = aisle depth (-Z / +Z): the player walks down the central aisle; shelves
  line both sides (left and right — the row's cross-aisle width). Left/right walls remain fixed
  at normal store width; only the depth direction is "liminal." Mental model: a treadmill
  running down the aisle. In v1 (Row), forward and backward both scroll the looped library
  (bidirectional wrap). For Spoke (future), each spoke is its own one-directional treadmill —
  forward advances content down that spoke; backward returns the player toward the hub
  rather than reverse-scrolling.
- When the camera crosses a row-spacing boundary, the row now furthest *behind* is recycled to
  the front (and vice versa when walking backward). Recycling repositions that row's shelf
  instances and refills its game boxes with the **next slice of the looped library sequence**.
- The library sequence is treated as a **ring** (`index mod libraryLength`), so the wrap is
  seamless in both directions.

### 2. Near vs projected (the row band)

- Player's current row ±N (N configurable; the source intent was "3 shelves on each side —
  behind, in front, and where we are," i.e. **N = 1 → a 3-row-deep full-quality band**) renders
  at full fidelity.
- Every other row is **projected**: unlit/cheap material, `castShadow = false`,
  `receiveShadow = false`, excluded from dynamic light contribution.
- Quality is assigned **per row at recycle time**, and re-evaluated when the player's current
  row index changes (a cheap integer compare per frame; real work only on change).

### 3. Environment shell

- v1: scale the room shell (walls/ceiling/floor) large enough to enclose the active treadmill
  window and **reposition it with the player** along the depth axis so it always surrounds.
  Left/right walls stay fixed at normal store width. **Far walls** (depth ends) stretch out to
  the ends of the active window — they are visible but distant, rendered projected-cheap.
- Add **distance fog** within the store aesthetic so projected-quality transitions fade
  gracefully at a distance and the recycle seam stays imperceptible.
- **Next feature (not this one):** tile the shell into recycled segments with the same
  near-high/far-low fidelity treatment the shelves get here.

## Technical Prerequisites & Risks

These gate implementation — call them out before committing to a timebox:

1. **In-place instance repositioning (the key enabler).** The treadmill requires moving existing
   shelf and game-box instances to new positions every recycle, without teardown/rebuild.
   - `docs/features/layout-variations.md` and `layout-variations-next-steps.md` both flag this
     exact capability ("Dynamic layout switching without reload … requires `InstancedShelfRenderer`
     to support in-place position updates for existing shelf IDs") as **not yet built**.
   - `InstancedShelfRenderer` exposes `setInstance(index, data)` + `updateGPU()`; confirm these
     support live reposition of an already-placed index cheaply, and that the game-box artwork
     renderer can re-point an instance at a different game's atlas slot without a full rebuild.
   - **This is the highest-risk item.** If in-place reposition isn't viable, liminal is blocked
     on it and should be sequenced after that capability lands.

2. **Stable renderer capacity.** `layout-variations-next-steps.md` ("renderer lifecycle and
   stable capacity") wants the renderer sized once to the full library and surviving
   layout/sort changes. Liminal benefits from the same: the visible instance count is bounded
   (active window, not the whole library), but the looped content spans the whole library, so
   capacity reasoning should be settled first.

3. **Layout-agnostic modifier seam.** Liminal must wrap a layout without each layout knowing
   about it. Likely shape: a wrapper around `ILayoutDefinition` (or a coordinator-level decorator)
   that takes the base layout's row structure and adds windowing + recycling. v1 only needs Row,
   but the seam should not bake in Row assumptions.

4. **VR comfort.** Continuous locomotion through an endless void with a moving fog horizon is a
   nausea risk. Recycling must be invisible (no popping at the seam) and fog tuned so motion
   cues stay stable. Treat as a review gate, per project VR-safety rules.

## Phasing

**v1 (this feature):**
- Liminal modifier on Row layout only
- Camera-driven row treadmill with seamless library wrap
- Row-band near/projected split (unlit + shadow-off for projected rows)
- Stretched, player-following room shell + void background + distance fog
- Reuse existing `LodDistanceManager` for texture LOD (no new texture work)

**Later (separate features):**
- Endless **room shell tiling** with near-high/far-low fidelity (explicitly the next major feature)
- Liminal on **arc** and **spoke** layouts
- Aggressive **low-res texture toggle** / dedicated LOW tier for projected boxes
- **Imposter/billboard** projection for the deep background (cheaper than geometry)

## Acceptance Criteria

- Liminal is selectable as a modifier while Row layout is active; toggling it on/off does not
  require a full reload beyond what layout switching already costs.
- Walking down the aisle never reaches an end in either direction; the seam is not perceptible.
- Unique content equals the library (or current filter); no game appears twice within one loop.
- The player's ±1 row band renders at full fidelity (lit, shadowed); all other rows are unlit
  and cast/receive no shadows.
- Left/right walls remain at normal store width; floor, ceiling, and far walls extend to the depth ends of the active treadmill window; far walls are visible but distant and render projected-cheap; no abrupt quality seam during locomotion.
- Added per-frame cost is negligible when the player is stationary or moving within a row;
  real work happens only on row-boundary crossings.
- No nausea-inducing pops or fog discontinuities during continuous locomotion (VR review gate).

## Stories / Tasks

- **Confirm in-place reposition capability** in `InstancedShelfRenderer` and the game-box artwork
  renderer; spike if uncertain. (Gating — do this first.)
- Define the **liminal modifier seam** (wrapper over `ILayoutDefinition` / coordinator decorator)
  that windows + recycles a base layout's rows; wire Row through it.
- Implement the **treadmill manager**: camera-tracked row index, boundary-crossing detection,
  row recycle (reposition shelves, refill boxes from the looped library ring).
- Implement **seamless library ring** addressing (`index mod libraryLength`, both directions).
- Implement the **row-band quality assignment**: full vs projected material/shadow state, set at
  recycle and on current-row change.
- Add the **projected cheap material** path (unlit, no shadows, no dynamic light) alongside the
  existing lit shelf/box materials.
- **Stretch + follow the room shell**; add void background + distance fog.
- **UI affordance** to toggle liminal (alongside the layout dropdown / in the layout panel).
- Tests: ring addressing wraps correctly both directions; row-band assignment matches player row;
  recycle preserves instance count; quality flips on boundary crossing.
- **VR comfort review** of seam + fog under continuous locomotion.

## Notes / Open Questions

- **Band depth N** is hardcoded to 1 (the 3-row full-quality band from the design intent). A
  code comment at the constant's definition site flags it as the thing to change. Wire it as a
  menu item or setting when there's an actual reason to tune it — it is not the same kind of
  knob as `LodHighDistance` (a perceptual distance threshold); it's a layout count.
- **Filter / re-sort / category changes** while in liminal work the same way a layout change
  does: reseed the ring from the new result set and restart the treadmill window. If existing
  layout-change handling already has useful in-flight transition nuance, reuse it unchanged.
  Leave the door open for liminal-specific specialization later rather than pre-engineering it.
- **Treadmill directionality**: in Row, forward and backward both scroll the looped library
  (bidirectional wrap). In Spoke (future), each aisle is a one-directional treadmill —
  forward advances content down the spoke; backward returns to hub, not reverse-scroll.

## Related

- [Layout Variations](layout-variations.md) — the modifier wraps this system; shares the
  in-place-reposition prerequisite.
- [`layout-variations-next-steps.md`](../plans/layout-variations-next-steps.md) — renderer
  lifecycle / stable capacity and dynamic-switching reposition notes.
- [Room Variants](room-variants.md) — sibling environment work; liminal's endless-shell tiling
  is a related but separate next feature.
- [`lod-application-strategies.md`](../archive/lod-application-strategies.md) /
  `LodDistanceManager` — the existing distance-based texture LOD that liminal reuses for textures.
- [Lighting and Atmosphere](lighting-and-atmosphere.md) / `ShadowPolicy` — shadows-as-a-lever
  model that the projected-row shadow-off path aligns with.

---
*— A1 / P1 / O2*
