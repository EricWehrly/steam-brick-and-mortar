# Feature: Liminal Mode

**Act**: 2 (Best Effort)
**Status**: 🔄 In Progress — see [`liminal-mode-plan.md`](../plans/liminal-mode-plan.md) for sequencing
**Priority**: Medium

## Goal

An endless-shelf presentation mode: the player stands in a void and the store's shelves
stretch on apparently forever in both directions, the way the Matrix armory scene loads into
an empty void surrounded by endless racks. v1 achieves the illusion through a fixed rendering
window plus content recycling, not through a cheap-vs-expensive rendering split — see
"Locked Decisions" below.

## The Vision (source intent)

> "There's a scene in the Matrix where they load into an empty void and are surrounded by
> endless rows of racks of guns. I want our games to stretch continually for as far as makes
> sense..."

The aesthetic target is *evocative*, not a literal seam-to-seam replica of the reference image —
a liminal take on a brick-and-mortar video store should read as the latter by way of the former.

## Locked Decisions

These were settled during the rebuild pass (see the plan doc's "Why the last attempt failed" for
what changed and why) and are not open questions:

| Decision | Resolution |
|----------|------------|
| **Architecture** | Liminal is its **own `ILayoutDefinition`**, registered in `LayoutRegistry` under mode `'liminal'` — not a modifier wrapping Row. "Rows first" means no arc/spoke corridor variants yet, not "wraps `RowLayout`". Corridor geometry flows through the same `ShelfReady` / `ShelfLayoutDetermined` pipeline every other layout uses, so game-box placement, signage, room sizing, and raycasting need zero liminal-specific code. |
| **Shape** | One walkable aisle: two lines of shelf units running parallel to the walk direction, facing the aisle. Endless axis is depth only; left/right bounded by the corridor shell. |
| **Extent** | **Fixed-window treadmill.** A bounded window of shelf units (v1: ~10 units / 5 depth slots per side → ~90 games resident) recycles as the player walks; the illusion of endlessness comes from window + fog + recycle, not from rendering an unboundedly large scene. |
| **Content** | The **real library** (or the current sort/filter/category set), **looped, not duplicated** — unique content equals the library; you only see a game again after walking a full library's worth. Sections are flattened into one linear sequence for v1; no section signage yet. |
| **Loop ends** | **Seamless wrap (ring)** — `index mod libraryLength`, bidirectional. Walk forever in either direction. |
| **Projection / far tier (v1)** | **None.** With a small fixed window, fog closes before the window's far edge, so there's nothing beyond it to project. A near/far quality split is a later optimization for *widening* the window, not a v1 deliverable — but the window/recycle seam is designed so one can be added without rework. |
| **Locomotion (v1)** | **Camera moves normally** — no changes to `CameraInputApplier`, `InputManager`, or the locomotion event contract. A "move-the-world" alternative (translate a `liminalRoot`, pin the camera) remains a live option behind a shared `LiminalFrame` abstraction, decided later once the fixed-window version is evaluated. |
| **Texture LOD** | Reuse the existing `LodDistanceManager` distance sweep unchanged — orthogonal to windowing. |
| **Environment** | v1 builds a uniform corridor shell (floor / side walls / ceiling) sized to the window + margin, kept centered on the player each frame. A uniform shell is invariant under depth translation, so re-centering it is exactly invisible, not approximately. |

## Core Mechanics

### 1. Fixed window + recycle

- A bounded set of shelf-unit slots exists at all times (the "window"), addressed by depth slot
  and side (left/right). The window is **not** unbounded — the whole library isn't resident at
  once regardless of library size.
- Each slot's games come from a flat, ring-addressed sequence over the current filtered/sorted
  library (`index mod libraryLength`, both directions).
- Crossing a depth-slot boundary while walking recycles the trailing slot to the leading end:
  its games repoint to the next slice of the ring (texture or label, whichever path the game
  resolves through), and — under the v1 camera-moves locomotion model — the recycled shelf unit
  and its boxes physically translate to the new leading position.
- Filter, re-sort, or category changes reseed the ring from the new result set and rebuild the
  window, mirroring how a layout change is already handled elsewhere.

### 2. Window depth (the render-budget knob)

- Window depth (slots ahead / behind the player) is the lever that trades draw cost for how much
  corridor is visible — a plain count, tuned by running the app, not a perceptual distance
  threshold. v1 ships without any per-row shading split; every rendered unit in the window is full
  fidelity. A near/projected quality split (unlit + shadow-off for units beyond some inner band)
  is a plausible follow-up once the window widens far enough that full fidelity everywhere gets
  expensive — not built in v1.

### 3. Environment shell

- v1 builds the room shell (walls/ceiling/floor) sized to the active window + margin and keeps it
  centered on the player every frame — cheap, because the shell is uniform along the depth axis
  and re-centering a uniform shape is invisible by construction.
- Distance fog (camera-relative by default in Three.js) softens the far edge. It's an explicit
  placeholder atmospheric layer for v1's small window — not precision-tuned, and expected to be
  revisited once the window grows.

## Technical Prerequisites & Risks

Superseded by the plan doc's **§3 (Prerequisites and gating risks)** — that is now the source of
truth for what gates implementation (shelf-count decoupling from library size, per-shelf capacity
derivation, placement addressability, artwork/label repointing, prefetch-ahead). Summary of the
two most consequential findings:

- **Row's per-shelf capacity is currently mis-derived** (a pre-existing bug, not liminal-specific):
  Row allocates half the shelves it needs and silently drops games. Must be fixed before liminal's
  window arithmetic can be exact — see plan §3, P2.
