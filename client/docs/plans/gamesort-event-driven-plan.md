# Event-Driven Game Sort & Shelf Rendering Plan

**Status:** In progress (branch: `openclaw/feat-event-driven-sort`)  
**Last Updated:** 2026-04-10

---

## Overview

This branch refactors the shelf rendering and game sorting pipeline to be fully event-driven. The goal is to:

1. ✅ Decouple rendering components via event chains (no pass-through render calls)
2. ✅ Move shelf mesh ownership from `GpuStorePropsRenderer` into a dedicated `ShelfRenderer`
3. 📋 Extract sign decision helpers from `SceneSignManager` for maintainability
4. 🔮 Prepare architecture to support multiple sign types (canvas-based, neon tubes, etc.)
5. 🎯 Enable removal of shelf spawning from `GpuStorePropsRenderer` cleanly

---

## Architecture

### Event Flow

```
BatchReadyForPlacement (from SteamIntegration)
  ↓
GpuStorePropsRenderer.handleInitialBatch()
  ├─ initializes GpuGameBoxRenderer
  ├─ awaits ShelfRenderer.waitUntilReady()
  └─ pre-allocates arc layout positions

ShelfSpaceRequested (from GameBoxSpawner)
  ↓
GpuStorePropsRenderer.handleShelfSpaceRequested()
  ├─ ShelfRenderer.createShelf(batchIndex, position, rotationY)
  │   └─ GPU instance write via InstancedShelfRenderer
  │   └─ emits ShelfReady
  ├─ emits ShelfCreated
  │   ↓ (listeners: GameBoxSpawner, SceneSignManager)

GameBoxSpawned (from GameBoxSpawner on ShelfCreated)
  ↓
GpuStorePropsRenderer event handler
  └─ calls GpuGameBoxRenderer.createGameBoxAuto()

ShelfCreated (from GpuStorePropsRenderer)
  ↓
SceneSignManager (listens for shelf creation)
  └─ places end-cap orientation labels via setSign()

GamesSort (from GameSorter on setup complete)
  ↓
SceneSignManager (listens for games sorted)
  ├─ clears previous time-bucket signs
  ├─ places Recently Played ceiling sign
  └─ replays bucket signs for each existing shelf

ShelfCreated or ShelfReady (post-sort)
  ↓
SceneSignManager (reactively places bucket signs)
  └─ emits no events (terminal observer)

AllBatchesComplete (from BatchCoordinator)
  ↓
GpuStorePropsRenderer
  └─ finalizes state
```

### Component Ownership

| Component | Owner | Responsibility |
|-----------|-------|-----------------|
| Arc layout calculation | `GpuStorePropsRenderer` | Position/rotation math for shelves |
| GPU shelf instancing | `ShelfRenderer` | `InstancedShelfRenderer` lifecycle + writes |
| Shelf-to-position mapping | `GpuStorePropsRenderer` | Event coordination + batching |
| Game box rendering | `GpuGameBoxRenderer` | GPU write on `GameBoxSpawned` event |
| Game spawning | `GameBoxSpawner` | Place games on `ShelfCreated`, emit `GameBoxSpawned` |
| Signage (canvas-based) | `SceneSignManager` | Manage signs reactively on layout/sort events |

---

## Multi-Sign-Type Architecture

### Current State

**Canvas-based signs** (via `SignageRenderer`):
- Text rendered to canvas → `DataTexture` → `PlaneGeometry` mesh
- Stored in `SceneSignManager` with `SignKind` discriminant
- Kinds: `'category'`, `'bucket'`, `'ceiling'`, `'end-cap'`

**Neon tube signs** (on `feat-neon-sign-v2` branch):
- Independent `NeonTubeSign` class (self-contained, owns `THREE.Group`)
- Uses `TextGeometry` + outline paths + `TubeGeometry` for 3D effect
- No lifecycle integration with `SceneSignManager` yet

