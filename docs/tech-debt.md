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

## id: appsettings-default-vs-override-persistence
**Priority**: Medium  
**Effort**: ~1-2 hours  
**Context**: App settings currently mix environment-derived defaults (Vite `DEV`) with persisted values. We started refactoring persistence to store only explicit overrides vs defaults, but paused to avoid churn during current shipping work.

**Decision (for now)**:
- Do not tweak this further in current pass.
- Revisit after current release-critical tasks are complete.

**Done when**:
- Effective value model is explicitly defined as: runtime defaults + user overrides
- Persistence behavior is documented and covered by tests (especially `developmentMode`)
- Reset-to-default behavior in settings panels cannot force dev mode in production builds

**Related files**:
- `client/src/core/AppSettings.ts`
- `client/src/ui/pause/panels/GameSettingsPanel.ts`
## id: room-defaults-ownership
**Priority**: Medium  
**Effort**: ~1-2 hours (ownership cleanup + test updates)  
**Context**: Room spatial defaults are currently split across domains. `RoomManager`/`RoomConstants` defines room defaults while `AppSettings` also hardcodes ceiling defaults (`4.2`). This creates drift risk and unclear ownership for baseline room dimensions.

**Done when**:
- A single owner is defined for room spatial defaults (including ceiling height; prefer room-domain ownership in `RoomManager`/`RoomConstants`)
- `AppSettings` consumes room-owned defaults via dependency/bootstrap wiring instead of hardcoded competing values
- Startup and settings-change tests verify no default mismatch can regress

**When to pick up**:
- Intermission debt pass after current room/lighting stabilization

**Related files**:
- `client/src/scene/RoomManager.ts`
- `client/src/core/AppSettings.ts`

**Source tag**:
- `// TD: room-defaults-ownership` in `client/src/scene/RoomManager.ts`

---

## id: angled-layout-center-aisle-overlap
**Priority**: High  
**Effort**: ~0.5-1 day (geometry pass + visual validation)  
**Context**: In angled layouts (`arc`, `spoke`), shelf bodies can still visually crowd/overlap around center-aisle boundaries under some section distributions. Row layout spacing is currently acceptable; this debt is specifically for angled layout geometry seams.

**Done when**:
- Shelf body extents (not only shelf centers) are guaranteed to remain outside the reserved center aisle corridor in `arc` and `spoke`
- No shelf-to-shelf overlap appears in angled layouts at default and high-count section distributions
- Regression tests cover center-aisle clearance and nearest-neighbor spacing for both angled layouts

**When to pick up**:
- Early Act 2 (after current intermission layout tuning is merged)

**Related files**:
- `client/src/scene/props/shared/ArcLayoutUtils.ts`
- `client/src/scene/props/shared/SpokeLayoutUtils.ts`

---

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

## id: logger-level-discoverability
**Priority**: Medium  
**Effort**: ~1-2 hours  
**Context**: Logger defaults are intentionally `info` to control runtime noise, but this behavior is easy to miss during implementation and review. This leads to debug instrumentation being promoted to `info` just to be visible, which pollutes normal logs and creates PR churn.

**Done when**:
- A short logger-level section is added to agent-facing instructions (and/or contributor docs) that clearly states default logger level behavior and how to temporarily enable `debug`
- The preferred policy is documented: diagnostic instrumentation should default to `debug` unless explicitly needed at `info`
- There is a single discoverable reference for runtime log-level toggling during debugging sessions

**Related files**:
- `.github/copilot-instructions.md`
- `client/README.md`

---

## id: placement-headroom-policy
**Priority**: High  
**Effort**: ~1 day (instrumentation review + policy implementation + validation)  
**Context**: Placement capacity is currently derived from a fixed multiplier over texture capacity. This can under-allocate during multi-group overlap and over-allocate for smaller libraries. Capacity should be policy-driven from observed overlap/cardinality and explicitly validated on arrangement/layout changes.

**Done when**:
- Placement capacity is derived from a documented policy (not a hardcoded multiplier)
- Policy is configurable/observable enough to tune safely
- Regression coverage protects against instance-capacity exhaustion on regroup/re-layout
- Runtime diagnostics can confirm reset + capacity behavior per placement run

