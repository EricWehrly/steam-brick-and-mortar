# Tech Debt Backlog

> **Bugs belong in `bugs.md`. This file tracks architectural and code-quality debt that requires deliberate work to resolve.**
> Ongoing code conventions (JSDoc hygiene, file size, naming) live in `docs/guidelines/code-conventions.md` — not here.
>
> **Tech Debt Tags**: Source files are annotated with `// TD: <tag-id>` at the file top to link them to entries here.
> Each tagged entry uses `## id: <tag-id>` as its header for easy lookup.
> See `docs/README.md` for the full tagging convention.

---

## Intake Queue
*New items requiring triage and prioritization*

### UI: Formalize z-index layering system
**Priority**: Very Low  
**Effort**: 1-2 hours  
**Context**: Currently z-index values are scattered and ad-hoc (binder: 1500, detail panel fixed to 2000 to sit above it). We've hit at least one "panel behind another" bug already. When the UI system grows (VR overlay layers, spatial UI etc.) this will bite us more. The right fix: define named z-index layers as CSS custom properties or JS constants (e.g. `--z-base`, `--z-panel`, `--z-overlay`, `--z-modal`) reserved in blocks of 100. Low priority until it causes more than one incident per quarter.  
**Tags**: none (not yet worth tagging source files)  
**Source**: Apr 2026

### Architecture: Review `LegacyStorePropsHandler` value and future
**Priority**: Low  
**Effort**: 2-4 hours (investigation + decision)  
**Context**: `LegacyStorePropsHandler` exists as a CPU-fallback path when the GPU instancing check fails. Questions to answer: (1) Does it still function at all without GPU instancing? (2) Can we test it in Docker with SwiftShader or a software renderer? (3) Is there DRY opportunity with `GpuStorePropsEventHandler`, or should they stay fully separate? (4) Is anyone likely to hit this path in practice?  
**Source**: Apr 2026

### Performance: Offload carpet texture generation to worker (`carpet-worker-offload`)
**Priority**: Medium  
**Effort**: 2-3 hours  
**Context**: `prewarmCarpet` in `SharedMaterialManager` calls `ProceduralCarpetPatternGenerator.createCarpetMaterial()` synchronously on the main thread. All other procedural textures run through `ProceduralTextureWorker`. Add a `carpet_enhanced` texture type to the worker pipeline and migrate this call.  
**Source**: Apr 2026  
**Tag**: `// TD: carpet-worker-offload` in `SharedMaterialManager.ts`

### Architecture: Review carpet patterns for DRY/quality (late Phase 2)
**Priority**: Low  
**Effort**: 2-4 hours  
**Context**: Brought in from `origin/carpet-rebase`. Check for DRY opportunities between `ClassicCarpetPatternGenerator`, `GeometricPatternGenerator`, and the base. Evaluate output quality before Phase 2 "ready for friends". Review after showcase UI is built.  
**Source**: Apr 2026

### Types: Tighten `getLightsByType` Constructor Signature
**Priority**: Low  
**Effort**: 30 min  
**Context**: `LightRegistry.getLightsByType<T>` uses `unknown[]` for the constructor rest-args parameter. The linter flags both `any[]` and `unknown[]` as type-system opt-outs. The correct type depends on whether Three.js light constructors share a common abstract base constructor signature — they don't, so this may need a `{ prototype: T }` pattern (no constructor call needed, just `instanceof`) or a mapped type of known light constructors.  
**Source**: Apr 2026 — spotlight lag spike work

### Events: Make UI Emissions Use a `UIEvent` Base Type
**Priority**: Medium  
**Effort**: 2-3 hours  
**Context**: UI components emit events ad-hoc. They should all emit a `UIEvent` type with a sub-identifier, so UI events are distinguishable from game/system events in the event log.

