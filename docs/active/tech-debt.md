# Tech Debt Backlog

## Intake Queue
*New items requiring triage and prioritization*

### Architecture: Unified Popup/Panel Menu System
**Priority**: Medium  
**Effort**: 8-12 hours  
**Context**: Multiple popup-like UI elements (LOD controls, lighting panel, binder, etc.) each have their own toggle mechanisms (on-screen buttons, keyboard shortcuts). They lack coordination and can overlap each other.

**Requirements**:
- Generic system for declaring and managing popup panels
- Multiple activation methods per panel (button, keyboard, VR controller)
- Dynamic screen-space arrangement to prevent overlap
- Panels should arrange themselves around available screen space
- Consider z-ordering and focus management

**Current Examples**:
- `LodControlsPanel` - LOD switching UI
- Lighting controls (if exists)
- Debug panels
- Future: Game info popups, settings, etc.

**Proposed Pattern**:
- `PopupRegistry` or `PanelManager` singleton
- Panels register with metadata (preferred position, size, trigger keys)
- Manager handles positioning, prevents overlap, manages visibility
- Trigger system maps inputs to panel toggles

**Source**: Dec 2025 - LOD controls panel implementation revealed need for unified approach

---

### Code Quality: Review InteractionEvents for Unnecessary Properties
**Priority**: Low  
**Effort**: 1-2 hours  
**Context**: Many event interfaces in `InteractionEvents.ts` may have properties that are passed through but never consumed by handlers. Examples: `timestamp` and `source` default in `BaseInteractionEvent`, so explicit passing is redundant.

**Tasks**:
- Audit each event interface in `InteractionEvents.ts`
- For each property, grep to see if it's actually read by any handler
- Remove properties that are only passed but never consumed (YAGNI)
- Consider if some events even need their own interface type

**Example**: `SteamGamesBatchEvent` originally had `isLastBatch` and `isSupplementalBatch` that were passed but never read.

**Source**: Dec 2025 - Cache-first loading refactor revealed unused event properties

---

### Architecture: Event-Driven Room Resizing
**Priority**: Medium  
**Effort**: 4-6 hours  
**Context**: Currently RoomManager creates walls synchronously (~1.5s) which blocks startup. Room sizing is coupled to knowing the game count upfront.

**Proposed Pattern**:
- Room spawns with default/minimum size
- Room listens for game count events
- Room resizes dynamically when needed (or when all games are known)
- Separation of concerns: create assets first, position/resize later

**Benefits**:
- Faster initial load (walls created asynchronously)  
- Room can start rendering before game count is known
- Cleaner separation between asset creation and layout

**Source**: Dec 2025 - Startup optimization discussion

---

### Performance: Framerate-Based Deferral System
**Priority**: Medium  
**Effort**: 6-8 hours  
**Context**: Heavy operations (geometry creation, texture loading) can cause frame drops. Rather than fixed timeouts/batching, defer work based on actual frame budget.

**Proposed Pattern**:
- Maintain minimum target framerate (e.g., 60fps for VR, 30fps for desktop)
- Measure frame time each frame
- When frame budget allows (< 16ms spent), process deferred work
- When frame time exceeds budget, pause deferred queue until headroom returns

**Benefits**:
- Adapts to actual hardware capability
- Smooth user experience even during heavy loading
- Works well with VR comfort requirements

**Implementation Ideas**:
- `DeferralManager` singleton with work queue
- `requestAnimationFrame` loop checks frame timing
- Prioritized queue: critical > normal > low priority

**Source**: Dec 2025 - Startup optimization discussion

---

### Performance: Profile InstancedShelfRenderer.initialize()
**Priority**: High  
**Effort**: 2-4 hours  
**Context**: `InstancedShelfRenderer.initialize()` takes ~3 seconds. Need to identify the actual bottleneck.

**Tasks**:
- Add detailed timing inside `initialize()`:
  - Time geometry creation (createGeometryTemplates)
  - Time material setup
  - Time InstancedMesh creation
  - Time GPU upload (if applicable)
- Identify which step is slow
- Implement appropriate fix based on findings

**Potential Fixes**:
- If geometry: Cache serialized BufferGeometry in IndexedDB
- If material: Ensure SharedMaterialManager reuse
- If GPU: Consider deferred upload or WebGL warm-up

**Source**: Dec 2025 - Startup optimization analysis shows 3s delay

---

### Performance: Main Thread Activity Tracker for Startup UI
**Priority**: Low (nice-to-have)  
**Effort**: 4-6 hours  
**Context**: During startup and game loading, users see a progress bar but no indication of what's actually happening. A "main thread activity tracker" could show which class/method is currently executing (e.g., `SteamIntegration.loadGamesFromCache()`).

