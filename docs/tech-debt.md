# Tech Debt Backlog

> **Bugs belong in `bugs.md`. This file tracks architectural and code-quality debt that requires deliberate work to resolve.**
> Ongoing code conventions (JSDoc hygiene, file size, naming) live in `docs/guidelines/code-conventions.md` — not here.
>
> **Tech Debt Tags**: Source files are annotated with `// TD: <tag-id>` at the file top to link them to entries here.
> Each tagged entry uses `## id: <tag-id>` as its header for easy lookup.
> See `docs/README.md` for the full tagging convention.

---

*New items requiring triage and prioritization*

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

## Fix Now (Intermission)

### Possible memory leak in high LOD textures
User suspects there could be a memory leak
Are we releasing high LOD textures when we're done with them? Or are those staying in memory?
Seems worth checking, and maybe we could check other likely culprits while we're of a mind for it.

### Performance: Offload carpet texture generation to worker (`carpet-worker-offload`)
**Priority**: Medium  
**Effort**: 2-3 hours  
**Context**: `prewarmCarpet` in `SharedMaterialManager` calls `ProceduralCarpetPatternGenerator.createCarpetMaterial()` synchronously on the main thread. All other procedural textures run through `ProceduralTextureWorker`. Add a `carpet_enhanced` texture type to the worker pipeline and migrate this call.  
**Source**: Apr 2026  
**Tag**: `// TD: carpet-worker-offload` in `SharedMaterialManager.ts`

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

### Performance

#### Profile and Fix InstancedShelfRenderer Initialization (~3s)
**Effort**: 2-4 hours
**Context**: `InstancedShelfRenderer.initialize()` takes ~3 seconds. Unclear if the bottleneck is geometry creation, material setup, or GPU upload. Need profiling before fixing.

**Tasks**:
- Add detailed timing inside `initialize()` for each step
- Identify bottleneck
- Implement fix: geometry caching in IndexedDB (if geometry), SharedMaterialManager reuse (if material), deferred upload (if GPU)

**Source**: Dec 2025 — Startup optimization analysis

#### Background-Tab Low-Resource Startup Mode
**Effort**: 6-10 hours
**Context**: When client starts without window focus, it should defer heavy init and reduce animation rate (e.g., 10fps vs 90fps), resuming fully on focus.

**Implementation path**: `document.hasFocus()` + Page Visibility API; chunked loading via `requestIdleCallback`; reduce concurrent texture processing.

**Source**: Nov 2025 — User request

### UI

#### Fix Pause Menu Double Scrollbars
**Effort**: 1-2 hours
**Context**: Two scrollbars appear in pause menu when viewport is reduced (notably on cache page). CSS overflow context conflict.

#### Standardize Cache Management UI Styling
**Effort**: 1-2 hours
**Context**: Cache scrolling view buttons/inputs inconsistent with main UI styling.

### Testing

#### Review and Reclassify Performance Tests
**Effort**: 2-3 hours
**Context**: Some unit tests have timing/performance measurements and should be in `.perf.test.ts` files with proper benchmarking thresholds.

---

## Low Priority
*Nice to have — minimal impact on core functionality*

#### Remove Dead Event Code from SteamWorkflowManager
**Effort**: 1-2 hours
**Context**: Unused event handlers for image cache stats. Remove listeners and related event definitions.

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

### TD comment ID convention
**Priority**: Low (developer experience)
**Issue**: // TD comments are hard to search/track without a consistent tag.
**Fix direction**: Adopt // TD [tag-id]: description format e.g. // TD [layout-policy]: ....
Apply to new TD comments going forward; backfill existing ones during lint pass.

### CSS token file naming convention
**Priority**: Low
**Issue**: ui-design-tokens.css is too generic; split into purposeful token files (e.g. 	okens-colors.css, 	okens-spacing.css) and component token maps (	okens-panel.css, 	okens-button.css).
**Source**: PR #40 review comment on main.css line 2.