### Performance: Document LOD Configuration Levers
**Priority**: Low  
**Effort**: 1 hour  
**Context**: The following LOD parameters exist but lack documented tuning guidance:
```
maxTextureSize, nearDistance, farDistance,
highResolutionSize, mediumResolutionSize, lowResolutionSize,
maxActiveTextures, frustumCullingEnabled
```
Add a reference doc or inline comments explaining when and why to adjust each.

---

## Critical Issues
*Must fix - blocks core functionality or introduces serious bugs*

*No critical issues currently identified.*

---

## High Priority
*Should fix soon — impacts user experience or developer productivity*

### User Experience

#### Centralized Input Management System
**Effort**: 6-8 hours
**Context**: Typing in input fields triggers camera movement. Menu focus doesn't disable scene controls. No centralized way to disable controls when UI is active.

**Tasks**:
- Create `InputManager` with focus tracking, `disableSceneControls()` / `enableSceneControls()`, and input context stacking
- Add `onFocus` / `onBlur` hooks for all UI panels (Game Library Binder, Steam UI Panel, Pause Menu)
- Disable WASD/mouse when any UI has focus; re-enable on return to game area
- Design for future: input action mapping, VR controller routing, gamepad support

**Files to create**: `core/InputManager.ts`, `core/InputContext.ts`
**Files to modify**: `webxr/WebXRCoordinator.ts`, `ui/SteamUIPanel.ts`, `ui/binder/GameLibraryBinderUI.ts`, `ui/pause/PauseMenuManager.ts`

**Source**: Nov 2025 — Game Library Binder implementation

---

### Architecture

#### Remove Legacy Atlas Renderers from GpuGameBoxRenderer
**Effort**: 1 day
**Context**: LOD atlas is proven stable in production. `InstancedArtworkRenderer` (single atlas, ~1GB VRAM) and `MultiAtlasArtworkRenderer` (270MB VRAM) are dead code paths still instantiated via settings flags. Removing them simplifies the renderer significantly (~220 LOC reduction).

**Tasks**:
1. Remove `InstancedArtworkRenderer` field and path (`!useLodAtlas && !useMultiAtlas`)
2. Remove `MultiAtlasArtworkRenderer` field and path (`!useLodAtlas && useMultiAtlas`)
3. Remove `createGameBoxFromUrlSingleAtlas()`, `createGameBoxFromUrlMultiAtlas()`, `createInstancedArtworkBox()`, `setBatchIndex()`, `createGameBox()` (deprecated)
4. Remove `useMultiAtlas` and `useLodAtlas` flags — LOD is now always on
5. Remove `Setting.UseMultiAtlas` and `Setting.UseLodAtlas` from AppSettings
6. Delete `MultiAtlasArtworkRenderer.ts` and `InstancedArtworkRenderer.ts`
7. Run tests, verify no VRAM regression

**Note**: `hot-path-refactoring-plan.md` (archived) covers this in detail as "Pass 1". See archive if you need the full step-by-step.

**Source**: Oct 2025 — GPU instancing roadmap; tracked since Jan 2026

#### Refactor Panel/Tab Naming and Architecture
**Effort**: 3-4 hours
**Context**: Current "panels" in the pause menu function as tabs. Building more on the wrong abstraction.

**Tasks**:
- Rename `Panel` classes to `Tab` to reflect actual behavior
- Define true `Panel` concept as logical UI groupings within tabs
- Update pause menu navigation and component registration
- Plan Panel extraction for large tab sections

**Files to modify**: `client/src/ui/pause/` (all panel classes)

**Source**: Architecture review

#### GpuStorePropsRenderer Event Untangling — Phase 4
**Effort**: 1-2 hours
**Context**: Phases 1-3 complete per `gpustoreprops-event-untangling.md`. Phase 4 is cleanup: simplify/remove `processOneBatch`, reduce GpuStorePropsRenderer to ~150 LOC pure coordinator.

**See**: `docs/active/gpustoreprops-event-untangling.md` — Phase 4 section