**Initial Attempt (Nov 2025)**: 
- Created `MainThreadActivityTracker` singleton with `enter(className, methodName)` / exit pattern
- Added tracking calls to key methods (GpuStorePropsEventHandler, SteamIntegration, GpuStorePropsRenderer, RoomManager)
- Connected to `StartupProgressUI` with activity text display
- Issues encountered:
  - Event timing problems - `DataLoaded` event triggers `transitionToGameLoading()`, but `complete()` immediately hides activity
  - Async event registration race conditions
  - Manual instrumentation is tedious and error-prone

**Better Approach Ideas**:
- Use decorators instead of manual enter/exit calls
- Consider browser Performance API (`performance.mark/measure`) instead of custom tracking
- Possibly use Web Workers for heavy loading to keep main thread responsive
- Consider simpler approach: just show current "phase" name without method-level detail

**Tasks** (if revisited):
- Research decorator-based approach for cleaner instrumentation
- Fix event timing issues between startup phases and game loading mode
- Add `isGameLoadingMode` flag to prevent `complete()` from hiding activity during game loading
- Consider whether method-level granularity is worth the complexity

**Deferred**: Implementation abandoned due to timing complexity. Current progress bar is sufficient for MVP.

---

### Performance: Scene Traversal Optimization Audit
**Priority**: High  
**Effort**: 4-6 hours  
**Context**: Multiple systems traverse the entire scene graph on every operation (e.g., `scene.traverse()` calls). This becomes expensive with hundreds of game boxes. Need systematic audit and caching strategy.

**Tasks**:
- Audit all `scene.traverse()` calls across codebase
- Identify which traversals happen on hot paths (every frame, every toggle, etc.)
- Implement caching for static/semi-static scene queries:
  - Light collections (RectAreaLights, DirectionalLights, etc.)
  - Game box collections
  - Prop/fixture collections
- Add cache invalidation hooks when scene structure changes
- Pattern: Traverse once on scene ready, cache results, invalidate on add/remove
- Document pattern for future scene queries

**Current Known Issues**:
- ✅ **FIXED**: DiagnosticSpotlight cached RectAreaLights (was traversing on every toggle)
- ✅ **FIXED**: LightingControlsPanel deferred checkbox updates (was rebuilding DOM on every toggle)
- **TODO**: Audit remaining traverse calls in renderers, managers, coordinators

**Performance Impact**:
- Typical scene: 500-1000 objects (game boxes, shelves, props)
- Uncached traverse: O(n) every call
- Cached: O(1) lookup after initial O(n) build

**Benefits**: Faster light toggles, faster game spotlighting, faster UI updates, reduced GC pressure

**Source**: Nov 2025 - Observed multi-second freeze on light toggle with large game library

---

### Performance: Deferred Update Pattern for Rapid Operations
**Priority**: Medium  
**Effort**: 2-4 hours  
**Context**: Some operations get called repeatedly in rapid succession (e.g., toggling multiple lights, batch game box updates). Need pattern to defer/coalesce updates to avoid redundant work.

**Tasks**:
- Document requestAnimationFrame deferral pattern (already used in LightingControlsPanel)
- Identify other systems that could benefit:
  - Game box texture updates during batch loads
  - UI panel refreshes during rapid data changes
  - Debug overlay updates
  - Statistics panel updates
- Create utility helper: `DeferredExecutor` class
  - `schedule(callback)`: Schedule callback for next frame
  - `cancel()`: Cancel pending execution
  - `flush()`: Execute immediately
- Apply to identified hot paths
- Add performance metrics to verify improvements

**Example Pattern**:
```typescript
private pendingUpdate: number | null = null

scheduleUpdate(): void {
    if (this.pendingUpdate) cancelAnimationFrame(this.pendingUpdate)
    this.pendingUpdate = requestAnimationFrame(() => {
        this.doActualUpdate()
        this.pendingUpdate = null
    })
}
```

**Benefits**: Reduced redundant work, smoother UI updates, better frame pacing, fewer GC allocations

**Source**: Nov 2025 - Implemented for checkbox updates, should be systematic pattern

---

### Performance: GPU Instancing Audit
**Priority**: Medium  
**Effort**: 6-8 hours  
**Context**: Recent instancing work (InstancedArtworkRenderer, InstancedLabelRenderer) showed 10-100x performance gains. Need audit of remaining non-instanced geometry.

