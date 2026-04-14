# Tech Debt Backlog

> **Bugs belong in `bugs.md`.**
> This file is for architectural/code-quality debt that increases risk, maintenance cost, or implementation friction.
> Feature scope that was intentionally deferred belongs in the relevant feature doc, not here.

## How to use this file

- Keep entries short and actionable.
- Use stable IDs (`## id: ...`) for any debt that has `// TD: ...` source tags.
- When a debt item is mostly product scope, move details to the feature doc and leave only a short cross-reference here (or remove it entirely).

---

## Fix Now (Intermission)

## id: carpet-worker-offload
**Priority**: High  
**Effort**: 2-4 hours  
**Context**: `SharedMaterialManager` still generates carpet textures on the main thread. All other procedural texture paths have moved to worker-backed flow.

**Done when**:
- `carpet_enhanced` generation runs through `ProceduralTextureWorker`
- `SharedMaterialManager` no longer blocks main thread in `prewarmCarpet`
- Existing texture quality and visual output are preserved

**Source tag**: `// TD: carpet-worker-offload` in `client/src/utils/SharedMaterialManager.ts`

---

## id: legacy-atlas-removal
**Priority**: High  
**Effort**: ~1 day  
**Context**: `GpuGameBoxRenderer` still carries legacy atlas renderer paths and settings flags that are no longer part of the intended steady-state architecture.

**Done when**:
- Legacy single/multi-atlas code paths are removed
- LOD atlas is the only supported runtime path
- Obsolete settings flags are removed from `AppSettings`
- Dead renderer files are deleted (if truly unreferenced)

**Related feature/doc context**:
- `docs/features/gamesort-full-pipeline.md` (renderer simplification context)
- `docs/archive/hot-path-refactoring-plan.md` (historical breakdown)

**Source tags**:
- `// TD: legacy-atlas-removal` in `client/src/scene/game-box/GpuGameBoxRenderer.ts`
- `// TD: legacy-atlas-removal` in `client/src/core/AppSettings.ts`

---

## id: approximated-placement-tripwire
**Priority**: Medium  
**Effort**: 1-2 hours (investigation + assertion hardening)  
**Context**: Placement helpers include approximation/tripwire behavior that should be made explicit and verified against real placement flows.

**Done when**:
- Current approximation assumptions are documented inline
- Guard rails/tests fail loudly when placement semantics drift
- The debt can be removed or replaced with explicit invariant checks

**Source tag**:
- `// TD: approximated-placement-tripwire` in `client/src/scene/props/shared/GameBoxUtils.ts`

---

## id: sticker-coordinator
**Priority**: Medium  
**Effort**: 1-2 days (when sticker/sign ownership work is active)  
**Context**: `ShelfStickerHandler` still depends on renderer wiring (`setManagers`) instead of a clean event-owned coordination model.

**Done when**:
- Sticker lifecycle is owned by a dedicated coordinator reacting to events
- Renderer internals are no longer passed directly into sticker logic
- Ownership boundaries mirror the sign lifecycle pattern

**Related feature/doc context**:
- `docs/features/gamesort-full-pipeline.md`

**Source tag**:
- `// TD: sticker-coordinator` in `client/src/scene/stickers/ShelfStickerHandler.ts`

---

## Act 2-Linked Technical Debt (keep small; details live in feature docs)

### Input architecture boundary cleanup
`WebXRCoordinator` currently carries broader input concerns than XR session management. Keep this tracked in:
- `docs/features/input-system.md`

### UI normalization + token consistency
Tokenization/component consistency work is tracked in:
- `docs/features/ui-standardization.md`

### Memory/frame observability hardening
Metric visibility and collection direction is tracked in:
- `docs/features/key-metrics-instrumentation.md`

---

## Later (only true debt, not feature wish-list)

### Test suite runtime-cost reduction
Keep reducing expensive overlap in tests (prefer cheaper deterministic coverage where equivalent).

### Conventions codification
Capture Logger/EventManager/DataManager conventions in one durable technical reference to reduce repeat review feedback.

---

## Removed from tech debt during cleanup

These were intentionally extracted to feature or act docs because they are product scope, not debt:
- atmosphere/particle ideas -> `docs/features/lighting-and-atmosphere.md`
- layout mode/shape ideas -> `docs/features/layout-variations.md`
- museum/share room concept -> `docs/features/room-variants.md` + Encore
- broad infrastructure deliverables (hosting, rate limiting, caching) -> act/feature docs