---

### Testing

#### Replace Procedural Shelf Perf Tests with Production-Path Benchmarks
**Effort**: 4-6 hours
**Context**: Current performance suite measures `ProceduralShelfGenerator` paths that aren't used in production. Production shelf flow is instanced and event-driven.

**Tasks**:
1. Remove procedural shelf performance assertions from `test/performance/shelf-performance.test.ts`
2. Add production-path performance tests: `BatchCoordinator → GameBoxSpawner → InstancedShelfRenderer`
3. Define realistic volume scenarios (200-500 games, batched at 18) for first-visit and revisit
4. Set timing budgets from production-path measurements

**Source**: Mar 2026 — Batch/event/perf review

#### Update Failing StorePropsRenderer Tests
**Effort**: 2-3 hours
**Context**: 3 tests fail because they expect pre-bifurcation behavior. `createGameBox` calls are now handled by `InstancedStorePropsRenderer`.

**Tasks**:
- Update tests to reflect delegating architecture
- Verify mocks work with bifurcated system
- Ensure coverage of both Legacy and Instanced paths

**Files**: `client/test/unit/scene/` — StorePropsRenderer test files

**Source**: Oct 2025 — GPU instancing implementation

#### Fix GpuStorePropsRenderer Initialization Test Overhead
**Effort**: 6-8 hours
**Context**: Integration tests spend ~5.5s in `beforeEach` waiting for `GpuStorePropsRenderer` initialization. Blocks all batch event processing and makes tests slow.

**Root Causes**:
1. `InstancedShelfRenderer.initialize()` is fire-and-forget async in constructor (now event-driven per `gpustoreprops-event-untangling.md`, but init still takes ~3s)
2. `waitForShelfRendererReady()` polling loop eliminated, but underlying init duration remains

**Options**:
- Lazy initialization: don't initialize `InstancedShelfRenderer` until first batch event
- Pre-bake geometry: export shelf geometry as GLTF/FBX, load from file
- Better test mocking: mock `GpuStorePropsRenderer` at higher level to avoid GPU allocation

**Files**: `src/scene/GpuStorePropsRenderer.ts`, `src/scene/instancing/InstancedShelfRenderer.ts`, `test/integration/batch-to-placement-flow.int.test.ts`

**Source**: Jan 2026 — Integration test investigation

---

### Code Quality

#### Extract Shader Code to Dedicated Files
**Effort**: 2-3 hours
**Context**: Some shader code remains embedded in component files. Shaders in `game-box/instancing/` already have dedicated `.frag`/`.vert` files — apply that pattern to any remaining inline shaders.

**Tasks**:
- Audit components for inline GLSL strings
- Extract to `.frag`/`.vert` files alongside their consumers
- Update imports

**Source**: Oct 2025 — Code quality review

#### Remove Redundant JSDoc Comments
**Effort**: 2-3 hours
**Context**: Many files have verbose JSDoc that just restates the method signature. Adds noise, no signal.

**Tasks**:
- Audit TypeScript files for comments that say nothing beyond the type signature
- Keep comments that explain *why*, edge cases, or architecture decisions
- Remove boilerplate

---

## Medium Priority
*Good to fix — improves code quality or user experience*

### Performance

#### Profile and Fix InstancedShelfRenderer Initialization (~3s)
**Effort**: 2-4 hours
**Context**: `InstancedShelfRenderer.initialize()` takes ~3 seconds. Unclear if the bottleneck is geometry creation, material setup, or GPU upload. Need profiling before fixing.

**Tasks**:
- Add detailed timing inside `initialize()` for each step
- Identify bottleneck
- Implement fix: geometry caching in IndexedDB (if geometry), SharedMaterialManager reuse (if material), deferred upload (if GPU)

**Source**: Dec 2025 — Startup optimization analysis