### Integration Plan (When Merging Neon Signs)

When the neon tube work is ready to integrate:

1. **Expand `SignKind`:**
   ```typescript
   export type SignKind = 
     | 'category' | 'bucket' | 'ceiling' | 'end-cap'
     | 'neon-tube'   // ← new variant
   ```

2. **Update `SignRecord` type:**
   - Currently stores `mesh: THREE.Mesh`
   - Neon uses `THREE.Group` (subclass, compatible via duck typing)
   - No breaking change needed; both are `THREE.Object3D`

3. **Dual-track setSign:**
   - Keep `setSign(CategorySignDescriptor, kind)` for canvas-based
   - Add `setNeonSign(NeonSignDescriptor)` for neon-specific config (glow, text, color)
   - Internally both write to the same `signs` map with their respective kinds

4. **Cleanup:**
   - `clearByKind('neon-tube')` disposes neon groups + materials
   - `getSignsByKind('neon-tube')` filters to neon signs only
   - Neon signs stored under their own labels (e.g., `'neon-ampersand'`, `'neon-section-header'`)

5. **Resource Management:**
   - Neon: dispose font loader, texture resources, geometry
   - Canvas: existing texture/material recycling via `bakeTexture()` is sufficient

### Why This Approach

- **Discriminated union** (`SignKind`) allows targeted batch operations (clear only neons, audit canvas signs)
- **Polymorphic storage** (any `Object3D`) works for both flat and 3D signs without type gymnastics
- **Separate descriptor types** keep config concerns separated (canvas colors vs. neon glow)
- **Single lifecycle** — all signs route through `SceneSignManager` for consistency
- **Backward compatible** — existing canvas sign code unchanged; neon adds new paths only

### Future: Other Sign Types

Placeholder variants for future consideration:
- `'edge-lit'` — light-pipe edge-lit acrylic sign
- `'projection'` — projected text on floor/wall
- `'model'` — pre-made 3D model signs (store signage assets)

---

## Current Work Status

### ✅ Completed

- `GameBoxSpawner` ↔ `GpuGameBoxRenderer` decoupling via `GameBoxSpawned` event
- `SceneSignManager.setSign()` refactor with `SignRecord` + geometry recycling
- `ShelfRenderer` takes ownership of `InstancedShelfRenderer` lifecycle
- `GpuStorePropsRenderer` delegates shelf placement to `ShelfRenderer`
- Event flow clean: no direct method calls between renderers

### 📍 In Progress / Todo

- Extract sign decision helpers (`TODO(signage)` in `SceneSignManager`)
  - Bucket-transition logic
  - Anchor position generation
  - These should become small, testable utility functions

### 🔮 Blocked / Future

