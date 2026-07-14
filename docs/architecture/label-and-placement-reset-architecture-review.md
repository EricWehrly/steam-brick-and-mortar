# Label And Placement Reset Architecture Review

## Scope
This memo covers the game-box placement and label fallback pipeline around arrangement changes, with emphasis on state ownership and reset behavior.

Primary files involved:
- client/src/scene/spawning/GameBoxSpawner.ts
- client/src/scene/game-box/RenderIntentCoordinator.ts
- client/src/scene/game-box/GpuGameBoxRenderer.ts
- client/src/scene/game-box/instancing/InstancedLabelRenderer.ts
- client/src/scene/game-box/instancing/LabelTextureArrayManager.ts
- client/src/scene/game-box/instancing/PlacementRunResettableInstancedBase.ts
- client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts
- client/src/scene/game-box/instancing/LodGameArtworkRenderer.ts

## Current Ownership By State Bucket

### Placement Run Lifecycle
- Owner: GameBoxSpawner
- State:
  - pending sections to place
  - cached shelf anchors
  - placement run sequence
- Reset trigger:
  - emits game-render:placement-run-reset-requested before each run

### Placement Intent Buffering
- Owner: RenderIntentCoordinator
- State:
  - pending placement intents by app id
  - settled artwork app ids
- Reset trigger:
  - listens to game-render:placement-run-reset-requested

### Artwork Instance Placement
- Owner: LodArtworkOrchestrator + LodGameArtworkRenderer
- State:
  - instance metadata
  - texture slot allocations
  - current instance count and transforms
- Reset trigger:
  - listens to game-render:placement-run-reset-requested
  - clears placements while retaining texture slots

### Label Instance Placement
- Owner: InstancedLabelRenderer
- State:
  - label instance count/index
  - game name to texture index map
  - label metadata map published under renderer.instancedLabelMetadata
- Reset trigger:
  - listens to game-render:placement-run-reset-requested
  - resets instance counters and metadata state

### Label Texture Slot Allocation
- Owner: LabelTextureArrayManager
- State:
  - next texture slot write index
  - managed DataArrayTexture backing store
- Reset trigger:
  - listens to game-render:placement-run-reset-requested
  - rewinds write index for slot reuse

### Library Reload Lifecycle (planned, not yet implemented)

- Owner: GameBoxSpawner
- Trigger today: `StorePropsEventTypes.LibraryReloadRequest` → `fullReset()`, unconditionally.
  `fullReset()` disposes `GpuGameBoxRenderer` (and everything it owns, including
  `LodArtworkOrchestrator`/`LodTextureArrayManager`) and rebuilds it from scratch at a new
  capacity on the next `LibraryManifestReady`.