#### Distance-Based Dynamic Lighting Activation
**Effort**: 4-6 hours
**Context**: All ceiling fixtures active regardless of player distance. With ~6 RectAreaLights, activating only the 2-3 nearest could save 30-50% light computation.

**Tasks**:
- Store fixture world positions during creation
- Each frame, activate fixtures within radius (~15m), deactivate beyond
- Add hysteresis to prevent flicker
- Use `fixture.visible = false` for immediate wins; intensity fade for polish

**Source**: Nov 2025 — User request

#### LOD System for Lighting and Shadows
**Effort**: 8-12 hours
**Context**: All lights and shadows render at full quality regardless of distance or perf budget.

**LOD levels**: Full shadows (close) → reduced shadows (medium) → minimal/culled (far) → ambient only (very far)
**Target**: 90fps VR (11ms frame budget); 20-40% GPU load reduction in large scenes

**Source**: Nov 2025 — User request

#### Framerate-Based Deferral System
**Effort**: 6-8 hours
**Context**: Heavy operations (geometry, texture loading) cause frame drops. Rather than fixed timeouts, defer work based on actual frame budget.

**Proposed**: `DeferralManager` singleton with prioritized work queue; measures actual frame time each frame; pauses queue when over budget.

**Source**: Dec 2025 — Startup optimization discussion

#### WebWorker-Based Procedural Texture Generation
**Effort**: 6-8 hours
**Context**: `WoodTextureGenerator`, `CarpetTextureGenerator`, `CeilingTextureGenerator` all block the main thread. Currently lazy-loaded, but first-request still causes frame drop.

**Source**: Oct 2025 — SharedMaterialManager lazy loading

#### GPU Instancing Audit — Remaining Opportunities
**Effort**: 4-6 hours
**Context**: Recent instancing work (artwork, labels, spotlight beams) showed 10-100x gains. Remaining candidates:
- Shelf geometry (50-100 identical shelves → 1 InstancedMesh)
- Ceiling fixture housings (6-12 identical → 1 InstancedMesh)
- Debug visualization objects (arrows, boxes, spheres)

**Source**: Nov 2025 — Instancing wins

#### Deferred Update Pattern — Systematic Application
**Effort**: 2-4 hours
**Context**: `requestAnimationFrame` deferral already used in `LightingControlsPanel`. Should be a documented pattern applied systematically to: game box texture updates during batch loads, UI panel refreshes, debug overlay updates, statistics panel updates.

**Tasks**: Create `DeferredExecutor` utility class; document pattern; apply to identified hot paths.

**Source**: Nov 2025 — Checkbox update optimization

### Architecture

#### Unified Popup/Panel Management System
**Effort**: 8-12 hours
**Context**: LOD controls, lighting panel, binder, debug panels each have their own toggle mechanisms and can overlap. Need a `PopupRegistry` / `PanelManager` that handles positioning, z-ordering, and multi-activation (button, keyboard, VR controller).

**Source**: Dec 2025 — LOD controls panel implementation

#### Event-Driven Room Resizing
**Effort**: 4-6 hours
**Context**: `RoomManager` creates walls synchronously (~1.5s, needs profiling). Room sizing is coupled to knowing game count upfront.

**Proposed**: Room spawns at minimum size → listens for game count events → resizes dynamically.

**Source**: Dec 2025 — Startup optimization discussion

#### Background-Tab Low-Resource Startup Mode
**Effort**: 6-10 hours
**Context**: When client starts without window focus, it should defer heavy init and reduce animation rate (e.g., 10fps vs 90fps), resuming fully on focus.

**Implementation path**: `document.hasFocus()` + Page Visibility API; chunked loading via `requestIdleCallback`; reduce concurrent texture processing.

**Source**: Nov 2025 — User request

#### Development-Mode Instance Lifecycle Watchdog
**Effort**: 4-6 hours
**Context**: Multiple instances of singleton-intended classes cause subtle bugs (e.g., shader uniforms stored in wrong instance). Discovered when 3 `ShelfStickerIntegration` instances were created.

