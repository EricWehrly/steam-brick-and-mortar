# Plan: Liminal Mode (rebuild)

Companion to [Liminal Mode](../features/liminal-mode.md). This is a **full replacement** for the
previous plan — the move-camera spike, the move-the-world spike, and the corridor-pivot addenda are
all superseded. Read "Why the last attempt failed" before anything else; the failure was structural,
not a pile of bugs, and repeating the same seam will reproduce it.

> **Carrying this doc across the branch reset.** This plan was written on `act2/liminal-mode` against
> a working tree that is being discarded. After resetting onto `origin/act2/default`:
> ```bash
> git checkout act2/liminal-mode -- docs/plans/liminal-mode-plan.md
> ```
> Then apply the feature-doc amendments listed at the end of this document.

---

## 1. Why the last attempt failed

The spike ran **outside** the layout pipeline. It let Row layout complete — placing shelves, game
boxes, labels, stickers, signage, user props, and room bounds — then reached through `DataManager`
for the production `InstancedShelfRenderer` and rewrote *only the shelf-unit matrices* after the
fact.

Everything else in the scene is derived from the shelf anchors that the layout published, and none
of it was told. `GameBoxSpawner.placeSection()` computes every game box's world transform from
`shelfPos.position` + `shelfPos.rotationY`. `ShelfSignPlanner` mounts signs from the same anchors.
`RoomManager` sizes the room from `shelfBounds`. The spike moved the shelves and left all of that
behind.

Every bug in the handoff is a symptom of that one decision:

| Reported symptom | Actual cause |
|---|---|
| Only 2 of 3 shelves per side | The one-shot reposition poll raced progressive batch population — the pipeline knows when population completes; a side channel has to guess. |
| One shelf "perpendicular" | A shelf still at its Row transform sitting among repositioned neighbours. |
| Repositions invisible until an unrelated event | `setInstance()`'s existing-index branch never flushes; the pipeline's flush is driven by events the side channel doesn't participate in. |
| Left/right corridor length asymmetry | Even/odd pairing patched in `computeLiminalCorridorPairedCount` — an artefact of addressing shelves by renderer index instead of by layout slot. |
| "Detached" angled-board panels | Not a transform bug. The corridor spaced units 4.0 m apart on a 2.05 m-wide unit, and shelves are stocked on the aisle-facing side only, so a unit seen from behind or through a gap is a bare 2×2 back panel with nothing attached. It reads as a floating wall because that is what the geometry is. |

The last one matters most: it was never a code defect, and no amount of static analysis of
`updateShelfUnitTransform` was going to find it. That is what working outside the pipeline costs —
you lose the ability to tell a bug from the design.

**The seam we should have used is `ILayoutDefinition`.** `ShelfLayoutCoordinator` asks
`LayoutRegistry[mode]` for shelf positions and rotations, then emits `ShelfReady` and
`ShelfLayoutDetermined`. If corridor geometry comes out of *that*, then boxes, signs, room sizing,
raycasting and LOD all work with zero special-casing, because they already consume those events.

---

## 2. What we are building (settled)

| Decision | Resolution |
|---|---|
| **Seam** | Liminal is its own `ILayoutDefinition` registered in `LayoutRegistry` under mode `'liminal'`. "Rows first" now means "no arc/spoke corridor variants yet", not "wraps `RowLayout`". |
| **Shape** | One walkable aisle. Two lines of shelf units running parallel to the walk direction (−Z), facing the aisle. Endless axis is depth only; left/right bounded by the shell. |
| **Endless mechanism** | Fixed window of `W` shelf units around the player; content streams through it. On each depth-slot boundary crossing the trailing slot recycles to the leading end and its games are repointed. |
| **Window size (v1)** | ~10 shelf units total (5 depth slots × 2 sides) → **90 games resident**. Single-sided stocking: 3 boards × 3 games = **9 games per unit**. Runtime-tunable — see §6, Story 6. |
| **Far tier (v1)** | **None.** Fog is opaque before the window's far edge, so there is nothing beyond the window to project. The near/projected split is a later optimisation for widening the window, not a v1 deliverable. Design the boundary so it can be added; build none of it. |
| **Sections** | Flattened. Liminal consumes the current filter/sort result as one linear game sequence. No section signage in v1. |
| **Wrap** | `index mod librarySize`, bidirectional. Unique content equals the library; a game repeats only after a full library's walk. |
| **Locomotion** | **Fork A (camera moves normally)** for v1. Fork B (move-the-world) stays a live option behind a shared abstraction — see §5.4. |
| **Library scale** | Design for 500–2000 games. The window makes library size irrelevant to instance count; artwork residency is the only size-sensitive axis. |