**Tasks**:
- Audit all mesh creation for instancing opportunities:
  - ✅ **DONE**: Game box artwork (InstancedArtworkRenderer)
  - ✅ **DONE**: Game box labels (InstancedLabelRenderer)
  - ✅ **DONE**: Diagnostic spotlight beams (shared geometry)
  - **TODO**: Shelf geometry (shelves use same dimensions)
  - **TODO**: Ceiling fixture housings (identical geometry)
  - **TODO**: Prop objects if they repeat
  - **TODO**: Debug visualization objects (arrows, boxes, spheres)
- Measure memory and draw call reduction for each
- Document instancing pattern and when to use it
- Consider InstancedMesh for identical static geometry
- Consider batching for similar but different geometry

**Current Wins**:
- Artwork: 500 draw calls → 1 draw call
- Labels: 500 draw calls → 1 draw call  
- Spotlight beams: 10 geometries → 1 shared geometry

**Remaining Opportunities**:
- Shelves: Estimate 50-100 shelves, all identical → 1 instanced mesh
- Fixtures: Estimate 6-12 fixtures, identical housing → 1 instanced mesh

**Benefits**: Fewer draw calls, reduced GPU memory, better frame rates, scales to larger stores

**Source**: Nov 2025 - Recent instancing successes, ongoing optimization effort

---

### Distance-Based Dynamic Lighting Activation
**Priority**: Medium  
**Effort**: 4-6 hours  
**Context**: Currently all ceiling fixtures are active regardless of player distance. Need distance-based activation to reduce compute for distant lights while maintaining ambient lighting.

**Tasks**:
- Use less compute-intensive ambient lighting for distant store areas
- Dynamically activate ceiling fixtures as player approaches
- Define activation radius (e.g., 15m for RectAreaLights)
- Keep base lighting (ambient, directional, fill) always active
- Smoothly fade fixtures on/off to avoid popping
- Consider distance from camera/player position for activation
- Add hysteresis (lights stay on slightly longer when moving away)
- Debug overlay showing active vs inactive fixture zones

**Implementation Approach**:
- Store fixture world positions during creation
- Each frame, check distance from camera to each fixture group
- Activate fixtures within radius, deactivate beyond
- Use fixture.visible = true/false for instant performance gains
- Consider intensity fade for smoother transitions

**Performance Impact**:
- Current: All ~6 RectAreaLights active (12 shelf rows → 6 fixtures)
- Optimized: Only 2-3 fixtures active near player
- Expected savings: 30-50% reduction in light computation

**Benefits**: Better frame rates in large stores, improved VR performance, battery savings on standalone headsets, scalable to much larger environments

**Source**: User request (Nov 2025) - "tech debt todo for us to use less compute intense ambient light for distant areas, and turn on dynamic lights as we get closer"

### LOD System for Lighting & Shadows
**Priority**: Medium  
**Effort**: 8-12 hours  
**Context**: Currently all lights and shadows render at full quality regardless of distance or performance impact. Need LOD (Level of Detail) system to dynamically adjust lighting complexity based on distance from viewer and performance budget.

**Tasks**:
- Implement distance-based light culling (disable lights beyond certain distance)
- Add shadow quality LOD (high/medium/low/off based on distance and performance)
- Dynamic fixture count adjustment based on scene complexity
- Fixture emissive intensity scaling based on distance
- Shadow map resolution adjustment per light based on importance
- Performance budget system (target frame time, reduce quality if exceeded)
- Smooth transitions between LOD levels to avoid popping
- Add debug overlay showing active lights and shadow maps

**LOD Levels**:
- **Level 0** (Close): Full shadows, all lights active, high shadow map resolution (2048)
- **Level 1** (Medium): Reduced shadows, some lights culled, medium resolution (1024)
- **Level 2** (Far): Minimal shadows, most lights culled, low resolution (512)
- **Level 3** (Very Far): No shadows, only key lights, ambient approximation

**Performance Targets**:
- Maintain 90fps in VR (11ms frame budget)
- Reduce GPU load by 20-40% in large scenes
- Automatic quality scaling based on device capabilities

**Benefits**: Better VR performance, smoother frame rates, support for larger stores, battery life improvement on standalone VR devices

**Source**: User request (Nov 2025) - "Can we add a todo in our tech debt to LOD our lighting & shadows?"

### Background-Tab Low-Resource Startup Mode
**Priority**: Low  
**Effort**: 6-10 hours  
**Context**: When client starts without window focus (background tab), it should defer heavy initialization work to avoid blocking the browser/system. Need smart resource management that chunks work and yields to keep the browser responsive.