**Tasks**: `InstanceTracker` utility (dev builds only), warn with stack trace on duplicate instantiation of registered classes.

**Source**: Nov 2025 — Sticker data texture debugging

#### Three.js Scene Resource Leak Detector
**Effort**: 6-8 hours
**Context**: Need dev-mode tooling to detect unused meshes, geometries, materials, textures. Needs whitelist support (skybox, LOD meshes, pooled resources).

**Source**: Nov 2025 — Performance optimization

### UI

#### Fix Pause Menu Double Scrollbars
**Effort**: 1-2 hours
**Context**: Two scrollbars appear in pause menu when viewport is reduced (notably on cache page). CSS overflow context conflict.

#### Standardize Cache Management UI Styling
**Effort**: 1-2 hours
**Context**: Cache scrolling view buttons/inputs inconsistent with main UI styling.

#### Improve Preview Button State Management
**Effort**: 1-2 hours
**Context**: "Initialize preview" button should update state after initialization, and reset on menu close.

#### Pause Menu Tab Persistence
**Effort**: 1-2 hours
**Context**: Pause menu should remember active tab across page refresh via `localStorage`.

#### Game Limiting UI Configuration
**Effort**: 3-4 hours
**Context**: `maxGames` config exists and works, but isn't exposed in settings UI. Should be toggleable (off by default).

#### Smart Cache Management Panel Refresh
**Effort**: 1-2 hours
**Context**: 5-second refresh interval; should pause when panel not visible, increase interval to 8s when visible, add manual refresh button.

#### Optimize `hasCachedData()` Method
**Effort**: 1-2 hours
**Context**: Minor: cache the resolve lookup result, add `getCachedUserData()` combining resolve + games lookup, optimize cache key string operations.

### Testing

#### Hardware Renderer Heuristic — Real-World Telemetry
**Effort**: 2-4 hours initial
**Context**: `SystemCapabilitiesDetector` treats renderer strings not containing `software` as hardware, including `unknown`. May misclassify edge devices.

**Tasks**: Record capability snapshots from real sessions; review `unknown` renderer anomalies; decide whether to treat `unknown` as low-confidence; update capability tests.

**Source**: Mar 2026 — Batch/event review follow-up

#### Implement Missing Integration Test Coverage
**Effort**: 6-8 hours
**Context**: Identified gaps: Steam API/Integration boundary tests, texture loading integration tests, scene rendering tests without WebGL dependency, progressive loading integration tests.

#### Review and Reclassify Performance Tests
**Effort**: 2-3 hours
**Context**: Some unit tests have timing/performance measurements and should be in `.perf.test.ts` files with proper benchmarking thresholds.

---

## Low Priority
*Nice to have — minimal impact on core functionality*

### Features

#### User Settings for Texture Quality and LOD Mode
**Effort**: 4-6 hours
**Context**: Expose LOD mode (Dynamic/Always HIGH/Always MID) and HIGH texture slot count to users via the existing `GameSettingsPanel`. Store in `AppSettings`.

**Note**: Graphics settings panel HTML has disabled controls waiting for texture cache refactor (see `texture-cache-refactor-plan.md`). This work may depend on that.

**Source**: Dec 2025 — Pixel cache implementation discussion

#### Graphics Settings Scene Reload (vs Page Reload)
**Effort**: 3-4 hours
**Context**: Graphics settings currently require full page reload. Scene reload infrastructure exists; wire it to settings changes with an "Apply" button.

#### Export Rendered Shelf as Model File
**Effort**: 4-6 hours
**Context**: Could potentially export GPU-instanced shelf geometry as static GLTF to eliminate instance management overhead. Investigate draw call reduction vs current instancing approach.

**Source**: Oct 2025 — Performance consideration

### Code Quality