**Source tag**:
- `// TD: placement-headroom-policy` in `client/src/scene/spawning/GameBoxSpawner.ts`

---

## id: instanced-mesh-memory-envelope
**Priority**: High  
**Effort**: ~0.5-1 day  
**Context**: We need a measured memory/perf envelope for game-box instancing limits before committing to long-term capacity policy. The experiment matrix should validate behavior under under-saturation, exact saturation, and over-saturation at fixed limits.

**Status**: 🚧 WIP (paused) — experimental harness exists but is currently unreliable (`mid` tier not available in the runtime path used by the visual experiment), so results are not decision-grade yet.

**Experiment matrix**:
- Limits: 100, 1000, 10000
- Saturation levels per limit: under, exact, over
- Metrics: JS heap (`mainHeapMB`), estimated GPU memory (`gpuEstimateMB`), warnings/errors, and whether saturation hooks executed

**Done when**:
- Playwright experiment output is generated and archived for all 9 scenarios
- A recommended default limit is documented from measured data
- Follow-up config plan exists for capability-driven limits (instead of hardcoded constants)

**Related files**:
- `client/test/visual/wip/instance-limit-memory-experiment.spec.ts` (intentionally skipped)

---

## id: carpet-worker-offload
**Status**: ✅ Resolved 2026-04-13 — carpet texture generation moved to `ProceduralTextureWorker` (`carpet_enhanced` type). ~700ms main-thread startup hitch eliminated.

---

## id: shelf-end-cap-signs
**Priority**: Low  
**Effort**: Medium (requires instanced/batched text rendering)  
**Context**: Shelf end-cap labels ("FRONT" / "BACK" per shelf) are disabled in `SceneSignManager.handleShelfCreated` because at 47 shelves they add ~94 draw calls (2 canvas sign DCs × 47). Canvas signs can't be instanced as-is because each bakes a unique texture.

**Done when**:
- Sign rendering supports instanced or atlased text so repeated labels (same text, many positions) cost 1-2 DCs total instead of N
- OR a deliberate decision is made that end-cap labels aren't needed and the dead code is removed

**Source tags**:  
- `// TD: shelf-end-cap-signs` in `client/src/scene/SceneSignManager.ts`

---
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

## Later (only true debt, not feature wish-list)

## id: aisle-terminology-main-vs-row
**Priority**: Low  
**Effort**: ~1-2 hours  
**Context**: "Aisle" currently ambiguously refers to both the global/main aisle and row-local aisle traversal space. This creates friction in implementation discussions, event naming, and UI labels.

**Done when**:
- Canonical terms are chosen and documented for global aisle vs row-local aisle zones
- Existing references in docs/event names/UI labels are normalized where touched
- New code/docs avoid the ambiguous term without qualifier

**Related docs**:
- `docs/acts/act3-ready-for-everyone.md`

---

## id: layout-math-renderer-decoupling
**Priority**: Low  
**Effort**: Deferred (no active timebox)  
**Context**: Layout math in shelf layout utilities currently depends on `THREE` types/constructors (`Vector3`) and overlaps with renderer-adjacent concerns. Long term, layout generation should be pure geometry data so it can be tested and reused without Three.js coupling.

**Done when**:
- Layout utility outputs are plain serializable geometry data (no `THREE.Vector3` construction in layout files)
- A mapping layer translates layout DTOs into renderer-specific types near rendering boundaries
- Layout files no longer import `three`

**When to pick up**:
- Indefinite backlog (revisit only when layout architecture work naturally touches these modules)

**Related files**:
- `client/src/scene/props/shared/ArcLayoutUtils.ts`
- `client/src/scene/props/shared/RowLayoutUtils.ts`
- `client/src/scene/props/shared/SpokeLayoutUtils.ts`

---

### Test suite runtime-cost reduction
Keep reducing expensive overlap in tests (prefer cheaper deterministic coverage where equivalent).

### Conventions codification
Capture Logger/EventManager/DataManager conventions in one durable technical reference to reduce repeat review feedback.