**Tasks**:
- Detect if window has focus on startup (document.hasFocus())
- Implement "chunked loading" mode that breaks initialization into small work units
- Use requestIdleCallback or setTimeout(0) to yield between chunks
- Defer non-critical initialization (debug tools, analytics, etc.)
- Reduce animation frame rate in background (e.g., 10fps vs 90fps)
- Pause texture loading or reduce concurrent texture processing
- Add visual indicator when switching from background to foreground mode
- Resume full initialization when window gains focus
- Consider using Web Workers for heavy processing to keep main thread free

**Implementation Considerations**:
- Need to define "critical" vs "deferrable" initialization steps
- Balance between slower startup and browser responsiveness
- May need cooperative scheduling between different initialization systems
- Consider Page Visibility API for detecting tab visibility changes
- Performance monitoring to measure actual impact on system resources

**Challenges**:
- Hard to self-police resource usage without browser APIs
- Different browsers handle background tabs differently
- May need heuristics rather than direct measurement
- Risk of over-complicating startup sequence

**Benefits**: Better browser responsiveness when app starts in background, reduced system impact during multi-tab workflows, improved user experience on resource-constrained devices

**Source**: User request (Nov 2025) - "If our client is not in focus when it starts up, it should switch into a 'low resource' bootup"

### Development-Mode Instance Lifecycle Watchdog
**Priority**: Medium  
**Effort**: 4-6 hours  
**Context**: Multiple instances of classes intended to be singletons can cause hard-to-debug issues (e.g., shader uniforms stored in wrong instance). Need development-mode tooling to catch these automatically.

**Tasks**:
- Create `InstanceTracker` utility for development builds only
- Track constructor calls for registered singleton classes
- Detect multiple instances of same class type
- Detect orphaned instances (created but never used/referenced)
- Detect instance reference breaking (stored refs becoming undefined)
- Add console warnings with stack traces when issues detected
- Add visual overlay in dev mode showing active instances
- Register key classes: ShelfStickerIntegration, DataManager, EventManager

**Benefits**: Catch instance lifecycle bugs early, reduce debugging time for "worked in one context but not another" issues

**Background**: Discovered during data texture implementation when 3 ShelfStickerIntegration instances were created, causing shader uniforms to be stored in one instance while data population happened in another.

**Source**: Sticker data texture debugging session (Nov 2025)