### Testing: Suite-cost simplification pass
**Priority**: High
**Effort**: M
**Context**: Test suite has grown quickly. Need a structured pass to reduce runtime/setup cost (consolidate overlap, keep coverage, prefer cheap deterministic tests first).
**Tasks**: inventory top 20 slow tests, identify overlap, replace expensive setup where equivalent unit/integration assertions exist, preserve regression value.
**Source**: Apr 2026 branch review

### Artwork: header image fallback when library image is missing
**Priority:** High (soon)
**Context:** Some games have a header image in Steam metadata but no library_600x900.jpg.
  The game binder shows a header image, but the 3D box tries library first, gets a 404/CORS block,
  and falls back to a label box instead of trying the header image.
  `GpuGameBoxRenderer.selectBestArtworkUrl` already tries `game.artwork.header` as a fallback
  (line ~206), but GameArtworkRequest's URL strategy only retries within the same format.
  Fix: when a library format fails permanently, trigger a retry with the header format URL.
**Source:** User report 2026-04-09

### Test suite: SIGKILL on full run (memory pressure)
**Priority:** High
**Context:** yarn test:all and yarn test are getting killed by OOM on this machine.
Likely causes: jsdom worker count, large mock objects not being cleaned up, or Vitest worker pool size.
Mitigation already in place: maxWorkers:4, minWorkers:1.
Next step: identify which test file/suite is the memory culprit (run suites individually, watch RSS).
**Source:** Repeated SIGKILL in session 2026-04-07

### Project conventions doc
**Priority:** Medium
**Context:** Logger, EventManager, DataManager usage patterns aren't documented for contributors or AI agents.
  Without a conventions doc, each PR review has to re-teach the same patterns (Logger over console.log,
  event ownership, DataManager key/domain conventions, etc.).
  Create docs/technical/conventions.md covering at minimum:
  - Logger.createLogFunctions() usage and log levels
  - EventManager: registerEventHandler vs registerDefaultHandler footgun
  - DataManager: key/domain discipline, who owns each DataKey
  - ShelfSide naming counterintuitiveness (Front=far, Back=near)
**Source:** PR #44 review comment 2026-04-09

### GpuMemoryEstimator: bridge to DataManager memory registry
**Priority:** Low-Medium
**Context:** GpuMemoryEstimator.ts has documented gaps � it cannot see LOD texture arrays.
  LodTextureArrayManager and LabelTextureArrayManager already register to DataManager via
  addMemoryConsumption(). LodArtworkOrchestratorDebug.logMemoryStats() already reads that registry.
  GpuMemoryEstimator should also query DataManager.getMemoryConsumption() to include those
  registrations in its estimate, giving a unified picture in the Playwright memory snapshot test.
**Source:** Cleanup branch review 2026-04-09

## Act 2