- **Shelf count today is derived from library size**; liminal inverts this (fixed shelf count,
  content derived from the window) — see plan §3, P1.

## Phasing

**v1 (this feature):**
- Liminal as its own layout (`LiminalCorridorLayout`), registered like any other mode
- Fixed-window treadmill with seamless ring wrap over the current filtered/sorted library
- No near/projected shading split — every window unit is full fidelity
- Uniform corridor shell, centered on the player, + fog as a cheap atmospheric layer
- Reuse existing `LodDistanceManager` for texture LOD (no new texture work)
- Camera-moves locomotion (no input-path changes)

**Later (separate features):**
- Near/projected shading split, for widening the window without a linear cost increase
- Endless **room shell tiling** with near-high/far-low fidelity
- "Move-the-world" locomotion (`liminalRoot`), if evaluation prefers it over camera-moves
- Liminal on **arc** and **spoke** layouts
- Section signage streaming with the window
- Direct-parenting of game boxes (and other shelf attachments) to their shelf unit, in both
  liminal and non-liminal modes — a larger, separately-scoped change; see the plan doc's §8 for
  status
- Imposter/billboard projection for a future deep-background tier

## Acceptance Criteria

- Liminal is selectable as its own layout mode; switching to/from it works like switching between
  any other layout.
- Walking down the aisle never reaches an end in either direction; the recycle seam is not
  perceptible.
- Unique content equals the library (or current filter); no game appears twice within one loop.
- Every shelf unit and game box in the active window renders at full fidelity — no shading-tier
  split in v1.
- Left/right walls remain at normal aisle width; the corridor shell extends to the depth ends of
  the active window and re-centers on the player without a visible seam.
- Games with no resolvable artwork render via the existing label-fallback path and participate in
  recycling exactly like artwork-backed games.
- Added per-frame cost is negligible when stationary or moving within a slot; real work happens
  only on slot-boundary crossings.
- No nausea-inducing pops during continuous locomotion (VR review gate — deferred, see below).

## Stories / Tasks

Sequencing lives in [`liminal-mode-plan.md`](../plans/liminal-mode-plan.md) §6 — that doc is the
source of truth. Summary:

- **Story 0:** fix Row's per-shelf capacity derivation (pre-existing bug, not liminal-specific;
  lands first).
- **Story 1 (decision gate):** `LiminalCorridorLayout` as a real `ILayoutDefinition` — a static
  corridor through the normal pipeline, no windowing or recycling yet. Proves or disproves the
  "use the existing layout seam" thesis by desktop walkthrough.
- **Story 2:** corridor shell + fog.
- **Story 3:** windowed content publication (`LibraryRing` + `LiminalWindow`, synthetic windowed
  section).
- **Story 4:** placement addressability + repointing, for both artwork and label-fallback
  instances.
- **Story 5:** the treadmill — boundary-crossing recycle, lookahead prefetch, shelf/box
  repositioning.
- **Story 6:** tuning pass in the running app (unit spacing, window depth, fog distance).
- **Story 7 (optional):** "move-the-world" locomotion as an alternative `LiminalFrame`, compared
  against camera-moves before committing either way.

**VR comfort review is deferred** — no VR testing process exists project-wide yet; this isn't
specific to Liminal and will be picked up when that work starts.

## Notes / Open Questions

- **Direct-parenting direction (deferred, not yet planned in detail).** Game boxes and other shelf
  attachments (signage, props) should eventually parent directly to their shelf unit — in both
  liminal and non-liminal modes — rather than being positioned independently by a separate
  coordinate system kept in sync with shelf placement. Explicitly a larger change than it sounds;
  scoped as its own piece of work, not folded into liminal mode. See plan doc §8, Q6.
- **Treadmill directionality**: in the v1 corridor, forward and backward both scroll the looped
  library (bidirectional wrap). If/when liminal extends to Spoke, each aisle would need to decide
  whether it's a one-directional treadmill (forward advances content, backward returns toward a
  hub) — an open question for that future work, not this one.
- **Priority ordering for remaining work** follows the plan doc's story sequence (§6) rather than
  a separate list here — see that doc for what's next after the current story completes.
- **Games visibly arrive after shelves, both on initial build and on recycle.** Shelves are pure
  procedural geometry with no network dependency; game artwork must be fetched, decoded, and
  uploaded, which is inherently slower. Not something to eliminate here — the fix is the
  [Loading placeholder boxes](../acts/act2-ready-for-friends.md) idea (Act 2, not yet designed),
  which closes this gap for every layout, not just liminal.

## Related

- [`liminal-mode-plan.md`](../plans/liminal-mode-plan.md) — implementation plan: what failed in
  the previous attempt, prerequisites, architecture, and story sequencing. Source of truth for
  everything below the "Locked Decisions" table above.
- [Layout Variations](layout-variations.md) — sibling layout definitions (`arc`, `row`, `spoke`);
  liminal is a peer, not a wrapper, per the Architecture decision above.
- [`layout-variations-next-steps.md`](../plans/layout-variations-next-steps.md) — renderer
  lifecycle / stable capacity notes relevant to decoupling shelf count from library size.
- [Room Variants](room-variants.md) — sibling environment work; liminal's shell-tiling idea is a
  related but separate later feature.
- [`lod-application-strategies.md`](../archive/lod-application-strategies.md) /
  `LodDistanceManager` — the existing distance-based texture LOD that liminal reuses unchanged.
- [Lighting and Atmosphere](lighting-and-atmosphere.md) / `ShadowPolicy` — relevant if/when a
  near/projected shading split is built as a follow-up.

---
*— P1 / O2*