### What "endless" actually comes from

Not from projections. With a 5-slot-deep window at 4 m spacing the player sees roughly 10–20 m of
corridor; fog closes before the window's far edge and the recycle happens outside the visible band.
The illusion is **window + fog + recycle**. Impostors and shading tiers only matter once we want to
widen that band, and that is a follow-up feature.

Fog itself is nearly free (`scene.fog` is a built-in Three.js pass), so it's worth building in
Story 2 regardless — a cheap atmospheric layer to preview, not a mechanism the design depends on.
Whether a 5-slot window reads as endless or claustrophobic is a real open question, but not a
blocking one: fog is explicitly a placeholder until the window widens in a later pass, and that's
when the tuning question actually gets answered. Story 6 exposes both as live settings so the call
can be made by looking at it, not by predicting it here.

---

## 3. Prerequisites and gating risks

These are ordered by how badly they bite. Items P1–P5 are genuine gaps that must be built; P6–P10
are findings, hazards, or already-satisfied capabilities.

### P1 — Shelf count is currently derived from library size (gating)

`ShelfLayoutCoordinator.handleSectionsReady()` computes
`totalShelves = Σ ceil(section.games.length / SLOTS_PER_SHELF)` and passes the full `sections` array
to `computeShelvesForSections()`. `GameBoxSpawner` then places *every* game in one pass.

Liminal inverts this: shelf count is fixed, and the game set is derived from the window. A liminal
layout that simply ignores its `sections` argument would work mechanically, but
`ShelfLayoutCoordinator.totalShelves` and its `Progress` events would be wrong, and `GameBoxSpawner`
would try to fit the whole library into 10 shelves and warn about thousands of homeless games.

**Resolution**: the liminal path publishes a *windowed* section to the placement pipeline — a single
synthetic section containing exactly the window's games. See Story 3.

### P2 — Per-shelf capacity is mis-derived today (pre-existing bug, affects Row)

`SLOTS_PER_SHELF = GAMES_PER_SURFACE (3) × SURFACES_PER_SHELF (6) = 18` drives shelf allocation.
But `DEFAULT_SHELF_CONFIG.shelfCount = 3`, so `ShelfSurfaceUtils.getStandardShelfSurfaces()` returns
**3** surfaces, and `RowStockStrategy.order()` takes near faces only → **9 slots per shelf**.

Row therefore allocates half the shelves it needs and drops half the library, logging
`Section "…": N games had no shelf space`. `ArcStockStrategy` uses near+far = 18 and is correct,
which is why `arc` was the default.

Liminal's window arithmetic has to be exact — `W × slotsPerUnit` must equal the resident game count
or the window and content drift. Fix by deriving capacity from the stock strategy rather than the
constant.

**This is a pre-existing Row bug and should land as its own commit, before liminal work starts.**

### P3 — Game-box instances are not addressable by shelf (gating)

`GameBoxSpawner.emitPlacementIntents()` fires `PlacementIntentReady` and forgets. The
`instanceIndex` returned by `LodArtworkOrchestrator.placeInstance()` is consumed inside
`GpuGameBoxRenderer.placeResolvedGame()` and discarded. Recycling needs
`slot → instanceIndex[]` to repoint or reposition a unit's boxes.