### Three.js Scene Resource Leak Detector
**Priority**: Medium  
**Effort**: 6-8 hours  
**Context**: Need development-mode tooling to detect unused meshes, textures, geometries, and materials in Three.js scene. Unlike instance tracking, this needs context awareness (e.g., skybox is background so shouldn't be flagged).

**Tasks**:
- Create `SceneResourceMonitor` for development builds
- Track all Three.js resources: meshes, geometries, materials, textures
- Detect resources created but never added to scene
- Detect resources added to scene but never visible (zero render count after N frames)
- Add whitelist system for intentionally background/hidden resources
- Track texture memory usage and warn on excessive allocation
- Detect geometry/material instances that could be shared but aren't
- Add visual overlay showing resource counts and memory usage
- Monitor draw calls and instance counts per frame
- Provide "snapshot comparison" to detect resource leaks over time

**Whitelist Categories**:
- Background elements (skybox, ambient lighting)
- Pooled resources (pre-created for performance)
- Dynamically shown/hidden UI elements
- LOD meshes (only some visible at a time)

**Benefits**: Catch performance issues early, detect memory leaks, optimize resource usage, validate instancing effectiveness

**Background**: Complex scenes with instanced rendering, texture atlases, and dynamic content make it easy to accidentally create unused resources. Need automated detection with context awareness.

**Source**: Sticker data texture debugging + general performance optimization awareness (Nov 2025)

- make "UIEvent" a type of event and have all UI emissions use that event type with a sub-identifier for their specific UI Event.

- make sure we've got todo-note-outlines for performance levers:
             *     maxTextureSize: 1024,
             *     nearDistance: 2.0,
             *     farDistance: 10.0,
             *     highResolutionSize: 512,
             *     mediumResolutionSize: 256,
             *     lowResolutionSize: 128,
             *     maxActiveTextures: Math.min(50, maxGames / 2),
             *     frustumCullingEnabled: true

### Update Failing StorePropsRenderer Tests
**Priority**: High  
**Effort**: 2-3 hours  
**Context**: 3 tests are failing because they expect old internal behavior after StorePropsRenderer bifurcation

**Tasks**:
- Update tests to reflect new delegating architecture where createGameBox calls are handled by InstancedStorePropsRenderer
- Verify test mocks work with bifurcated system
- Ensure test coverage covers both Legacy and Instanced implementations
- Update test expectations to match new component interfaces

**Files to Modify**:
- `client/test/unit/scene/` - StorePropsRenderer test files
- Test mocks and setup files

**Benefits**: Restored test suite stability, proper coverage of bifurcated architecture

**Source**: GPU instancing implementation (Oct 2025) - tests became outdated after architecture split

### Export Rendered Shelf as Model File
**Priority**: Medium  
**Effort**: 4-6 hours  
**Context**: Performance optimization - can we export the rendered shelf as a model file to reduce draw calls even further?

**Tasks**:
- Investigate exporting GPU instanced shelf geometry as static model files
- Evaluate draw call reduction potential vs current instancing approach
- Research Three.js geometry export capabilities for instanced meshes
- Consider runtime vs pre-processing trade-offs for model generation
- Test performance impact comparison between instanced rendering and model file approach

**Benefits**: Potential further draw call reduction, startup performance improvement

**Background**: Current GPU instancing already provides significant performance gains, but static models could eliminate instance management overhead entirely

**Source**: Performance optimization consideration (Oct 2025)

### Graphics Settings Scene Reload Optimization
**Priority**: Medium  
**Effort**: 3-4 hours  
**Context**: Graphics settings currently require full page reload (F5). Would be better if we could reload just the scene since infrastructure exists.

**Tasks**:
- Investigate which graphics settings can apply without scene reload
- Wire scene reload functionality to graphics settings changes
- Add "Apply Changes" button that triggers scene reload instead of page reload
- Test lighting quality changes with scene-only reload
- Ensure state persistence across scene reloads

**Background**: Page reload works but scene reload would be more elegant and preserve UI state.

### Pause Menu Tab Persistence  
**Priority**: Low  
**Effort**: 1-2 hours  
**Context**: Pause menu should remember which tab was last open, even after page refresh

**Tasks**:
- Add localStorage persistence for active tab ID
- Restore last active tab on pause menu initialization
- Handle cases where remembered tab no longer exists
- Add fallback to first available tab

**Benefits**: Better user experience, preserves workflow context across sessions

### Game Limiting UI Configuration
**Priority**: Medium  
**Effort**: 3-4 hours  
**Context**: Game limiting functionality exists but not exposed in UI settings. Currently OFF by default (as intended) but should be user-configurable.

**Tasks**:
- Add "Max Games Limit" setting to UI Settings panel
- Wire setting to existing `maxGames` configuration in SteamBrickAndMortarApp 
- Add toggle for "Enable Game Limiting" (OFF by default)
- Connect to existing `updateMaxGames()` methods in workflow chain
- Add user feedback about current game counts vs. limits

**Background**: Performance limiting for large libraries - not critical since realistic game counts shouldn't cause issues, but good to have available.

---

## Critical Issues
*Must fix - blocks core functionality or introduces serious bugs*

*No critical issues currently identified*

---

## High Priority
*Should fix soon - impacts user experience or developer productivity*

### User Experience

#### Centralized Input Management System
**Priority**: High  
**Effort**: 6-8 hours  
**Context**: Critical UX issue - typing in input fields triggers camera movement, menu interactions conflict with game controls. Need centralized input management that handles focus states, supports future input device mappings, and provides clean enable/disable for control groups.

**Current Problems**:
- Typing in search/input fields triggers WASD camera movement
- Menu focus doesn't disable scene controls
- No centralized way to disable controls when UI is active
- Game Library Binder, Steam UI Panel, and Pause Menu all need focus handling
- No foundation for future input remapping or VR controller support

**Tasks**:
- Create centralized `InputManager` class that:
  - Tracks which UI elements currently have focus
  - Routes keyboard/mouse input to appropriate handlers
  - Provides `disableSceneControls()` / `enableSceneControls()` API
  - Supports input context stacking (menu on top of game controls)
- Implement focus tracking for all UI elements:
  - Input fields (search bars, text inputs)
  - Modal menus (Game Library Binder, Pause Menu)
  - Passive panels (Steam UI Panel when interacting)
- Add `onFocus` / `onBlur` hooks for menu panels
- Disable WASD/mouse controls when any UI has focus
- Re-enable controls when focus returns to game area
- Design for future extensibility:
  - Input action mapping (configurable key bindings)
  - VR controller input routing
  - Gamepad support

**Files to Create**:
- `client/src/core/InputManager.ts` - Centralized input management
- `client/src/core/InputContext.ts` - Input context definitions (game, menu, text-entry)

**Files to Modify**:
- `client/src/webxr/WebXRCoordinator.ts` - Use InputManager for control state
- `client/src/ui/SteamUIPanel.ts` - Register focus events with InputManager
- `client/src/ui/binder/GameLibraryBinderUI.ts` - Register as modal context
- `client/src/ui/pause/PauseMenuManager.ts` - Register as modal context

**Benefits**: Eliminates control conflicts, prevents accidental camera movement while typing, foundation for input remapping and VR controller support, improved user experience

**Source**: Game Library Binder implementation (Nov 2025) - identified need for centralized input handling when adding search functionality

### Architecture & Structure

#### Refactor GameBoxRenderer Bifurcation
**Priority**: High  
**Effort**: 4-5 hours  
**Context**: Split GameBoxRenderer into Legacy + Instanced versions following the same pattern as StorePropsRenderer. This is the next highest priority bifurcation point.

**Tasks**:
- Create LegacyGameBoxRenderer maintaining current behavior
- Create InstancedGameBoxRenderer with GPU instancing optimizations
- Create delegating GameBoxRenderer wrapper following StorePropsRenderer pattern
- Update dependency injection and service registration
- Ensure game box rendering integrates with instanced shelf system
- Update tests to cover both implementations
- Merge PropRenderer into the legacy/GPU system (see TODO in PropRenderer.ts)

**Files to Modify**:
- `client/src/scene/game-box/GameBoxRenderer.ts` - Split into multiple files
- `client/src/scene/PropRenderer.ts` - Merge atmospheric props into legacy/GPU paths
- Service registration and dependency injection setup
- Game rendering workflow integration
- Related test files

**Benefits**: Completes GPU instancing architecture, enables further rendering optimizations, maintains legacy compatibility, consolidates prop rendering

**Source**: GPU instancing roadmap (Oct 2025) - next architectural milestone after StorePropsRenderer bifurcation

#### Refactor Panel/Tab Naming and Architecture
**Priority**: High  
**Effort**: 3-4 hours  
**Context**: Current "panels" are actually functioning as tabs - need architectural refactor to prevent building more tech debt on incorrect structure

**Tasks**:
- Rename current "Panel" classes to "Tab" to reflect actual behavior
- Define true Panel concept as logical UI groupings within tabs
- Update pause menu system to use correct Tab/Panel hierarchy
- Plan Panel extraction system for breaking large tab sections into separate files
- Update component relationships and dependency injection accordingly

**Files to Modify**:
- `client/src/ui/pause/` - All panel classes need Tab renaming
- Pause menu management and navigation logic
- Component registration and organization system

**Benefits**: Correct semantic architecture, enables future component separation, prevents building on incorrect structure

**Rationale**: Don't want to keep building on top of current misnaming - architectural foundation improvement

### Code Quality & Documentation

#### Export Shader Code to Relevant Files
**Priority**: High  
**Effort**: 2-3 hours  
**Context**: Low effort, good return on readability. Shader code currently embedded in component files should be extracted to dedicated shader files.

**Tasks**:
- Extract inline shader code from Three.js materials and components
- Create dedicated `.glsl` or `.frag`/`.vert` files for shader programs
- Update imports to reference external shader files
- Organize shader files in logical directory structure
- Add proper shader documentation and comments

**Files to Modify**:
- Components using custom shaders (materials, effects, etc.)
- Create new `client/src/shaders/` directory structure
- Build system to handle shader file imports

**Benefits**: Improved code readability, better shader maintainability, syntax highlighting for shaders, easier shader reuse

**Source**: Code organization todo (Oct 2025) - identified as quick win for code quality

#### Remove Redundant Javadoc Comments
**Priority**: High  
**Effort**: 2-3 hours  
**Context**: Many files have verbose javadoc comments that add little value beyond method signatures

**Tasks**:
- Audit all TypeScript files for redundant comments
- Keep comments only where they add genuine value beyond signatures
- Focus on complex business logic, edge cases, and architectural decisions
- Remove boilerplate documentation that duplicates type information

**Benefits**: Reduced code noise, improved readability, less maintenance overhead

---

## Medium Priority  
*Good to fix - improves code quality and maintainability*

### UI Polish & Consistency

#### Standardize Cache Management UI Styling
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: Cache scrolling view buttons/inputs inconsistent with main UI styling

**Tasks**:
- Apply consistent button styling from main UI components
- Standardize input field appearance and behavior
- Ensure hover states and focus indicators match UI system
- Test styling across different viewport sizes

**Benefits**: More polished user experience, consistent visual design

**Status**: Deferred from Phase 1 - suitable for UI polish phase

#### Improve Preview Button State Management
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: "Initialize preview" button should change state after initialization

**Tasks**:
- Change button text/appearance after preview initialization
- Add onMenuClose event handler to reset button state
- Consider "Close Preview" functionality vs simple state reset
- Ensure consistent behavior across menu open/close cycles

**Benefits**: Better UI feedback, clearer interaction state

**Status**: Deferred from Phase 1 - non-essential functionality

### Performance & Architecture

#### Performance Testing Comparison (Legacy vs Instanced)
**Priority**: Very low (kept as notes but not important for scope intended)  
**Effort**: 3-4 hours  
**Context**: Compare performance before/after instancing implementation. Need metrics to validate GPU instancing benefits and identify further optimizations.

**Tasks**:
- Measure draw call reduction between legacy and instanced systems
- Monitor memory usage differences between implementations
- Benchmark render performance for various game library sizes
- Test frame rate impact during dynamic shelf generation
- Create performance comparison dashboard or reports
- Identify performance bottlenecks in current instanced system

**Files to Modify**:
- `client/test/performance/` - Add instancing performance tests
- Performance monitoring utilities
- Benchmark comparison scripts

**Benefits**: Quantified performance improvements, data-driven optimization decisions, regression detection for future changes

**Source**: GPU instancing validation (Oct 2025) - need empirical performance data

#### WebWorker-Based Texture Generation
**Priority**: Medium  
**Effort**: 6-8 hours  
**Context**: Procedural texture generation currently blocks main thread during material creation. While lazy loading fixed startup delay, texture generation still causes frame drops when materials are first requested.

**Tasks**:
- Move procedural texture generation (WoodTextureGenerator, CarpetTextureGenerator, CeilingTextureGenerator) to WebWorkers
- Implement async texture creation with Promises/callbacks
- Add texture loading indicators for user feedback during generation
- Ensure texture transfer from worker to main thread maintains quality
- Test performance impact and thread utilization

**Benefits**: Non-blocking texture generation, improved runtime performance, better user experience during material creation

**Background**: Currently lazy-loaded materials generate textures on-demand but still block main thread. WebWorkers would eliminate this blocking behavior entirely.

**TODO Source**: Identified during SharedMaterialManager lazy loading implementation (Oct 2025)

### UI Polish & Consistency

#### Fix Pause Menu Double Scrollbars
**Priority**: High  
**Effort**: 1-2 hours  
**Context**: Two scrollbars appear in pause menu when screen space is reduced (notably on cache page) - user-facing UX issue

**Tasks**:
- Investigate CSS overflow settings on pause menu containers
- Identify which elements are creating competing scroll contexts
- Implement proper scroll container hierarchy (single scrollable area)
- Test across different viewport sizes to ensure fix works consistently

**Benefits**: Cleaner UI appearance, better responsive design, improved user experience

#### Standardize Cache Management UI Styling

#### Prevent Redundant Image Cache Downloads
**Priority**: High  
**Effort**: 2-3 hours  
**Context**: System currently may redownload images that are already cached, wasting bandwidth and time

**Tasks**:
- Add cache existence check before initiating image downloads
- Update ImageManager to verify cached images before fetching
- Ensure cache hit logic prevents redundant network requests
- Add logging to verify cache behavior and confirm download elimination

**Benefits**: Reduced bandwidth usage, faster loading times, better cache utilization

#### Remove Dead Event Code from SteamWorkflowManager  
**Priority**: High  
**Effort**: 1-2 hours  
**Context**: SteamWorkflowManager contains extensive unused event code for image cache stats

**Tasks**:
- Audit SteamWorkflowManager for unused image cache stats event handlers
- Remove dead event listeners and related code
- Clean up any associated event definitions if no longer used
- Verify removal doesn't break existing functionality

**Benefits**: Cleaner codebase, reduced maintenance overhead, improved code readability

#### Input Management Simplification
**Priority**: Medium  
**Effort**: 3-4 hours  
**Context**: InputManager has complex callback chains that could be simplified

**Tasks**:
- Review camera update flow for over-engineering
- Consider direct method calls vs callbacks for simple updates
- Streamline movement update callback chains
- Maintain flexibility while reducing complexity

**Benefits**: Simpler input handling, easier debugging, reduced callback overhead

#### WebXR Manager Callback Streamlining
**Priority**: Medium  
**Effort**: 2-3 hours  
**Context**: WebXR state changes passed through multiple callback layers unnecessarily

**Tasks**:
- Identify simple state updates that could use direct method calls
- Review session state change propagation
- Simplify supported/session active flag management
- Maintain event system for complex state changes

**Benefits**: Reduced WebXR state management complexity, clearer data flow

### Cache Performance (Remaining Optimizations)

#### Optimize hasCachedData() Method
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: Minor optimization for frequent cache lookups

**Tasks**:
- Cache resolve lookup result during execution
- Add `getCachedUserData()` combining resolve + games lookup
- Optimize cache key generation to reduce string operations

**Benefits**: Reduced redundant cache lookups, minor performance improvement

#### Smart Cache Management Panel Refresh
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: Current 5-second refresh can be optimized

**Tasks**:
- Increase refresh interval to 8s when panel visible
- Pause refresh when panel not visible
- Add manual refresh button
- Cache stats between automatic refreshes

**Benefits**: Better background resource usage, improved panel UX

---

## Low Priority
*Nice to have - minimal impact on core functionality*

### Testing Infrastructure

#### Review and Reclassify Performance Tests
**Priority**: Low  
**Effort**: 2-3 hours  
**Context**: Some unit tests may actually be performance tests that should be separated

**Tasks**:
- Audit existing tests for timing/performance measurements
- Extract performance tests to `.perf.test.ts` files
- Update test configurations for separate performance runs
- Ensure proper benchmarking thresholds

**Benefits**: Cleaner test separation, better performance regression detection

#### Remove Dead Event Code from SteamWorkflowManager  
**Priority**: Low  
**Effort**: 1-2 hours  
**Context**: SteamWorkflowManager contains extensive unused event code for image cache stats - internal maintenance

**Tasks**:
- Audit SteamWorkflowManager for unused image cache stats event handlers
- Remove dead event listeners and related code
- Clean up any associated event definitions if no longer used
- Verify removal doesn't break existing functionality

**Benefits**: Cleaner codebase, reduced maintenance overhead, improved code readability

#### Implement Missing Integration Test Coverage
**Priority**: Low  
**Effort**: 6-8 hours  
**Context**: Identified gaps in integration test coverage

**Tasks**:
- See detailed plan in `docs/integration-test-coverage-plan.md`
- Add Steam API + Integration layer boundary tests
- Implement texture loading integration tests
- Create scene rendering tests without WebGL dependency
- Add progressive loading integration tests

**Benefits**: Better integration boundary coverage, improved confidence in workflows

**Tasks**:
- Audit existing tests for timing/performance measurements
- Extract performance tests to `.perf.test.ts` files
- Update test configurations for separate performance runs
- Ensure proper benchmarking thresholds

**Benefits**: Cleaner test separation, better performance regression detection

---

## Archived/Completed

### StorePropsRenderer GPU Instancing Implementation
**Status**: **Completed** ✅  
**Original Effort**: 8-12 hours (actual: ~15 hours due to debugging)  
**Context**: Successfully implemented GPU instanced rendering system with bifurcated architecture

**Completed Tasks**:
- ✅ Created InstancedShelfRenderer with 4 geometry types (AngledBoards, SideBoards, ShelfBoards, InteriorSurfaces)
- ✅ Implemented InstancedMeshManager for GPU instance management
- ✅ Built bifurcated StorePropsRenderer architecture (Legacy + Instanced + Delegating wrapper)
- ✅ Fixed timing issues with InstancedBatchComplete events and scene integration
- ✅ Added comprehensive unit test coverage (49 tests)
- ✅ Cleaned up debugging code for production readiness

**Results**:
- System renders 794 games across 45 shelves using GPU instancing
- Both games and shelves rendering correctly with optimal performance
- Complete event-driven coordination system working
- Full test coverage with 458/463 tests passing

**Technical Achievements**:
- Fixed missing event emission preventing GPU updates
- Resolved shelf scene timing by moving addToMainScene to first shelf creation
- Implemented proper validation system for scene integrity
- Created production-ready logging while maintaining debugging capabilities

**Source**: October 2025 GPU instancing implementation

### Feature 5.5.1: Dedicated Game List Cache
**Status**: **Cancelled** - Data duplication outweighed performance benefits  
**Original Effort**: 4-6 hours  
**Context**: Analysis showed minimal performance gain vs complexity and memory overhead

**Analysis Results**:
- Hash map lookups already fast (2 vs 1 lookup not meaningful bottleneck)
- Data duplication created consistency issues
- Memory overhead triggered LRU eviction more frequently
- Alternative optimizations provide better ROI

**Alternative Solutions Applied**:
- Debounced localStorage writes ✅
- Cached user list index ✅  
- LRU cache size management ✅

---

## Priority Definitions

- **Critical**: Blocks core functionality, introduces serious bugs, or security issues
- **High**: Significantly impacts user experience, developer productivity, or code quality
- **Medium**: Moderate improvements to performance, maintainability, or user experience  
- **Low**: Minor enhancements, nice-to-have features, or preparatory work for future changes

## Workflow

1. **Intake**: New items added to Intake Queue
2. **Triage**: Regular review to assign priority and effort estimates
3. **Planning**: High/Critical items planned into development cycles
4. **Implementation**: Items moved to appropriate project milestones
5. **Completion**: Items moved to Archived section with status notes