- Problem: this is a strictly bigger reset than the placement-run reset above, applied for a
  reason (GPU texture-array capacity is fixed at construction, so a *larger* incoming library
  needs a new array — a `THREE.DataArrayTexture`'s depth cannot grow in place) that doesn't apply
  to every case that currently triggers it. A relaunch with the *same* persisted library, or a
  future Round 2 "upgrade, don't replace" patch (see
  `docs/plans/desktop-offline-first-plan.md`), needs no capacity change at all — disposing and
  rebuilding the whole GPU pipeline for those cases is pure waste, and is the confirmed root cause
  of a disposal-ordering race: in-flight `ArtworkPrefetchCoordinator` fetches for the *previous*
  library aren't cancelled, and when they resolve after `fullReset()` has already cleared
  `LodTextureArrayManager`'s tier map, they fail (`Unknown tier: mid`). See
  `docs/tech-debt.md#id-lod-tier-reset-race-condition` for the full incident writeup.
- **Planned shape**: two reset tiers instead of one blanket `fullReset()`, mirroring the
  capacity-vs-no-capacity-change distinction directly rather than papering over it:
  - **Capacity-compatible reload** (soft): no disposal. Same template-method shape as
    `PlacementRunResettableInstancedBase` above — `LodArtworkOrchestrator` clears its
    slot/placement maps, `LodTextureArrayManager` rewinds its slot allocator for reuse (the same
    pattern `LabelTextureArrayManager` already applies on placement-run reset, just one lifecycle
    tier up), and a `generation` counter is bumped. The two places that write into a texture slot
    after an `await` (`LodArtworkOrchestrator.fetchAndCachePixels`/`fetchAndPlaceArtwork`) capture
    `generation` on entry and compare before writing; a stale generation means the fetch resolved
    for a library that's no longer current, so the write is dropped. This is deliberately not an
    `isDisposed`-style guard scattered across every method — nothing is ever disposed on this
    path, so there is nothing to guard against except one specific stale-write race, checked at
    exactly the two call sites that can straddle a reset.
  - **Capacity-incompatible reload** (hard): unchanged — still `fullReset()`, since a genuinely
    larger incoming library needs a new, bigger `DataArrayTexture` and there's no way around
    disposing the old one first (double-buffering old+new during the swap was considered and
    rejected as unnecessary complexity/VRAM cost for a transition — demo store → real library —
    that's expected to be visually a hard cut anyway).
  - `GameBoxSpawner` decides which tier applies by comparing the incoming library's game count
    against the currently-allocated texture capacity, not by which event fired.

## Observed Anti-Patterns And Risks

1. Ownership drift under iteration
- Symptom: reset actions and metadata writes were spread across multiple classes and methods.
- Risk: duplicate or missing resets depending on event timing; hard-to-debug capacity behavior.

2. Mixed responsibilities in renderer classes
- Symptom: rendering classes holding both GPU concerns and external state publication logic.
- Risk: fragile coupling to DataManager keys and behavior changes hidden inside rendering refactors.

3. Implicit run contracts
- Symptom: run boundaries are event-driven but not explicitly documented as contracts with required subscriber actions.
- Risk: new subscribers miss required reset hooks and silently accumulate stale state.

4. Defensive writes instead of single-owner mutation
- Symptom: DataManager key writes used in multiple lifecycle paths as safety nets.
- Risk: papering over missing ownership boundaries; difficult to reason about authoritative state.

## Proposed Refactor Sequence (Commit Boundaries)

### Step 1: Lock In Single-Owner Reset Contracts
Commit boundary:
- Goal: each state bucket has exactly one owner that subscribes to placement-run reset and mutates only its own state.
- Changes:
  - no new behavior; only move reset responsibility to owning classes where still leaked
  - remove cross-owner reset calls in runtime paths
  - add/update focused unit tests proving each owner resets on event
- Exit criteria:
  - no owner directly invokes another owner's reset behavior
  - run-reset event coverage exists for label, artwork, and intent buffering owners

### Step 2: Normalize Metadata Publication Strategy
Status:
- Implemented in this branch.

Commit boundary:
- Goal: renderer metadata keys are published from one place per key with clear lifecycle policy.
- Changes:
  - centralize metadata map ownership (renderer-local map as source of truth)
  - reduce DataManager writes to lifecycle boundaries only (construction, explicit run reset, disposal if needed)
  - document key policy in code comment near DataKey usage
- Exit criteria:
  - each metadata key has one authoritative owner class
  - no fallback "if missing then recreate" branches outside owner lifecycle policy

### Step 3: Shared Resettable Instancing Base (Optional But Recommended)
Status:
- Implemented in this branch.

Commit boundary:
- Goal: remove duplicated reset/invalidation patterns across label and artwork instance managers.
- Changes:
  - introduce base abstraction for:
    - instance capacity/index bookkeeping
    - mesh invalidation helpers
    - placement-run reset template method
  - adopt in InstancedLabelRenderer first, then LodGameArtworkRenderer
  - keep event subscriptions owner-local; base should not subscribe globally
- Exit criteria:
  - duplicated reset boilerplate reduced in both renderers
  - no regression in run-reset behavior and capacity tests

## Suggested Test Coverage To Keep

1. Label renderer reset capacity test
- Proves second run can reuse full label capacity after reset.

2. Integration test with arrangement change
- Proves no stale placement intents and no stale metadata after regroup.

3. Empty-section placement integration
- Guards section ownership assumptions so layout and placement stay aligned.

## Decision Notes

- The event-driven design direction remains correct.
- The near-term objective is not new features; it is reducing ambiguity in state ownership and reset sequencing.
- Follow-up refactors should preserve behavior while removing redundant mutation seams.