Label-fallback placements have the identical gap: `GpuGameBoxRenderer.placeLabelBox()` calls
`InstancedLabelRenderer.addLabelInstance()`, which returns a `boolean`, not an index. Decided (see
P10): label fallback is the intended path for unresolvable artwork, not an edge case to route
around, so this gap is in scope for v1, not deferred.

**Resolution**: a new `GameRenderEventTypes.PlacementCommitted { appid, instanceIndex, position, rotation, kind: 'artwork' | 'label' }`
emitted from both paths, where the instance index is currently dropped. Liminal builds its own slot
map from it. Additive, no existing consumer changes. `addLabelInstance()` needs to return the
allocated index (or the index needs to be threaded out some other way) for the label path to emit
it.

### P4 — Artwork and label repointing do not exist (gating)

`LodGameArtworkRenderer` has `addInstance()` but nothing to re-point an existing instance at a
different texture layer. Also `textureIndexToInstance` is a 1:1 map that assumes one instance per
texture — correct under a window (a game appears at most once), but it needs maintaining on repoint
rather than only on add.

`InstancedLabelRenderer` has the same shape of gap: `addLabelInstance()` only appends. A recycle
needs `setInstanceLabel(instanceIndex, { position, rotation, gameName, appid })` — new text texture
lookup/allocation via `LabelTextureArrayManager`, matrix rewrite, `gameNameToTextureIndex` and
`labelMetadata` updated in place. Both renderers need this before Story 5 can recycle a slot
regardless of which path a given game resolved through.

### P5 — Artwork prefetch-ahead does not exist (gating)

`placeInstance()` returns `-1` unless `gameNameToTextureIndex` already has the game — prefetch is
driven by batch processing across the whole library. Under a window only the window's games are
placed, so nothing else ever prefetches, and every recycle would fail to resolve artwork.

**Resolution**: the window coordinator prefetches a lookahead band (games entering within the next
K slots in both directions) as it advances. `LodArtworkOrchestrator.prefetchArtwork()` already
exists and is async; this is wiring plus a lookahead policy, not new machinery.

Note this is the one place library size still matters: v1 keeps the current
"textures accumulate, never evict" model. At 2000 games that is the same residency the app already
has today, so it is not a regression — but eviction becomes necessary if we ever chase the
5000-game case.

### P6 — Shelf reposition + explicit GPU flush (already built, keep)

`InstancedShelfRenderer.setInstance()`'s existing-index branch (`updateShelfUnitTransform`) plus the
new public `flushToGPU()` are both correct and genuinely needed under Fork A. The `partInstances`
ordered-list refactor is also sound. **Keep all three** — they are the salvageable part of the spike.

### P7 — Game-box reposition does not exist (Fork A only)

`LodGameArtworkRenderer` and `InstancedLabelRenderer` have no `setInstancePosition(index, position, rotation)`.
Under Fork A a recycled unit's 9 boxes must translate with it. Under Fork B nothing moves and this
is unnecessary — which is the strongest argument in Fork B's favour.

### P8 — `maxShelfUnits` is a hard 100 (not gating; adjacent finding)

`DEFAULT_INSTANCED_SHELF_CONFIG.maxShelfUnits = 100`, never overridden, and `setInstance()` warns
and returns `false` past it. Irrelevant to liminal (W ≈ 10) but it means non-liminal Row/Arc silently
lose shelves past index 100. Worth a separate issue; do not fix here.

### P9 — Room shell

The working tree hides `RoomManager.roomGroup` when liminal is active. That is a spike hack. Liminal
needs a uniform corridor shell — floor, two side walls, ceiling — long, uniform along Z, and either
kept centred on the player (Fork A) or parented to the root (Fork B). A uniform tube is invariant
under Z translation, so re-centring it every frame is *exactly* invisible, not approximately.

`scene.fog` is view-space in Three.js, so it is already camera-relative. No work needed there.

### P10 — Label-fallback boxes are the intended path, not a gap to route around (resolved)

