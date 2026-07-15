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

### Library Reload Lifecycle (implemented — reconcile / full split)

- Owner: `GameBoxSpawner.resetForLibraryReload()`, triggered by
  `StorePropsEventTypes.LibraryReloadRequest`.
- History: this started as an unconditional `fullReset()` — disposes `GpuGameBoxRenderer` (and
  everything it owns, `LodArtworkOrchestrator`/`LodTextureArrayManager` included) and rebuilds from
  scratch. That was the confirmed root cause of a disposal-ordering race (in-flight
  `ArtworkPrefetchCoordinator` fetches writing into an already-disposed `LodTextureArrayManager`,
  logging `Unknown tier: mid` — see `docs/tech-debt.md#id-lod-tier-reset-race-condition`) and of
  wastefully re-fetching every game's artwork on a relaunch where nothing had changed. An
  intermediate design added a capacity-compatible "soft reset" (no disposal, but still rewound
  every slot and bumped a `generation` counter so in-flight writes from before the reset could
  detect staleness and drop themselves) plus a narrower "reconcile" tier that only touched
  genuinely removed/renamed games. Once the diff moved into `SteamIntegration.applyLibrary()`
  (computed against the live rendered library, not something the caller has to compute and thread
  through), reconcile became the *only* capacity-compatible caller — the blanket soft reset had no
  remaining use and was deleted, and with it the `generation` counter: nothing reassigns a kept
  game's slot anymore, so there's nothing for a late-resolving fetch to collide with. See
  `docs/plans/startup-reload-review-findings.md` (F1, F3) for the full before/after reasoning.
- **Current shape**: two tiers, chosen in `GameBoxSpawner.resetForLibraryReload()`:
  - **Reconcile** (capacity-compatible AND the caller supplied `removedGameNames` — today, only
    `SteamIntegration.applyLibrary()` does, diffing the incoming library against
    `this.gameLibrary`'s current state via `computeLibraryDiff()` in `Library.ts`). No disposal.
    `LodArtworkOrchestrator.reconcileForLibraryReload()` clears only the removed/renamed games'
    texture-slot mappings (`gameNameToTextureIndex`, `prefetchedHighArtworkUrl`,
    `HighTextureCache.unregisterGame`); every other game's mapping — and its already-decoded
    artwork — is untouched, so `prefetchArtwork()`'s existing "already mapped" check makes
    re-resolving it a no-op. The slot allocator is not rewound (removed games' slots are left
    unused, not reclaimed — see `docs/plans/startup-reload-review-findings.md` F6 for when that
    starts to matter).
  - **Full** (capacity-incompatible, or the caller has no diff info — e.g. an online reload that
    hasn't fetched data yet): unchanged from the original `fullReset()` — dispose and rebuild at
    the new capacity, since a genuinely larger incoming library needs a bigger
    `THREE.DataArrayTexture` and there's no way around disposing the old one first
    (double-buffering old+new during the swap was considered and rejected as unnecessary
    complexity/VRAM cost for a transition — demo store → real library — that's expected to be
    visually a hard cut anyway).
  - `GameBoxSpawner` decides which tier applies by comparing the incoming library's game count
    against the currently-allocated texture capacity *and* checking whether `removedGameNames` is
    present — not by which event fired.

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