#### Review InteractionEvents for Unnecessary Properties
**Effort**: 1-2 hours
**Context**: Some event interfaces likely have properties passed through but never consumed. Audit, grep for each property, remove unread ones (YAGNI).

**Example**: `SteamGamesBatchEvent` originally had `isLastBatch` and `isSupplementalBatch` that were passed but never read.

**Source**: Dec 2025 — Cache-first loading refactor

#### Remove Dead Event Code from SteamWorkflowManager
**Effort**: 1-2 hours
**Context**: Unused event handlers for image cache stats. Remove listeners and related event definitions.

#### Main Thread Activity Tracker
**Effort**: 4-6 hours
**Context**: Previous attempt (Nov 2025) abandoned due to timing complexity between startup phases and game loading mode. Possible better approach: decorator-based instrumentation or browser `performance.mark/measure`.

**Deferred**: Current progress bar is sufficient for MVP.

---

## Priority Definitions

- **Critical**: Blocks core functionality, serious bugs, or security issues
- **High**: Significantly impacts user experience, developer productivity, or code quality
- **Medium**: Moderate improvements to performance, maintainability, or UX
- **Low**: Minor enhancements, nice-to-haves, or preparatory work

## Workflow

1. **Intake**: New items added to Intake Queue above
2. **Triage**: Move to appropriate priority section with effort estimate
3. **Active work**: Use dedicated planning docs in `docs/active/` for complex items
4. **Completion**: Remove from this file (or add brief note if useful for history)

---

## id: singleton-pattern-refactor
**Priority**: Low  
**Effort**: 15-30 min per class  
**Status**: Pattern finalized — `MeshPrewarmer` is the reference implementation  
**Context**: All singleton classes use `public static getInstance(): T` which forces callers to call the method explicitly. The agreed pattern uses ES2022 private class fields with nullish assignment:

```typescript
class Foo {
    static #instance: Foo | null = null

    // Static public API — no getInstance() at call sites
    static doThing(): void {
        ;(Foo.#instance ??= new Foo()).doThingImpl()
    }
    static dispose(): void {
        Foo.#instance?.disposeImpl()
        Foo.#instance = null
    }

    private doThingImpl(): void { ... }
    private disposeImpl(): void { ... }
}
```

**Reference implementation**: `client/src/utils/MeshPrewarmer.ts` (merged Apr 2026)  
**Note on dispose()**: Before applying to classes with complex teardown (event unregistration, GPU cleanup, etc.), review what the existing `dispose()` does. Some singletons have disposal logic that shouldn't be hidden behind a static method without careful thought.

**Next candidates** (easiest first): `TextureLoader`, `StartupEventTracker`, `LightRegistry`, then `SharedMaterialManager`, then eventually `DataManager`.

**Files tagged** (search for `singleton-pattern-refactor` in file header comments):
- `client/src/utils/SharedMaterialManager.ts`
- `client/src/scene/game-box/instancing/GameArtworkProvider.ts`

---

## id: raf-loop-migration
**Priority**: Low  
**Effort**: 1-2 hours per class  
**Status**: Ready to act on opportunistically (one class at a time)  
**Context**: `GameSpotlight` and `PerformanceMonitorUI` run independent `requestAnimationFrame` loops. These should register with `RenderLoopRegistry` to benefit from centralized frame scheduling, diagnostics, and `FrameBudgetScheduler` integration.  

**Do not migrate**: one-shot rAF uses in `LightingControlsPanel` and `GameLibraryBinderUI` — those are correct as independent calls.

**Files tagged with `// TD: raf-loop-migration`**:
- `client/src/debug/GameSpotlight.ts`
- `client/src/ui/PerformanceMonitor.ts` (UI overlay)

---

## id: legacy-atlas-removal
**Priority**: High  
**Effort**: 1 day  
**Context**: `InstancedArtworkRenderer` and `MultiAtlasArtworkRenderer` are dead code paths (LOD atlas is stable in production). See `docs/archive/hot-path-refactoring-plan.md` Pass 1 for full step-by-step. Also remove `Setting.UseMultiAtlas` / `Setting.UseLodAtlas` from `AppSettings`.  

