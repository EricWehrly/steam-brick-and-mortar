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

## id: debug-window-consolidation
**Priority**: Low  
**Effort**: ~1-2 hours  
**Context**: Debug classes self-register onto `window` in their own module files (`GpuMemoryEstimator`, `StartupEventTracker`, etc.). This scatters debug setup across the codebase and makes it harder to audit what's exposed in production builds.

**Done when**:
- A single `debug/DebugRegistry.ts` (or similar) imports all debug classes and attaches them to `window`
- Individual class files no longer contain `window.*` assignments
- The registry is only imported from the debug side-effect import site in `SteamBrickAndMortarApp` (already has `import '../debug/GpuMemoryEstimator'`)
- Easy to tree-shake or gate behind a dev flag if desired

---

## id: carpet-worker-offload
**Status**: ✅ Resolved 2026-04-13 — carpet texture generation moved to `ProceduralTextureWorker` (`carpet_enhanced` type). ~700ms main-thread startup hitch eliminated.

---

## id: system-events-split
**Priority**: Low  
**Effort**: ~1-2 hours  
**Context**: `InteractionEvents.ts` already has a `// TD` noting it conflates user interaction events with system lifecycle events. The new `AppEventTypes` entries (`WorldDetailEnhanced`, `StoreFirstContentReady`, `StoreFullyPopulated`) are system events masquerading as app/UI events because there's nowhere better to put them yet.

**Done when**:
- A dedicated `SystemEvents.ts` (or `LifecycleEvents.ts`) exists for system-to-system pipeline signals
- `WorldDetailEnhanced`, `StoreFirstContentReady`, `StoreFullyPopulated` (and similar future entries) live there
- `InteractionEvents.ts` is scoped to user-facing and UI-driven events
- `LightingEvents.ts` precedent is followed

**Source tags**:  
- `// TD: system-events-split` in `client/src/types/InteractionEvents.ts`

---
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

---

## Later (only true debt, not feature wish-list)

### Test suite runtime-cost reduction
Keep reducing expensive overlap in tests (prefer cheaper deterministic coverage where equivalent).

### Conventions codification
Capture Logger/EventManager/DataManager conventions in one durable technical reference to reduce repeat review feedback.