Games whose artwork fails to resolve fall through to `InstancedLabelRenderer`, exactly as they do
outside liminal mode today. **Decision**: use that path as-is rather than skipping such games and
pulling the next one in sequence — skip-and-pull-next is more machinery for a worse result, and
label fallback is already the intended behaviour, not a defect. Consequence: label-box instances
need the same addressability and repointing support as artwork instances (folded into P3/P4 and
Story 4 above) — a recycle has to be able to update a slot regardless of which path its game
resolved through.

---

## 4. Prerequisite: reset onto `origin/act2/default`

`act2/liminal-mode` is 77 commits behind and one ahead. The base has moved substantially in
`GameSorter`, `GroupResolver`, `LodArtworkOrchestrator`, `LodTextureArrayManager`, `ArtworkPackSeeder`,
`GameBoxSpawner` and `UserPropPlacer` — all of which liminal touches. Rebasing the spike is not worth
it; the spike is being discarded.

1. Save this plan (see the note at the top).
2. Branch fresh from `origin/act2/default`.
3. Re-apply only the salvage list in §7. Everything else is discarded.

---

## 5. Architecture

### 5.1 Layout — `client/src/scene/liminal/LiminalCorridorLayout.ts`

Implements `ILayoutDefinition` (not `ISectionAwareLayoutDefinition` — sections are flattened).

```
mode: 'liminal'
createStockStrategy(): near-faces-only, same as RowStockStrategy
computeShelves(_totalShelves): ShelfInfo[]   // returns exactly W units, ignoring the argument
```

Register in `LayoutRegistry`; add `liminal` to `LayoutModes` in `client/src/types/LayoutTypes.ts`.

Slot geometry (the existing constants are correct — carry them over):

- Depth slot `d`, `d ∈ [-BEHIND, +AHEAD]`, `z = -(CENTER_OFFSET_Z + d × UNIT_SPACING_Z)`.
- Two units per slot: left at `x = -CORRIDOR_HALF_WIDTH_X`, `rotationY = -π/2` (faces +X);
  right at `x = +CORRIDOR_HALF_WIDTH_X`, `rotationY = +π/2` (faces −X).
- `CORRIDOR_HALF_WIDTH_X = AISLE_HALF_WIDTH_X + shelfHalfWidth`.
- `UNIT_SPACING_Z` must be re-tuned. The spike used 4.0 m on a 2.05 m unit, leaving 2 m gaps that
  expose bare back panels — this is the "detached panel" report. Gaps between units are fine; the
  aesthetic target is *evocative*, not a literal seam-to-seam Matrix rack — a liminal take on a
  brick-and-mortar video store reads as the latter by way of the former, not by copying the
  reference exactly. Treat spacing as a Story 6 tuning knob: enough continuity to read as a store
  aisle, without requiring units to touch.

Delete `computeLiminalCorridorCenterZSlot`, `computeLiminalCorridorPairedCount`, and the offset-based
addressing. They exist only to patch the post-hoc reposition hack; slots are now enumerated by the
layout itself and pairing is structural.

### 5.2 Content — `LibraryRing` and `LiminalWindow`

Two pure modules, fully unit-testable with no Three.js or event dependencies.

**`LibraryRing`** — `indexAt(base, offset, length) => ((base + offset) % length + length) % length`.
Bidirectional, correct for negative offsets.

**`LiminalWindow`** — owns the flat game sequence and the current centre slot. Answers:
- `gamesForSlot(d): SteamGameData[]` — `2 × slotsPerUnit` games starting at `ring(d × 2 × slotsPerUnit)`,
  first half to the left unit, second half to the right.
- `advance(direction): { recycledSlot, newSlot }` — one slot leaves, one enters.
- `lookaheadGames(k)` — for prefetch.

Sequence ordering: left unit then right unit of the same slot are adjacent in sort order, so reading
order down the corridor is left-right, left-right. Confirm this reads correctly in Story 6.

### 5.3 Coordination — `LiminalWindowCoordinator`

Owns the window, subscribes to the events that govern it (per the project's owner-managed-subscription
rule), and drives:

- **Seed** (on liminal activation, filter change, re-sort, library reload): build the flat sequence
  from the same result the sections came from, then publish a single synthetic section holding the
  window's games into the existing placement pipeline. The full path — shelf anchors, stock surfaces,
  placement intents, artwork resolution — runs unmodified.
- **Advance** (on boundary crossing): repoint the recycled slot's 18 boxes, prefetch the new
  lookahead band, and (Fork A only) reposition the recycled slot's 2 shelf units and their boxes.

Cost per crossing: 18 artwork repoints, 2 shelf-unit matrix writes, 18 box matrix writes, one GPU
flush. A crossing happens roughly once per second at walking speed. This is trivially affordable —
which is the point of *not* re-running the whole placement path on every crossing.

`LiminalBoundaryTracker` (from the spike) detects crossings. Keep it; it is small, symmetric in both
directions, and already tested.

### 5.4 The locomotion fork

Everything above is frame-agnostic. Only two things differ between forks, so both live behind one
interface:

```ts
interface LiminalFrame {
    getCorridorPosition(): number              // signed metres along the endless axis
    getContentAnchor(): THREE.Object3D         // parent for all liminal content
    resolveSlotTransform(slot: number, side: CorridorSide): { position: THREE.Vector3; rotationY: number }
    onBoundaryCrossed(direction: 'forward' | 'backward'): void
}
```

**Fork A — `CameraRelativeLiminalFrame` (v1).**
`getCorridorPosition()` reads the camera. Anchor is the scene. Slot transforms are absolute world
positions that advance with the window; `onBoundaryCrossed` is where the recycled units get moved.
The corridor shell is re-centred on the player each frame. **No changes to `CameraInputApplier`,
`InputManager`, or the locomotion event contract.**

**Fork B — `WorldMovingLiminalFrame` (parked, buildable in one story).**
`getCorridorPosition()` integrates `LocomotionIntentEvent`. Anchor is a `liminalRoot` `THREE.Group`
that translates inversely to intent. Slot transforms are *fixed local positions that never change* —
so P7 (game-box reposition) is not needed at all, and the recycle collapses to a pure content
repoint. `onBoundaryCrossed` wraps `liminalRoot.position.z` by one slot spacing.

Fork B's structural advantages are real and were observed in the spike: nothing can drift relative
to anything else because everything rides one transform; the lit band stays stationary at the origin
for free; float precision is bounded by construction; and the recycle does strictly less work.
Fork A's advantage is that it touches nothing outside liminal.

**Keep the fork cheap**: build P1–P5 and Stories 1–4 frame-agnostically. `LocomotionIntentEvent` and
its `CameraInputApplier` emit are worth keeping in the codebase from the start (they are harmless
and independently useful); only the camera-translation *suppression* is Fork-B-specific and stays
unwired. Switching forks should then be Story 7 — one construction line, one flag, no rewrite.

---

## 6. Stories

Each story is one commit. Tests land with the story, not after.

**Story 0 — Fix per-shelf capacity derivation (prerequisite, not liminal).**
Derive slots-per-shelf from the active stock strategy and the real surface count instead of
`GAMES_PER_SURFACE × SURFACES_PER_SHELF`. Row goes from 18 to its actual 9; Arc stays 18.
*Acceptance*: a Row layout of N games allocates `ceil(N/9)` shelves and logs no "no shelf space"
warnings. *Tests*: capacity derivation per strategy; Row allocation for a known game count.
*Note*: this changes Row's shelf count, so expect visual differences in the non-liminal store. Land
and eyeball it on its own before starting liminal.

**Story 1 — `LiminalCorridorLayout` as a real layout.**
Implement `ILayoutDefinition`, register in `LayoutRegistry`, add the `liminal` mode literal, expose
it in `LayoutControlPanel`. No windowing, no recycling, no treadmill — selecting `liminal` should
place `W` shelf units in a corridor through the normal pipeline, with game boxes on them, signs
suppressed, and the room resized from `shelfBounds`.
*Acceptance*: switching to liminal in the running app shows a static corridor with games correctly
stocked on the aisle-facing side of every unit, and nothing floating.
*Tests*: slot positions and rotations for a given W; left/right pairing; capacity math.
*This story alone proves or disproves the whole seam thesis.* If boxes land on shelves without any
liminal-specific placement code, the diagnosis in §1 was right.