**Files tagged with `// TD: legacy-atlas-removal`**:
- `client/src/scene/game-box/GpuGameBoxRenderer.ts`
- `client/src/scene/game-box/instancing/InstancedArtworkRenderer.ts`
- `client/src/scene/game-box/LegacyAtlasGameBoxRenderer.ts`
- `client/src/core/AppSettings.ts`

---


---

## Intake Queue (2026-04-05 additions)

### Memory budget monitoring
**Priority**: High (as soon as we have cycles)
**Context**: No current way to compare estimated VRAM/RAM usage (GpuMemoryEstimator) against actual measured usage. Need Playwright to report actual memory usage figures and a watch target we periodically check.
**Next steps**:
- Wire GpuMemoryEstimator output into the Debug UI tab (already noted elsewhere, but cross-ref here)
- Add Playwright page.metrics() or performance.memory reporting to the visual test suite
- Set soft budget watch targets (e.g. JS heap < 500MB) that emit warnings in CI/visual test output

### Frame time monitoring
**Priority**: High (as soon as we have cycles)
**Context**: Frame time (ms) should be tracked as a routine health metric alongside tests.
**Next steps**:
- Collect rAF delta averages during Playwright startup test
- Write to test-results/perf-report.json alongside console-report.json
- Set soft watch target (e.g. avg < 16ms at startup settle time)

### Linter baseline pass + CI integration
**Priority**: High (end of Phase 1 / Phase 2 prep)
**Context**: Linter is currently not a routine check. Before Phase 2, we want a clean lint baseline and automated enforcement.
**Next steps**:
- Run `yarn lint` (or `npx eslint src`), triage all current errors/warnings
- Suppress or fix anything not worth fixing now (with explicit comments)
- Once baseline is clean, add lint step to the same run as unit tests
- Enforce: lint must be clean for PR merge going forward

### UI: Compare SignageRenderer DataTexture approach with InstancedLabelRenderer
**Priority**: Low
**Context**: Signs now use DataTexture pixel snapshots. InstancedLabelRenderer uses a texture array approach. Worth reviewing if one can serve both, or if the approaches should stay separate for different use cases (sign = large static label, game box = dense small label). Revisit during UI normalization or when sign rendering needs improving.
**Source**: Apr 2026



---

## Category System Tech Debt (from PR #38 review, Apr 2026)

### Generic sort-by-field utility
**Priority**: Medium (next categories refactor)
**Context**: sortByGenreThenPlaytime in CategoryAssigner.ts is a one-off comparator. The right abstraction is a generic sortByFields(['genre', 'playtime']) function that takes field names as parameters. TypeScript's mapped types make this achievable without losing type safety. The current function has a TD comment.
**Next steps**:
- Design a sortByFields<T>(fields: (keyof T)[]) utility in src/utils/
- Replace sortByGenreThenPlaytime with a call to it
- Move sort policy out of CategoryAssigner (see "Sort policy in SteamApiClient" below)

### Sort policy belongs off SteamApiClient
**Priority**: Medium
**Context**: SteamApiClient.loadGamesProgressively accepts a sortFn param (currently used for sortByGenreThenPlaytime). This works as a pass-through, but the sort policy � what field order we care about � doesn't belong in the data-fetching layer. It's a presentation concern.
**Next steps**:
- Move sort application upstream: caller assembles sort policy, passes pre-sorted games to the pipeline
- Or: introduce a GameSortPipeline that wraps the fetch and handles transform
- Discuss when designing the "groups ? shelves conversation" layout system