### Re-sort does not reorder game boxes or shelves
**Priority**: High (feature gap — sort UI exists but games don't move)  
**Effort**: 1-2 days  
**Context**: `GamesSort` is only consumed by `ShelfSectionPlanner` (for signs). `GameBoxSpawner` and `ShelfLayoutCoordinator` both listen to initial-load events (`BatchReadyForPlacement`, `AllBatchesComplete`) only — neither reacts to `GamesSort`. So changing sort mode moves signs but leaves game boxes and shelves exactly where they were placed on first load.  
**Documented approach**: `docs/plans/texture-placement-split-plan.md` — split texture loading from instance placement so that `GamesSort` can drive a position reassignment pass without re-fetching artwork. Key change: `GpuGameBoxRenderer.placeInstance()` called on `GamesSort` with new sorted positions, shelf layout re-runs from the new game order.  
**Files**: `GameBoxSpawner.ts`, `GpuGameBoxRenderer.ts`, `ShelfLayoutCoordinator.ts`, `GpuStorePropsRenderer.ts`

**Priority**: Medium  
**Effort**: 3-5 hours  
**Context**: `ShelfSectionPlanner` previously called `signSystem.clearAll()` inside `planSections()`, which silently nuked signs owned by other subsystems (bucket signs, ceiling sign, block letter). Fixed by splitting into per-type tracked sets (`placedSectionIdentifiers`, `placedBucketIdentifiers`) with `removeSectionSigns()` / `removeBucketSigns()`. This works but requires each coordinator to know what others own — fragile as sign types proliferate.  
**Better long-term**: Sign ownership should be explicit and declarative. Options: (a) each coordinator holds a "sign group" token and clearAll scoped to that token, (b) `SceneSignManager` tracks ownership by registrant and provides `clearGroup(owner)`, (c) layout-driven sign placement where a single coordinator owns the full sign lifecycle per layout pass.  
**Deferred because**: (a) and (b) require `SceneSignManager` interface changes; (c) requires layout coordinator refactor. Neither fits the current scope.  
**Files**: `ShelfSectionPlanner.ts`, `SceneSignManager.ts`

### Input Architecture: Review `WebXRCoordinator` scope/naming vs actual responsibilities
**Priority**: High  
**Effort**: 2-4 hours (audit + proposal)
**Context**: `WebXRCoordinator` appears to own a wider input/control surface than XR session concerns alone. We should review whether responsibilities belong in a broader input coordinator (or `InputManager`) and keep XR-specific responsibilities explicitly scoped.
**Why now**: upcoming input-layer cleanup and Phase 2 planning; avoid cementing misleading ownership boundaries.
**Source**: Apr 2026 review follow-up

### Architecture: Split `GameSorter` event wiring from sort policy utilities
**Priority**: Low  
**Effort**: 1-2 hours  
**Context**: `GameSorter` currently owns both event subscription/emission and recency sort orchestration. Longer-term shape should keep `GameSorter` as coordinator glue (event in/event out) while all pure policy logic (bucket derivation, sorting strategy composition, map construction) lives in reusable utility modules (`GameSortFunctions` + focused helpers). This keeps scene layout classes calling pure sort utilities directly where appropriate and preserves testability.
**Source**: Apr 2026 — PR #47 review follow-up

### Events: Make UI Emissions Use a `UIEvent` Base Type
**Priority**: Medium  
**Effort**: 2-3 hours  
**Context**: UI components emit events ad-hoc. They should all emit a `UIEvent` type with a sub-identifier, so UI events are distinguishable from game/system events in the event log.

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

#### Gamesort continuation follow-ups (track soon)
**Priority**: High  
**Effort**: 1-2 days total  
**Context**: Event-driven pipeline carve is mostly complete; these are intentionally deferred cleanup items to close in the next near-term pass.

**Backlog (soon):**
1. **Keep `ShelfSide` cleanup deferred** — not a current priority; revisit only after current event-pipeline stabilization.
2. **Decide end-cap sign sidedness** — evaluate `THREE.DoubleSide` vs single-sided for readability/backface behavior.
3. **Startup UI tracker vertical stacking** — support concurrent operations without overlap.
4. **Verify ceiling lights with new layout flow** — ensure event-driven shelf layout updates don't regress lighting alignment/coverage.
5. **Sticker coordinator carve-out** — migrate `ShelfStickerHandler` toward event-driven `StickerCoordinator` ownership model.

**Note**: The old `gpustoreprops-event-untangling.md` plan was retired as stale after the coordinator carve work landed.

---

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

#### Implement Missing Integration Test Coverage
**Effort**: 6-8 hours
**Context**: Identified gaps: Steam API/Integration boundary tests, texture loading integration tests, scene rendering tests without WebGL dependency, progressive loading integration tests.

#### User Settings for Texture Quality and LOD Mode
**Effort**: 4-6 hours
**Context**: Expose LOD mode (Dynamic/Always HIGH/Always MID) and HIGH texture slot count to users via the existing `GameSettingsPanel`. Store in `AppSettings`.

**Note**: Graphics settings panel HTML has disabled controls waiting for texture cache refactor (see `texture-cache-refactor-plan.md`). This work may depend on that.

**Source**: Dec 2025 — Pixel cache implementation discussion

#### Graphics Settings Scene Reload (vs Page Reload)
**Effort**: 3-4 hours
**Context**: Graphics settings currently require full page reload. Scene reload infrastructure exists; wire it to settings changes with an "Apply" button.

### Debug: Migrate GameSpotlight light lifecycle to LightingRenderer
**Priority**: Medium (next spotlight-related work)
**Context**: `GameSpotlight` currently owns spotlight pool creation, scene addition, dimming/restoring store lights (via `LightRegistry`), and light disposal. This should belong to `LightingRenderer`.

**Proposed split:**
- `LightingRenderer` owns: spotlight pool (pre-warmed at startup with `intensity=0`), `acquireSpotlight()` / `releaseSpotlight()`, `dimStoreLights(factor)` / `restoreStoreLights()`
- `GameSpotlight` becomes: thin coordinator — calls `LightingRenderer` to claim/release spotlights, aims them at game positions, runs intensity animation, exposes `window.spotlightGame` API. No Three.js light construction, no `LightRegistry` reads, no scene adds.

**Why deferred**: Needs design thought on the `LightingRenderer` API shape before implementation.
**Source**: PR #42 review + 2026-04-08 discussion

**Priority**: Low  
**Effort**: 1-2 hours per class  
**Status**: Ready to act on opportunistically (one class at a time)  
**Context**: `GameSpotlight` and `PerformanceMonitorUI` run independent `requestAnimationFrame` loops. These should register with `RenderLoopRegistry` to benefit from centralized frame scheduling, diagnostics, and `FrameBudgetScheduler` integration.  

**Do not migrate**: one-shot rAF uses in `LightingControlsPanel` and `GameLibraryBinderUI` — those are correct as independent calls.

**Files tagged with `// TD: raf-loop-migration`**:
- `client/src/debug/GameSpotlight.ts`
- `client/src/ui/PerformanceMonitor.ts` (UI overlay)

---

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

### Signs: Move placeTimeBucketSigns out of GpuStorePropsRenderer
**Priority**: Medium
**Effort**: S
**Context**: placeTimeBucketSigns() is layout+signage logic jammed into a renderer. SceneSignManager is the right home. Needs shelf position/rotation data as inputs, likely via an event or explicit call from the coordinator layer after layout is determined.
**Source**: PR #40 r3048445863

### Architecture: GameSorter ? event-driven shelf/sign commissioning
**Priority:** High (before Phase 2)
**Context:** Current shape has GpuStorePropsRenderer deciding sign placement after batch load.
Intended shape:
  1. Games finish batching ? GameSorter executes scene-load sort (recently-played default for cached user; alphabetical for anon)
  2. GamesSort event emitted with sort order + category groupings
  3. Shelf commissioner listens ? assigns games to shelves, each shelf gets a category/sign descriptor or nothing
  4. SceneSignManager listens to GamesSort ? updates ceiling sign to match active sort
This removes all sign/sort logic from GpuStorePropsRenderer.
**Source:** PR #40 r3048445863 follow-up discussion

### Debug/diagnostic layer architecture
**Priority:** Medium
**Context:** Three ...Debug subclasses (LodArtworkOrchestratorDebug, LodDistanceManagerDebug,
  HighTextureCacheDebug) mix two concerns: production-useful behavior (memory logging at
  AllBatchesComplete, SomeBatchesComplete LOD sync) and devtools console commands (window.*).
  This caused them to be deleted as "debug-only" during cleanup, removing needed diagnostics.
  
  Desired end state:
  - Production-relevant behavior (AllBatchesComplete handler) moves INTO
    the base classes (LodArtworkOrchestrator, LodDistanceManager)
  - Console command registration (logMemoryStats, window.lodDistribution, window.diagnoseArtworkFailures, etc.)
    lives in a single DevTools bootstrapper that is optionally enabled in dev mode
  
  For now: Debug subclasses are restored and GpuGameBoxRenderer always uses them (always-on dev
  tooling). This is fine; the window.* commands only fire on demand.
**Source:** Cleanup branch review 2026-04-09

### Architecture: DataManager memory concerns split-out review
**Priority:** Medium
**Effort:** 2-4 hours (design + impact review)
**Context:** DataManager currently owns both general key/value domain state and memory accounting concerns (e.g., `addMemoryConsumption`, `getMemoryConsumption`). Before upcoming changes, review whether memory tracking should be separated into a dedicated class (e.g., `MemoryRegistry`/`MemoryManager`) or implemented as a DataManager extension/composition layer.

**Goals:**
- Clarify ownership boundaries between app state registry vs diagnostics/memory accounting
- Reduce coupling for future DataManager refactors
- Decide preferred design direction: inheritance (`extends DataManager`) vs composition (separate service used by DataManager consumers)

**Design constraints to review:**
- Preserve existing read/write call sites for non-memory DataManager usage
- Keep memory instrumentation discoverable for debug tools and tests
- Avoid introducing parallel competing state registries

**Suggested outputs:**
- Short design note (recommended shape + migration strategy)
- Optional spike branch proving one vertical slice

**Source:** User request 2026-04-09
---

## id: sticker-coordinator

**StickerCoordinator � event-driven sticker architecture**

**Status**: Planned (next pass on stickers or InstancedShelfRenderer carve)

**Context**: ShelfStickerHandler currently receives sideboard mesh managers via setManagers() and subscribes to shelf-index toggle events internally. This couples sticker lifecycle to InstancedShelfRenderer's internals.

**Goal**: Introduce a StickerCoordinator that:
- Subscribes to a new StickerSurfaceReady event emitted by InstancedShelfRenderer when a sideboard instance is stamped. Payload: { meshManager, boardIndex, tileId, shelfId, isLeft }.
- Receives layout/sort context via GamesSort to vary sticker selection by shelf type (genre, recency bucket, etc.)
- Owns StickerManager and ShelfStickerIntegration (currently held by ShelfStickerHandler)
- Handles EnableShelfIndices/DisableShelfIndices directly (currently wired inside ShelfStickerHandler)
- ShelfStickerHandler dissolves into StickerCoordinator once surfaces arrive via event rather than via setManagers()

**Mirrors**: The sign coordinator pattern (SceneSignManager reacting to ShelfReady/GamesSort).

**Source**: April 2026 � discussed during InstancedShelfRenderer analysis

## Later

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

#### Development-Mode Instance Lifecycle Watchdog
**Effort**: 4-6 hours
**Context**: Multiple instances of singleton-intended classes cause subtle bugs (e.g., shader uniforms stored in wrong instance). Discovered when 3 `ShelfStickerIntegration` instances were created.

**Tasks**: `InstanceTracker` utility (dev builds only), warn with stack trace on duplicate instantiation of registered classes.

**Source**: Nov 2025 — Sticker data texture debugging

#### Three.js Scene Resource Leak Detector
**Effort**: 6-8 hours
**Context**: Need dev-mode tooling to detect unused meshes, geometries, materials, textures. Needs whitelist support (skybox, LOD meshes, pooled resources).

**Source**: Nov 2025 — Performance optimization

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

#### Hardware Renderer Heuristic — Real-World Telemetry
**Effort**: 2-4 hours initial
**Context**: `SystemCapabilitiesDetector` treats renderer strings not containing `software` as hardware, including `unknown`. May misclassify edge devices.

**Tasks**: Record capability snapshots from real sessions; review `unknown` renderer anomalies; decide whether to treat `unknown` as low-confidence; update capability tests.

**Source**: Mar 2026 — Batch/event review follow-up

### Features

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

### UI: Compare SignageRenderer DataTexture approach with InstancedLabelRenderer
**Priority**: Low
**Context**: Signs now use DataTexture pixel snapshots. InstancedLabelRenderer uses a texture array approach. Worth reviewing if one can serve both, or if the approaches should stay separate for different use cases (sign = large static label, game box = dense small label). Revisit during UI normalization or when sign rendering needs improving.
**Source**: Apr 2026

---

## Category System Tech Debt (from PR #38 review, Apr 2026)

### SignageRenderer: singleton vs instance
**Priority**: Low
**Context**: SignageRenderer is currently instantiated per-use. If it holds no instance state (all methods are pure given inputs), it could be a module with exported functions, or a singleton. Evaluate when touching sign rendering.

### Readonly event payloads
**Priority**: Low/Medium
**Context**: Events should emit 
eadonly everything to prevent accidental mutation of shared event data. Currently not enforced. Worth a lint rule or type-level enforcement.
**Next steps**: Add Readonly<T> wrapping to all emitted event payloads in InteractionEvents.ts; consider a custom ESLint rule

---

## PR #39 Review Feedback (Apr 7 2026)

### PixelDataCache stats instrumentation model
**Priority**: Medium
**Effort**: S
**Context**: Current per-call counters (hits/misses/stores/errors) may be heavier than needed. Review lower-instrumentation alternatives (sampling, debug-only counters, worker-native stats only) and keep only data that is actually consumed.
**Source**: PR #40 follow-up

### Workers: Support Transferables in ManagedWorker
**Priority**: Low
**Effort**: XS
**Context**: ManagedWorker.send() does not currently support passing a transfer array. If we ever need to pass large buffers TO the worker without copying, ManagedWorker needs a signature update (e.g. send<T>(msg, transfer?: Transferable[])).
**Source**: Apr 2026 class review

### Artwork: 404 from Steam CDN is obscured as CORS error
**Priority:** Informational (mitigated)
**Context:** When cdn.akamai.steamstatic.com returns a 404, the 404 response lacks CORS headers,
  so the browser blocks the response entirely and throws a generic NetworkError — hiding the 404.
  Firefox DevTools shows the 404 status, but JS cannot read it.
  Mitigation (2026-04-09): categorizeError now matches Firefox's exact CORS error string
  ("NetworkError when attempting to fetch resource") and marks it as CORS -> permanent.
  All 404s are also now marked permanent immediately (not after 2 attempts).
  Long-term: the Lambda proxy could track 404s server-side so all clients benefit.
  **Open question:** Transitory 404s - a game's CDN image could be temporarily unavailable
  (CDN hiccup, new release where image propagates slowly). Permanent-forever may be too
  aggressive; consider "permanent until TTL" (e.g. 7 days) for 404 specifically vs.
  true-permanent for CORS (CORS policy changes rarely). Review when header fallback lands.
**Source:** User report 2026-04-09

**Priority:** Medium
**Context:** Current memory-snapshot.spec.ts reads window.performance.memory (JS heap only, non-standard).
Intended model:
  1. Navigate to about:blank, capture CDP JSHeapUsedSize + process RSS as baseline (tare)
  2. Navigate to app, wait for scene ready, capture again
  3. Report: net JS heap (app - tare), net process RSS, GPU estimate from GpuMemoryEstimator
  This matches what Chrome Task Manager shows per-tab vs browser overhead.
  Use page.metrics() for per-tab JS heap; browser.process().memoryUsage() for process tare.
  SwiftShader targets should be noted separately from hardware targets.
**Source:** Discussion 2026-04-07

## Dropped / Resolved

### WorkerErrorUtils -> ManagedWorker
**Priority**: Low (cleanup)
**Location**: client/src/utils/WorkerErrorUtils.ts
**Issue**: Now that ManagedWorker exists and owns error handling, WorkerErrorUtils exports
are redundant. extractWorkerErrorMessage and makeWorkerErrorHandler should move into
ManagedWorker.ts and be used only internally.
**Fix direction**: Migrate exports, update 3 worker managers to extend ManagedWorker, delete WorkerErrorUtils.ts.