**Story 2 — Corridor shell + fog.**
Uniform floor / side walls / ceiling sized to the window plus margin, re-centred on the player each
frame. `scene.fog` added as a cheap atmospheric layer, roughly closing before the window's far edge —
not tuned precisely, since it's an explicit placeholder until the window widens later. Remove the
`roomGroup.visible` hack; `RoomManager` should build the liminal shell rather than being switched off.
*Acceptance*: walking (with no recycling yet) shows no shell seam and no visible corridor end.

**Story 3 — Windowed content publication.**
`LiminalWindow` + `LibraryRing` + the synthetic windowed section. Liminal seeds the placement
pipeline with exactly `W × slotsPerUnit` games instead of the whole library. Still no recycling —
the window is static and the rest of the library is simply not placed yet.
*Acceptance*: exactly the expected number of boxes exist regardless of library size; re-sorting or
filtering reseeds the window from the new sequence.
*Tests*: ring wrap in both directions; window games for a slot; reseed on filter change.

**Story 4 — Placement addressability + repointing, artwork and label (P3, P4).**
`PlacementCommitted` event (fired from both the artwork and label placement paths); slot→instanceIndex
map keyed by `kind`; `setInstanceArtwork()` on `LodGameArtworkRenderer` with `textureIndexToInstance`
maintained; `setInstanceLabel()` on `InstancedLabelRenderer` with the equivalent bookkeeping. A game
that resolves via label fallback must be just as recyclable as one with artwork.
*Acceptance*: a direct call repoints one instance (either kind) and touches no other instance.
*Tests*: repoint round-trips the texture index (both renderers); LOD state resets sanely; neighbouring
instances unchanged; label repoint updates text and position together.

**Story 5 — The treadmill.**
`LiminalBoundaryTracker` + `LiminalWindowCoordinator.advance()` + lookahead prefetch (P5) + Fork A
reposition (P7). This is the first story where the corridor is actually endless.
*Acceptance*: walking forward or backward indefinitely never reaches an end; content advances in
sort order; walking a full library's distance returns you to the first game; the recycle is not
visible.
*Tests*: crossings both directions; recycle preserves instance count; window contents match expected
ring indices after N crossings; prefetch is requested before a game is needed.

**Story 6 — Tuning pass (in the running app).**
Expose `UNIT_SPACING_Z`, window depth (slots ahead / behind), and fog distance as live settings.
Walk it. Decide the real values. This is where the "is the fog claustrophobic" and "does the reading
order work" questions get answered, and where a decision about widening the window — and therefore
about whether a far tier is needed after all — actually becomes informed.
*Acceptance*: values chosen from observation and written back as defaults, with the tuning controls
kept for future work.

**Story 7 (optional, decision point) — Fork B.**
`WorldMovingLiminalFrame`: `liminalRoot`, locomotion suppression in `CameraInputApplier`, root wrap.
Both frames present; one flag switches. Compare in the running app and keep the winner.
*Acceptance*: identical behaviour through the same test suite with either frame injected.

---

## 7. Salvage list

**Keep and re-apply after the reset:**
- `InstancedShelfRenderer` — `flushToGPU()`, `updateShelfUnitTransform()` via `setInstance()`'s
  existing-index branch, the `partInstances` ordered-list refactor, `getPopulatedShelfIndices()`,
  and their tests. Needed by Fork A, and `flushToGPU()` closes a real gap regardless.
- `LiminalBoundaryTracker` and its tests.
- `LiminalEventTypes.ModeToggled` / `LiminalModeToggledEvent`.
- `LocomotionIntentEvent` and the `CameraInputApplier` emit (keep the emit; leave camera suppression
  unwired until Fork B).
- The corridor geometry constants: `CORRIDOR_HALF_WIDTH_X`, side rotations. Re-tune `UNIT_SPACING_Z`.