- Neon tube sign integration (waiting for `feat-neon-sign-v2` to stabilize)
- Wall-mount sign support (foundation exists in `SceneSignManager.resolvePosition()`)
- Sign layout constraints (e.g., don't overlap signs, min distance from room boundary)

---

## Shelf Spawning Removal: Readiness Assessment

### Current State

`GpuStorePropsRenderer` still owns:
- Arc layout position/rotation pre-calculation (`preallocateArcLayout()`)
- `ShelfSpaceRequested` → `ShelfCreated` event flow
- Decision: "create a shelf for this batch" + position lookup

`ShelfRenderer` owns:
- GPU instance writes (`InstancedShelfRenderer` init + `setInstance()` calls)
- `ShelfReady` event emission

### Answer: **Not Yet Ready**

**Why shelf spawning must stay in PropsRenderer:**

1. **Position pre-calculation is a layout concern**, not a rendering concern
   - Arc layout math depends on `totalBatches` and genre distribution
   - Position → rotation correlation is baked into the arc config
   - This is intrinsically coupled to the store layout philosophy (inverted arc)

2. **Event coordination flow is a pipeline concern**
   - `BatchReadyForPlacement` → layout decision → `ShelfSpaceRequested` → shelf creation
   - This sequence is *content-aware*: different layout strategies = different flows
   - If we moved this to `ShelfRenderer`, it would become a generic "render all shelf positions" thing, losing semantics

3. **Future scenario: add a different layout strategy**
   - Grid layout, spiral, circular, wall-aligned, etc.
   - Each layout impl would need to own its position logic
   - Creating *multiple* position sources would fragment the arch
   - Better to keep position calculation in the *layout coordinator* (currently `GpuStorePropsRenderer`)

### Path Forward (Phase 3 Refactoring)

When position logic grows or we add layout variants:

**Create a dedicated `ShelfLayoutCoordinator`:**
```typescript
class ShelfLayoutCoordinator {
  preallocateArcLayout(totalShelves)
  preallocateGridLayout(totalShelves)
  getShelfPosition(batchIndex): Vector3
  getShelfRotation(batchIndex): number
  reset()
}
```

Then `GpuStorePropsRenderer` becomes lightweight:
```typescript
constructor() {
  this.layout = new ShelfLayoutCoordinator()
  this.shelfRenderer = new ShelfRenderer()
}

handleShelfSpaceRequested(batchIndex) {
  const pos = this.layout.getShelfPosition(batchIndex)
  const rot = this.layout.getShelfRotation(batchIndex)
  this.shelfRenderer.createShelf(batchIndex, pos, rot)
}
```

**At that point**, shelf spawning logic is cleanly separated:
- Layout: `ShelfLayoutCoordinator` (position math)
- Rendering: `ShelfRenderer` (GPU writes)
- Coordination: `GpuStorePropsRenderer` (glue + lifecycle)

---

## Technical Debt Tracking

See `docs/roadmaps/tech-debt.md` for items related to this work:

- Category System Tech Debt / SceneSignManager → `TODO(signage)` extraction
- Category System Tech Debt / SceneSignManager → multi-mount style completion
- DataManager memory tracking → separate out into dedicated class

---

## Testing

### Unit Tests
- `SceneSignManager.test.ts` — mount math, event firing, kind-based filtering
- `ShelfRenderer.test.ts` — lifecycle, RendererReady emission, createShelf guards
- `GameBoxSpawner.test.ts` — `GameBoxSpawned` event emission on shelf creation

### Integration Tests
- `batch-to-placement-flow.int.test.ts` — full pipeline: BatchReady → Shelves → Games placed

Run all tests:
```bash
yarn test          # Unit + integration
yarn test:all      # Unit + integration + performance (excludes live)
```

---

## Commits on This Branch

```
03fdf15 refactor(shelves): move GPU instancing ownership to ShelfRenderer
1434344 refactor(signs): add SignRecord + SignKind, recycle geometry on setSign update
2206ca1 refactor(spawn): decouple GameBoxSpawner via GameBoxSpawned event chain
```

Base: `origin/openclaw/6.2.x`

---

## Next Steps

1. **Extract sign helpers** (small PR)
   - Move bucket-transition detection into `isBucketTransition(prevGame, currGame): boolean`
   - Move anchor generation into `computeBucketSignAnchor(shelfPosition): Vector3`
   - Add unit tests for each helper

2. **Smoke test the full pipeline** (when ready for user testing)
   - Load a user's Steam library
   - Verify shelves render correctly in arc layout
   - Verify signs appear in right places (end-caps, bucket dividers, ceiling)
   - Check neon sign branch for merge-readiness

3. **Consider Phase 3 refactoring** (future)
   - Create `ShelfLayoutCoordinator` for multi-strategy support
   - Document layout config format for easier iteration

---

## Context for Future Work

- Neon tube signs are production-ready on `origin/openclaw/feat-neon-sign-v2`
- Categories v2 work exists on related branches; assess if synergistic
- WebXR camera/interaction is stable; no conflicts expected
- Performance: 684 passing tests, ~30s wall clock; no regressions expected from sign/shelf work
