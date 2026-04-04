# Startup Sequence Architecture

The application startup is divided into 5 distinct sequential phases, prioritizing getting the user into an interactive state as quickly as possible. Heavy data fetching and asset generation are treated as asynchronous "post-events" that populate the world after the user is already present.

## Phase 1: CoreInit
**Bounds:** App constructor → DI container sealed
**Actions:**
- Initialize Dependency Injection (`ServiceContainer`)
- Instantiate singletons, loggers, and EventManager
- Register core event handlers

## Phase 2: EngineStart
**Bounds:** Render loop requested → First frame rendered
**Actions:**
- Initialize Three.js renderer, canvas, and main scene
- Setup WebXR coordinators and capabilities detection
- Establish base UI layers (System, WebXR)
- Start the render loop

## Phase 3: WorldBuild
**Bounds:** Scene ready event → Layout computed
**Actions:**
- Spawn room geometry and skybox
- Establish lighting (ambient, directional, spots)
- Initialize instanced renderers (shelves, architecture)
- Kick off background workers for material prewarming (async)

## Phase 4: ControlsReady
**Bounds:** Layout computed → User input accepted
**Actions:**
- Initialize player controllers (desktop/VR)
- Position player at spawn point
- *State:* User can now look and move around the empty store.

## Phase 5: Interactive
**Bounds:** Input accepted → Progress UI dismissed
**Actions:**
- Tear down loading screens and startup overlays
- Signal to external tools (e.g., Playwright) that the app is visually stable
- *State:* The "Empty Store" experience is fully usable.

---

## Post-Events (Asynchronous "Encores")
These occur outside the blocking startup sequence and do not gate the user's ability to look or move around.

### BackgroundPrewarmComplete
- Worker threads finish generating procedural textures (e.g., MDF, carpet, wood grain).
- Flat fallback materials are swapped for textured materials on the fly.

### DataBatchesLoaded (Steam Cache/Fetch)
- Steam API fetches library data (or loads from IndexedDB cache).
- Triggers batch events to progressively populate the shelves with game boxes.
- Fires `AllBatchesComplete` when finished.