**Discard:**
- `LiminalWorldWrapSpike` in full, and its test.
- `computeLiminalCorridorSlot` / `computeLiminalCorridorCenterZSlot` / `computeLiminalCorridorPairedCount` —
  offset-based addressing exists only to patch the reposition hack.
- `RoomManager`'s `roomGroup.visible = !liminalModeActive` hack.
- `DataKey.InstancedShelfRenderer` and its `StorePropsCoordinator` publication — only the spike needed
  cross-class access to the renderer, and it is exactly the coupling the event architecture forbids.
- The `vite.config.ts` `open: false` change (ephemeral dev tweak).

**Keep, unrelated to liminal:** the `arc` → `row` default changes in `ShelfLayoutCoordinator`,
`StorePropsCoordinator` and `LayoutControlPanel` — but note that Story 0 changes what Row looks like,
so re-evaluate the default after it lands.

---

## 8. Resolved design questions

Raised during planning and settled before implementation started; kept here for the reasoning, not
as open items.

1. **Window depth vs. fog distance.** *Resolved*: not gating. Fog is nearly free to add (§2), so
   Story 2 builds it regardless of the claustrophobia question. Whether the v1 window reads as
   endless or cramped is a real question, but fog is an explicit placeholder until the window widens
   in a later pass — that's when it gets re-tuned, not now.

2. **Games with no resolvable artwork.** *Resolved*: use the existing label-fallback path as-is
   (P10) rather than skipping such games. Consequence folded into P3/P4/Story 4: label instances need
   the same addressability and repointing as artwork instances.

3. **Section signage.** *Resolved*: stays deferred, as already decided in §2 ("Sections"). No change —
   flagged only so a future signage pass designs the slot map with streaming in mind.

4. **`UNIT_SPACING_Z` and gaps.** *Resolved*: gaps are fine. The target is evocative — a liminal take
   on a brick-and-mortar store, not a seam-to-seam replica of the reference image. Folded into §5.1.

5. **Interaction range.** *Resolved*: aisle width and raycast `maxDistance` are tuned together in
   Story 6, not fixed in advance. Formal review deferred to VR work, consistent with the existing
   VR-comfort deferral.

6. **Direct-parenting of boxes to shelf units.** Still open, not raised in this pass. Under Fork B it
   becomes unnecessary (nothing moves). Under Fork A it would replace P7. Do not build it now; revisit
   at Story 7.

---

## 9. Feature-doc amendments required

`docs/features/liminal-mode.md` still describes the superseded design. After the reset, update:

- **Architecture** row: "modifier over any layout" → own `ILayoutDefinition` registered as mode
  `'liminal'`; rows-first means no arc/spoke corridor variants yet.
- **Projection (v1)** row: v1 ships **no** far tier; fog closes before the window edge.
- **Near/projected boundary** row: replaced by window depth (slots ahead/behind), which is a
  render-budget knob, not a shading boundary.
- **Environment** row: uniform corridor shell re-centred on the player (Fork A).
- **Core Mechanics §1**: move-the-world is now Fork B, parked behind `LiminalFrame`, not the
  mechanism.
- **Technical Prerequisites**: replace with §3 of this doc.
- **Stories**: replace with §6 of this doc.
- Add the Row capacity bug (P2) to `docs/bugs.md` and the `maxShelfUnits` ceiling (P8) to
  `docs/tech-debt.md`.

---

## 10. Verification

Per-story unit tests are listed inline in §6. Cross-cutting:

- Ring addressing wraps correctly in both directions across many crossings.
- Window contents after N forward crossings equal window contents after N backward crossings from
  the same start.
- Recycle preserves total instance count for shelves, boxes and labels.
- Both `LiminalFrame` implementations pass the same window/recycle suite (Story 7).
- Manual desktop walkthrough after Stories 1, 2, 5 and 6. Story 1's walkthrough is the decision gate
  for the whole approach.
- VR comfort review remains deferred — no project-wide VR test process exists yet; this is not
  specific to liminal.

---
*— P1 / O2 / T1*