### CategorySignSystem ? SceneSignManager rename
**Priority**: Low (next sign-related work)
**Context**: CategorySignSystem is named too narrowly � it handles sign placement in a scene, not just category signs. When ceiling signs (recently-played) are added it'll look wrong.
**Candidate name**: SceneSignManager
**Next steps**: Rename file + class when we add the second sign type; no need to do it in isolation

### CategoryAssigner is a temporary classification hack
**Priority**: Medium (before user-tag pipeline)
**Context**: The current genre-lookup approach is known-imperfect. It was introduced as a stand-in while we pursue Steam user tags (from SteamSpy API) as a better category source. Once tags are available, CategoryAssigner will likely be replaced or heavily refactored.
**Note**: Don't over-invest in refining the genre-lookup logic; invest in the tag pipeline instead.

### CategorySignSystem: scene access pattern / SceneManager
**Priority**: Medium (architecture cleanup)
**Context**: CategorySignSystem takes scene as a constructor param. The desired pattern is to get scene from a DataManager / SceneManager static accessor, so there's one access pattern for the scene across all code.
**Proposed**: Add a SceneManager with a static get(index: SceneIndex): THREE.Scene that pulls from the DataManager. Register scenes with an index enum on creation.
**Next steps**: Design SceneManager interface; migrate CategorySignSystem and other direct-scene-param classes

### SignageRenderer: singleton vs instance
**Priority**: Low
**Context**: SignageRenderer is currently instantiated per-use. If it holds no instance state (all methods are pure given inputs), it could be a module with exported functions, or a singleton. Evaluate when touching sign rendering.

### Readonly event payloads
**Priority**: Low/Medium
**Context**: Events should emit eadonly everything to prevent accidental mutation of shared event data. Currently not enforced. Worth a lint rule or type-level enforcement.
**Next steps**: Add Readonly<T> wrapping to all emitted event payloads in InteractionEvents.ts; consider a custom ESLint rule

---

## PR #39 Review Feedback (Apr 7 2026)

### suppressEmit flag (GpuStorePropsRenderer)
**Priority**: High (reviewer explicitly disliked)
**Location**: client/src/scene/GpuStorePropsRenderer.ts - calculateShelfBoundsAndLayout
**Issue**: suppressEmit = false param was added to prevent repeated ShelfLayoutDetermined events
during overflow expansion. Reviewer considers this a code smell.
**Fix direction**: Emit ShelfLayoutDetermined only once from a single dedicated call site
(e.g., after preallocateArcLayout completes on initial setup only). Remove the flag entirely.

### GpuStorePropsRenderer file length
**Priority**: Medium
**Location**: client/src/scene/GpuStorePropsRenderer.ts
**Issue**: File is too long; layout-related functionality should be extracted to its own class.
**Fix direction**: Extract arc layout, shelf position management, and bounds calculation to
a ShelfLayoutManager or similar. GpuStorePropsRenderer should only handle GPU/rendering concerns.

### WorkerErrorUtils -> ManagedWorker
**Priority**: Low (cleanup)
**Location**: client/src/utils/WorkerErrorUtils.ts
**Issue**: Now that ManagedWorker exists and owns error handling, WorkerErrorUtils exports
are redundant. extractWorkerErrorMessage and makeWorkerErrorHandler should move into
ManagedWorker.ts and be used only internally.
**Fix direction**: Migrate exports, update 3 worker managers to extend ManagedWorker, delete WorkerErrorUtils.ts.

### TD comment ID convention
**Priority**: Low (developer experience)
**Issue**: // TD comments are hard to search/track without a consistent tag.
**Fix direction**: Adopt // TD [tag-id]: description format e.g. // TD [layout-policy]: ....
Apply to new TD comments going forward; backfill existing ones during lint pass.

### CSS token file naming convention
**Priority**: Low
**Issue**: ui-design-tokens.css is too generic; split into purposeful token files (e.g. 	okens-colors.css, 	okens-spacing.css) and component token maps (	okens-panel.css, 	okens-button.css).
**Source**: PR #40 review comment on main.css line 2.
