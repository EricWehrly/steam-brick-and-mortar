# Complete Component Interaction Map - All Systems

**Last Updated**: April 21, 2026  
**Purpose**: Comprehensive map of ALL major systems, how they connect, and analysis of layering/architecture

## 🎯 Quick Navigation

**Scope**: Complete application architecture (37 core components across 6 major systems)
**Systems Covered**: Scene Rendering, WebXR, Steam Integration, UI, Materials, Infrastructure
**Analysis Included**: Component relationships, event flows, layering issues, simplification opportunities

### Runtime Event Flow (canonical, 2026-04)

#### Phase 1 — Library manifest fixed
- `SteamIntegration.storeSteamDataAndEmitEvent()` commits `steam.games` and emits:
  - `SteamEventTypes.DataLoaded` (integration/UI refresh)
  - `SteamEventTypes.LibraryManifestReady` (immutable membership: `appid[]`, totals)
- `GameBoxSpawner` initializes renderer capacity from `LibraryManifestReady`.

#### Phase 2 — Definitions ready for arrangement
- `SteamIntegration` emits `GameEventTypes.GameDataReady` immediately after `steam.games` commit.
- `GameSorter` listens to `GameDataReady`, resolves grouping+sorting, emits `SectionsComputed`, `ArrangementAllocationPlanned`, `SectionsReadyForPlacement`, and `SectionsReady`.
- `ShelfLayoutCoordinator` and `ShelfSectionPlanner` consume `SectionsReady`.
- `GameBoxSpawner` consumes `SectionsReadyForPlacement`.

#### Phase 3 — Artwork/placement progress and completion
- `GamesLoader` emits `SteamEventTypes.GamesBatchReady` (cache + remote progressive batches).
- `BatchCoordinator` serializes and re-emits `StorePropsEventTypes.BatchReadyForPlacement`.
- `GameBoxSpawner` prewarms artwork from `BatchReadyForPlacement`, places on `SectionsReadyForPlacement` + `ShelfLayoutDetermined`, then emits `StorePropsEventTypes.GamesPlaced`.
- `BatchCoordinator` emits `SomeBatchesComplete` / `AllBatchesComplete` after placement accounting.

#### Ownership rules
- `GameDataReady` is a **SteamIntegration-owned seam** (definitions ready), not a BatchCoordinator signal.
- `BatchCoordinator` owns placement-progress/completion only.
- `DataLoaded` is integration/UI-level and can co-occur with readiness seams but should not be reused as the sorter trigger.

### System Entry Points:
- **Scene Rendering**: `main.ts` → `SteamBrickAndMortarApp` → `SceneCoordinator` → Renderers
- **WebXR (VR/AR)**: `WebXRCoordinator` → `WebXRManager` + `InputManager`
- **Steam Integration**: `SteamWorkflowManager` → `SteamIntegration` → `SteamApiClient`
- **UI System**: `UIManager` + 3 UI Coordinators (Steam, WebXR, System)
- **Material System**: `SharedMaterialManager` → Material Generators
- **Infrastructure**: `EventManager`, `DataManager`, `AppSettings` (global singletons)

---

## 📋 Quick Reference - System Summary

| System | Components | Entry Point | Layering Grade | Simplification? |
|--------|------------|-------------|----------------|-----------------|
| **Scene Rendering** | 9 | SceneCoordinator | B | ⚠️ Merge StorePropsRenderer |
| **WebXR** | 4 | WebXRCoordinator | B | ⚠️ Merge WebXRManager |
| **Steam Integration** | 5 | SteamWorkflowManager | B- | ⚠️ Merge Workflow+Integration |
| **UI** | 7 | UIManager | A | ✅ Good as-is |
| **Material** | 4 | SharedMaterialManager | A+ | ✅ Excellent |
| **Infrastructure** | 3 | EventManager/DataManager | A | ✅ Good as-is |
| **DI System** | 2 | ServiceContainer | A | ✅ Good as-is |

**Total**: 37 components, 6 systems, 4 simplification opportunities

---

## 📊 High-Level Architecture Flow - ALL SYSTEMS

```
main.ts
  └── SteamBrickAndMortarApp (ORCHESTRATOR)
      │
      ├──┬── ServiceContainer (DI INFRASTRUCTURE) ──────────────────────────────┐
      │  │   └── ServiceRegistration.configureServices()                        │
      │  │       ├── EventManager (singleton) ✅                                 │
      │  │       ├── DataManager (singleton) ✅                                  │
      │  │       ├── AppSettings (singleton) ✅                                  │
      │  │       ├── SharedMaterialManager (singleton) ✅                        │
      │  │       ├── SceneManager (per-container) ✅                             │
      │  │       ├── GameBoxRenderer (singleton) ✅                              │
      │  │       ├── StorePropsRenderer (singleton) ✅                           │
      │  │       ├── SceneCoordinator (singleton) ✅                             │
      │  │       ├── SteamUICoordinator (singleton) ✅                           │
      │  │       ├── WebXRUICoordinator (singleton) ✅                           │
      │  │       └── SystemUICoordinator (singleton) ✅                          │
      │  │                                                                        │
      │  └── [ All systems below use services from DI container ] ──────────────┘
      │
      ├── SCENE RENDERING SYSTEM (3D visualization)
      │   └── SceneCoordinator (orchestrates visual layers)
      │       ├── SceneManager (Three.js scene, camera, renderer)
      │       ├── SkyboxManager (background environment)
      │       ├── LightingRenderer (illumination system)
      │       │   ├── LightFactory (creates lights)
      │       │   ├── PropRenderer (light fixtures)
      │       │   └── LightingDebugHelper (debug visualization)
      │       ├── RoomManager (room structure, event-driven) 🏗️
      │       │   ├── SharedMaterialManager (wall/floor materials)
      │       │   └── PropRenderer (ceiling fixtures)
      │       └── StorePropsRenderer (shelf/game spawning) 🎯
      │           └── GameBoxRenderer (creates game boxes) ⭐
      │               ├── SharedMaterialManager (game box materials)
      │               ├── GameBoxTextureManager (textures)
      │               ├── GameBoxPerformanceManager (optimization)
      │               └── GameBoxLayoutUtils (positioning)
      │
      ├── WEBXR SYSTEM (VR/AR interface)
      │   └── WebXRCoordinator (VR/input orchestration)
      │       ├── WebXRManager (session lifecycle)
      │       │   └── XR Device API (browser WebXR)
      │       ├── InputManager (keyboard/mouse/controller)
      │       └── WebXREventHandler (event routing)
      │           └── WebXRUICoordinator (VR UI panels)
      │
      ├── STEAM INTEGRATION SYSTEM (game library)
      │   └── SteamWorkflowManager (workflow orchestration)
      │       ├── SteamIntegration (API orchestration)
      │       │   ├── SteamApiClient (HTTP API calls)
      │       │   └── GameLibraryManager (game state/cache)
      │       ├── SteamUICoordinator (UI feedback)
      │       └── SceneCoordinator (spawn games in scene)
      │
      ├── UI SYSTEM (user interface)
      │   ├── UIManager (panel registry/lifecycle)
      │   ├── SteamUICoordinator (Steam loading UI)
      │   ├── WebXRUICoordinator (VR UI panels)
      │   └── SystemUICoordinator (system UI)
      │       ├── PauseMenuManager (pause menu)
      │       ├── PerformanceMonitor (FPS/stats)
      │       ├── DebugStatsProvider (debug info)
      │       └── ToastManager (notifications)
      │
      ├── DATA/EVENT INFRASTRUCTURE (shared services)
      │   ├── EventManager (event bus) 📡
      │   ├── DataManager (centralized state) 💾
      │   └── AppSettings (configuration) ⚙️
      │
      └── MATERIAL SYSTEM (shared resources)
          └── SharedMaterialManager (material pooling)
              ├── WoodMaterialGenerator (shelf materials)
              ├── CarpetMaterialGenerator (floor materials)
              ├── CeilingMaterialGenerator (ceiling materials)
              └── MaterialUtils (utilities)
```

---

## 🗺️ Detailed Component Map

### 1️⃣ Entry Point: `main.ts`

**File**: `client/src/main.ts`  
**Purpose**: Application bootstrap  
**Key Actions**:
- Wait for DOM ready
- Call `initializeApp()`
- Create `SteamBrickAndMortarApp` instance
- Call `app.init()`

**Dependencies**: None (entry point)

**Code Flow**:
```typescript
async function initializeApp() {
    const app = new SteamBrickAndMortarApp({
        scene: { antialias: true },
        steam: { apiBaseUrl: '...' },
        input: { speed: 0.1, mouseSensitivity: 0.005 }
    })
    await app.init()
}
```

---

### 2️⃣ Application Orchestrator: `SteamBrickAndMortarApp`

**File**: `client/src/core/SteamBrickAndMortarApp.ts`  
**Purpose**: Top-level application coordinator  
**Key Responsibilities**:
- Initialize DI container
- Setup scene, WebXR, Steam integration, UI
- Coordinate high-level workflows
- Manage application lifecycle

**Dependencies**:
- `ServiceContainer` - DI system
- `SceneManager` - Three.js scene management
- `EventManager` - Event bus
- `AppSettings` - Application configuration
- All coordinators (resolved from DI)

**Code Flow** (constructor):
```typescript
constructor(config: AppConfig = {}) {
    // 1. Initialize AppSettings (needed for defaults)
    this.appSettings = AppSettings.getInstance()
    
    // 2. Create SceneManager (will be shared via DI)
    this.sceneManager = new SceneManager({ antialias: true })
    
    // 3. Initialize DI Container
    this.container = new ServiceContainer()
    ServiceRegistration.configureServices(
        this.container, 
        config, 
        this.sceneManager,  // ← Pass existing instance
        this.appSettings     // ← Pass existing instance
    )
    
    // 4. Initialize other services (Steam, WebXR, Performance, etc.)
    // ...
}
```

**Code Flow** (init method):
```typescript
async init(): Promise<void> {
    // 1. Register SystemUICoordinator (needs runtime dependencies)
    ServiceRegistration.registerSystemUICoordinator(...)
    
    // 2. Initialize DI container
    await this.container.initialize()
    
    // 3. Resolve core services from DI
    this.eventManager = await this.container.resolve(ServiceKeys.EventManager)
    this.sceneCoordinator = await this.container.resolve(ServiceKeys.SceneCoordinator)
    this.steamUICoordinator = await this.container.resolve(ServiceKeys.SteamUICoordinator)
    // ... other coordinators
    
    // 4. Setup event listeners
    this.setupPrerequisiteEventListeners()
    
    // 5. Initialize coordinators
    await this.initializeCoordinators()
    
    // 6. Start render loop
    this.startRenderLoop()
    
    // 7. Auto-load cached user if enabled
    await this.tryAutoLoadCachedUser()
}
```

---

### 3️⃣ Dependency Injection: `ServiceRegistration`

**File**: `client/src/core/di/ServiceRegistration.ts`  
**Purpose**: Configure all services with proper dependency chains  
**Key Responsibilities**:
- Register services in DI container
- Define dependency relationships
- Ensure singleton behavior where needed
- Pass existing instances when appropriate

**Registration Order** (critical for dependencies):

1. **Config** (no dependencies)
   ```typescript
   container.registerInstance(ServiceKeys.AppConfig, config)
   ```

2. **Core Singletons** (no dependencies)
   ```typescript
   container.registerSingleton(ServiceKeys.EventManager, () => EventManager.getInstance())
   container.registerSingleton(ServiceKeys.DataManager, () => DataManager.getInstance(config.data))
   container.registerSingleton(ServiceKeys.AppSettings, () => AppSettings.getInstance())
   ```

3. **Material System** (no dependencies)
   ```typescript
   container.registerSingleton(ServiceKeys.SharedMaterialManager, () => {
       const manager = SharedMaterialManager.getInstance()
       manager.initialize()
       return manager
   })
   ```

4. **Scene Manager** (uses existing instance from App)
   ```typescript
   if (existingSceneManager) {
       container.registerInstance(ServiceKeys.SceneManager, existingSceneManager)
   } else {
       container.registerSingleton(ServiceKeys.SceneManager, () => new SceneManager(config.scene))
   }
   ```

5. **GameBoxRenderer** ⭐ **TARGET COMPONENT**
   ```typescript
   container.registerSingleton(
       ServiceKeys.GameBoxRenderer,
       async (container) => {
           // Resolve dependencies
           const materialManager = await container.resolve(ServiceKeys.SharedMaterialManager)
           const sceneManager = await container.resolve(ServiceKeys.SceneManager)
           
           // Create renderer with config
           return new GameBoxRenderer(
               config.performance?.gameBox?.dimensions,
               config.performance?.gameBox?.performance
           )
       },
       [ServiceKeys.SharedMaterialManager, ServiceKeys.SceneManager]
   )
   ```

6. **StorePropsRenderer** (depends on GameBoxRenderer)
   ```typescript
   container.registerSingleton(
       ServiceKeys.StorePropsRenderer,
       async (container) => {
           const sceneManager = await container.resolve(ServiceKeys.SceneManager)
           const gameBoxRenderer = await container.resolve(ServiceKeys.GameBoxRenderer) // ← Uses GameBoxRenderer
           const dataManager = await container.resolve(ServiceKeys.DataManager)
           
           return new StorePropsRenderer(
               sceneManager.getScene(), 
               dataManager, 
               EventManager.getInstance(),
               gameBoxRenderer // ← Inject GameBoxRenderer
           )
       },
       [ServiceKeys.SceneManager, ServiceKeys.GameBoxRenderer, ServiceKeys.DataManager]
   )
   ```

7. **SceneCoordinator** (depends on StorePropsRenderer)
   ```typescript
   container.registerSingleton(
       ServiceKeys.SceneCoordinator,
       async (container) => {
           const sceneManager = await container.resolve(ServiceKeys.SceneManager)
           const storePropsRenderer = await container.resolve(ServiceKeys.StorePropsRenderer) // ← Uses StorePropsRenderer
           const appSettings = await container.resolve(ServiceKeys.AppSettings)
           const dataManager = await container.resolve(ServiceKeys.DataManager)
           const eventManager = await container.resolve(ServiceKeys.EventManager)
           
           return new SceneCoordinator(
               sceneManager, 
               {}, // config
               storePropsRenderer, // ← Inject StorePropsRenderer
               appSettings,
               dataManager,
               eventManager
           )
       },
       [ServiceKeys.SceneManager, ServiceKeys.StorePropsRenderer, ServiceKeys.AppSettings, ServiceKeys.DataManager, ServiceKeys.EventManager]
   )
   ```

**Dependency Tree**:
```
GameBoxRenderer
  ├── SharedMaterialManager (material creation)
  └── SceneManager (scene access)

StorePropsRenderer
  ├── SceneManager (scene access)
  ├── GameBoxRenderer ⭐ (game box creation)
  ├── DataManager (data storage)
  └── EventManager (event handling)

SceneCoordinator
  ├── SceneManager (scene access)
  ├── StorePropsRenderer (shelf/game spawning)
  ├── AppSettings (configuration)
  ├── DataManager (data storage)
  └── EventManager (event handling)
```

---

### 4️⃣ Scene Orchestrator: `SceneCoordinator`

**File**: `client/src/scene/SceneCoordinator.ts`  
**Purpose**: High-level scene setup and management  
**Key Responsibilities**:
- Setup visual system (skybox, lighting, room)
- Coordinate scene loading phases
- Event-driven shelf spawning (via StorePropsRenderer)
- Emit SceneReady event

**Dependencies**:
- `SceneManager` - Three.js scene access
- `StorePropsRenderer` - Shelf/game spawning 🎯
- `RoomManager` - Room structure
- `LightingRenderer` - Lighting system
- `SkyboxManager` - Skybox rendering
- `AppSettings` - Configuration
- `DataManager` - Data storage
- `EventManager` - Event bus

**Constructor**:
```typescript
constructor(
    sceneManager: SceneManager, 
    config: SceneCoordinatorConfig = {}, 
    storePropsRenderer?: StorePropsRenderer, // ← DI injection
    appSettings?: AppSettings,
    dataManager?: DataManager,
    eventManager?: EventManager
) {
    this.sceneManager = sceneManager
    this.appSettings = appSettings || AppSettings.getInstance()
    this.dataManager = dataManager || DataManager.getInstance()
    this.eventManager = eventManager || EventManager.getInstance()
    
    // Initialize visual renderers
    this.skyboxManager = new SkyboxManager(this.sceneManager.getScene())
    this.lightingRenderer = new LightingRenderer(...)
    this.roomManager = new RoomManager(...)
    
    // Use DI-injected StorePropsRenderer
    this.propsRenderer = storePropsRenderer || new StorePropsRenderer(...)
    
    // Setup scene and emit SceneReady
    this.setupSceneAsPrerequisite(config)
    
    // Register for Steam data loaded events
    this.eventManager.registerEventHandler(
        SteamEventTypes.DataLoaded, 
        (event) => this.onSteamDataLoaded(event.detail)
    )
}
```

**Event-Driven Workflow**:
```typescript
// When Steam games are loaded:
onSteamDataLoaded(eventData: SteamDataLoadedEvent) {
    // 1. Emit room:resize event
    this.eventManager.emit('room:resize', {
        gameCount: eventData.gameCount,
        games: this.getGamesForShelfSpawning()
    })
    
    // 2. RoomManager listens for room:resize, calculates dimensions
    // 3. RoomManager emits room:resized event
    // 4. StorePropsRenderer listens for room:resized
    // 5. StorePropsRenderer spawns shelves and calls GameBoxRenderer
}
```

---

### 5️⃣ Shelf/Game Spawner: `StorePropsRenderer`

**File**: `client/src/scene/StorePropsRenderer.ts`  
**Purpose**: Spawn shelves and game boxes in the scene  
**Key Responsibilities**:
- Listen for room:resized event
- Calculate shelf layout
- Call GameBoxRenderer to create game boxes 🎯
- Position game boxes on shelves

**Dependencies**:
- `THREE.Scene` - Scene to add objects to
- `DataManager` - Game data storage
- `EventManager` - Event bus
- `GameBoxRenderer` ⭐ - Game box creation

**Constructor**:
```typescript
constructor(
    scene: THREE.Scene,
    dataManager?: DataManager,
    eventManager?: EventManager,
    gameBoxRenderer?: GameBoxRenderer // ← DI injection
) {
    this.scene = scene
    this.dataManager = dataManager || DataManager.getInstance()
    this.eventManager = eventManager || EventManager.getInstance()
    this.gameBoxRenderer = gameBoxRenderer // ← Store injected GameBoxRenderer
    
    // Register for room:resized event
    this.eventManager.registerEventHandler('room:resized', (event: any) => {
        this.onRoomResized(event.detail)
    })
}
```

**Event-Driven Workflow**:
```typescript
onRoomResized(eventData: RoomResizedEvent) {
    const games = eventData.games || []
    
    // Calculate shelf layout
    const shelvesNeeded = Math.ceil(games.length / 6)
    
    // Spawn shelves
    for (let i = 0; i < shelvesNeeded; i++) {
        const shelf = this.createShelf(i)
        this.scene.add(shelf)
        
        // Spawn games on this shelf
        const gamesForShelf = games.slice(i * 6, (i + 1) * 6)
        gamesForShelf.forEach((game, index) => {
            const position = this.calculateGamePosition(i, index)
            
            // ⭐ Call GameBoxRenderer to create game box
            const gameBox = this.gameBoxRenderer.createGameBox(
                game,
                position,
                textureOptions,
                `game-${game.name}`
            )
            
            if (gameBox) {
                this.scene.add(gameBox)
            }
        })
    }
}
```

---

### 6️⃣ Game Box Creator: `GameBoxRenderer` ⭐ **TARGET**

**File**: `client/src/scene/GameBoxRenderer.ts`  
**Purpose**: Create and manage game box 3D objects  
**Key Responsibilities**:
- Create game box geometry (Three.js mesh)
- Apply materials (color, texture)
- Position game boxes
- Manage game box lifecycle

**Dependencies**:
- `SharedMaterialManager` - Material creation
- `GameBoxTextureManager` - Texture application
- `GameBoxPerformanceManager` - Performance optimization
- `GameBoxLayoutUtils` - Layout calculations

**Constructor**:
```typescript
constructor(
    dimensions: Partial<GameBoxDimensions> = {},
    performanceConfig: Partial<TexturePerformanceConfig> = {}
) {
    this.dimensions = { width: 0.3, height: 0.4, depth: 0.1, ...dimensions }
    
    // Create geometry (shared by all game boxes)
    this.gameBoxGeometry = new THREE.BoxGeometry(
        this.dimensions.width,
        this.dimensions.height,
        this.dimensions.depth
    )
    
    // Initialize material manager
    this.materialManager = SharedMaterialManager.getInstance()
    this.materialManager.initialize()
    
    // Initialize specialized managers
    if (Object.keys(performanceConfig).length > 0) {
        this.performanceManager = new GameBoxPerformanceManager(performanceConfig)
    }
    this.textureManager = new GameBoxTextureManager(this.performanceManager)
}
```

**Core Method** (called by StorePropsRenderer):
```typescript
createGameBox(
    game: SteamGameData,
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    textureOptions?: GameBoxTextureOptions,
    name?: string
): THREE.Mesh | null {
    // 1. Create material from game name
    const material = this.materialManager.getGameBoxMaterialFromName(game.name)
    
    // 2. Create mesh with shared geometry
    const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
    gameBox.position.copy(position)
    gameBox.name = name || `game-${game.name}`
    
    // 3. Store game data in userData
    gameBox.userData = {
        isGameBox: true,
        gameData: game,
        gameId: game.appid,
        name: game.name,
        playtime: game.playtime_forever
    }
    
    // 4. Enable shadows
    gameBox.castShadow = true
    gameBox.receiveShadow = true
    
    // 5. Apply texture if available (async)
    if (textureOptions) {
        this.textureManager.applyTexture(gameBox, textureOptions)
    }
    
    return gameBox
}
```

**What Happens to the Created Game Box**:
1. `GameBoxRenderer.createGameBox()` returns a `THREE.Mesh` object
2. StorePropsRenderer receives the mesh
3. StorePropsRenderer adds it to the Three.js scene: `this.scene.add(gameBox)`
4. SceneManager's render loop renders all objects in the scene
5. User sees the game box in VR/browser

---

## 🔄 Event Flows - Complete Workflows

### Event Flow 1: Steam Data → Game Boxes on Shelves

**Complete Event Chain**:

```
1. User loads Steam profile (UI input)
   ↓
2. SteamUICoordinator.loadGames(userInput)
   ↓
3. EventManager.emit('steam:load-games')
   ↓
4. SteamWorkflowManager.onLoadGames()
   ↓
5. SteamIntegration.loadGamesForUser()
   ↓
6. SteamApiClient (HTTP calls to Steam API)
   ↓
7. GameLibraryManager (process/cache games)
   ↓
8. DataManager.set('steam.gameCount', count)
   ↓
9. EventManager.emit('steam:data-loaded', { games, gameCount })
   ↓
10. SceneCoordinator listens, emits 'room:resize'
    ↓
11. RoomManager listens, calculates room dimensions
    ↓
12. RoomManager emits 'room:resized' with dimensions and games
    ↓
13. StorePropsRenderer listens, spawns shelves
    ↓
14. For each game:
       StorePropsRenderer calls GameBoxRenderer.createGameBox()
       ↓
       GameBoxRenderer creates THREE.Mesh
       ↓
       StorePropsRenderer adds mesh to scene
    ↓
15. SceneManager render loop displays everything
    ↓
16. User sees game library in VR/browser
```

### Event Flow 2: WebXR Session Start

```
1. User clicks "Enter VR" button (UI input)
   ↓
2. WebXRUICoordinator emits 'webxr:toggle-requested'
   ↓
3. WebXRCoordinator.handleWebXRToggle()
   ↓
4. WebXRManager.startVRSession()
   ↓
5. Browser XR Device API request
   ↓
6. WebXRManager.onSessionStart() callback
   ↓
7. WebXRCoordinator.handleSessionStart()
   ↓
8. EventManager.emit('webxr:session-start')
   ↓
9. WebXREventHandler listens
   ↓
10. WebXRUICoordinator.showSessionUI()
    ↓
11. VR session active, controllers enabled
    ↓
12. InputManager handles VR controller input
    ↓
13. SceneManager renders in VR mode
```

### Event Flow 3: Room Resize (Dynamic Expansion)

```
1. Steam games loaded (from Event Flow 1)
   ↓
2. SceneCoordinator receives 'steam:data-loaded'
   ↓
3. EventManager.emit('room:resize', { gameCount })
   ↓
4. RoomManager.onResizeRoom()
   ↓
5. Calculate dimensions based on game count:
      - Games per shelf = 18 (3 × 6 surfaces)
      - Shelves needed = Math.ceil(games / 18)
      - Width/Depth calculation with clearances
   ↓
6. Reuse existing walls/floor/ceiling if possible
   ↓
7. Create new room structure if needed
   ↓
8. DataManager.set('room.dimensions', dimensions)
   ↓
9. EventManager.emit('room:resized', { dimensions, games })
   ↓
10. StorePropsRenderer.onRoomResized()
    ↓
11. Clear existing shelves
    ↓
12. Spawn new shelves with game boxes
    ↓
13. Room dynamically expanded to fit library
```

### Event Flow 4: Lighting Setup

```
1. SceneCoordinator initialization
   ↓
2. LightingRenderer.setupLighting()
   ↓
3. LightFactory creates ambient light
   ↓
4. LightFactory creates directional light (sun)
   ↓
5. PropRenderer creates ceiling fixtures
   ↓
6. EventManager.emit('room:created', { dimensions })
   ↓
7. LightingRenderer.onRoomCreated()
   ↓
8. Position lights based on room dimensions
   ↓
9. Configure shadow maps based on quality settings
   ↓
10. SceneManager.getRenderer().shadowMap.enabled = true
    ↓
11. Scene illuminated, shadows rendered
```

---

## 🗂️ ALL SYSTEMS - Detailed Breakdown

### SYSTEM 1: Scene Rendering System 🎨

**Purpose**: Create and manage the 3D environment  
**Entry Point**: `SceneCoordinator`  
**Layer**: Orchestration → Rendering

#### Components:

**SceneCoordinator** (Orchestrator)
- **File**: `client/src/scene/SceneCoordinator.ts`
- **Role**: Orchestrate visual system setup in layers
- **Dependencies**: SceneManager, SkyboxManager, LightingRenderer, RoomManager, StorePropsRenderer
- **Key Methods**:
  - `setupSceneAsPrerequisite()` - Initial scene setup
  - `onSteamDataLoaded()` - Trigger room resize when games load
  - Emits: `scene:ready`, `room:resize`

**SceneManager** (Three.js Context)
- **File**: `client/src/scene/SceneManager.ts`
- **Role**: Manage Three.js scene, camera, renderer
- **Dependencies**: THREE, RectAreaLightUniformsLib
- **Key Methods**:
  - `startRenderLoop()` - Main render loop
  - `addToScene()` / `removeFromScene()` - Object management
  - `createFluorescentFixtures()` - Lighting fixtures

**SkyboxManager** (Background)
- **File**: `client/src/scene/SkyboxManager.ts`
- **Role**: Manage skybox/background environment
- **Dependencies**: THREE, TextureLoader
- **Key Methods**:
  - `applySkybox(preset)` - Apply skybox preset
  - Presets: aurora, sunset, stars, etc.

**LightingRenderer** (Illumination)
- **File**: `client/src/scene/LightingRenderer.ts`
- **Role**: Setup all lighting systems
- **Dependencies**: LightFactory, PropRenderer, LightingDebugHelper
- **Key Methods**:
  - `setupLighting()` - Create ambient/directional/fill lights
  - `onRoomCreated()` - Position lights for room size
  - `updateShadowQuality()` - Adjust shadow map resolution
- **Listens**: `room:created`, `room:resized`, `lighting:quality-changed`

**RoomManager** (Room Structure)
- **File**: `client/src/scene/RoomManager.ts`
- **Role**: Create and resize room structure (walls/floor/ceiling)
- **Dependencies**: SharedMaterialManager, PropRenderer
- **Key Methods**:
  - `onResizeRoom()` - Calculate dimensions, rebuild room
  - `createRoomStructure()` - Build walls/floor/ceiling
  - `calculateDimensionsFromGameCount()` - Dynamic sizing
- **Listens**: `room:resize`, `steam:data-loaded`, `ceiling:toggle`
- **Emits**: `room:resized`, `room:created`

**StorePropsRenderer** (Shelf/Game Spawning)
- **File**: `client/src/scene/StorePropsRenderer.ts`
- **Role**: Spawn shelves and game boxes
- **Dependencies**: GameBoxRenderer, DataManager, EventManager
- **Key Methods**:
  - `onRoomResized()` - Spawn shelves with games
  - `createShelf()` - Create shelf structure
  - Calls `GameBoxRenderer.createGameBox()` for each game
- **Listens**: `room:resized`

**GameBoxRenderer** (Game Box Creation)
- **File**: `client/src/scene/GameBoxRenderer.ts`
- **Role**: Create game box 3D meshes
- **Dependencies**: SharedMaterialManager, GameBoxTextureManager
- **Key Methods**:
  - `createGameBox()` - Create mesh with material/texture
  - `createPlaceholderBoxes()` - Demo boxes
  - `dispose()` - Cleanup resources

#### Potential Over-Layering Issues:

⚠️ **StorePropsRenderer → GameBoxRenderer**
- **Question**: Does StorePropsRenderer need to exist as separate class?
- **Current**: StorePropsRenderer calls GameBoxRenderer.createGameBox(), then adds to scene
- **Alternative**: GameBoxRenderer could handle its own scene placement
- **Benefit**: One less layer, simpler code
- **Risk**: Loses separation between "shelf structure" and "game boxes"

⚠️ **SceneCoordinator → Multiple Managers**
- **Question**: Is SceneCoordinator just wiring together subsystems?
- **Current**: Creates SkyboxManager, LightingRenderer, RoomManager, etc.
- **Alternative**: Could these be resolved from DI directly by App?
- **Benefit**: Flatter architecture, less coordinator indirection
- **Risk**: App becomes cluttered with scene details

---

### SYSTEM 2: WebXR System 🥽

**Purpose**: Handle VR/AR sessions and input  
**Entry Point**: `WebXRCoordinator`  
**Layer**: Orchestration → Hardware Interface

#### Components:

**WebXRCoordinator** (Orchestrator)
- **File**: `client/src/webxr/WebXRCoordinator.ts`
- **Role**: Coordinate WebXR session and input management
- **Dependencies**: WebXRManager, InputManager, WebXREventHandler
- **Key Methods**:
  - `setupWebXR()` - Initialize WebXR with renderer
  - `handleWebXRToggle()` - Start VR session
  - `updateCameraMovement()` - Handle input in render loop

**WebXRManager** (Session Lifecycle)
- **File**: `client/src/webxr/WebXRManager.ts`
- **Role**: Manage WebXR session lifecycle
- **Dependencies**: Browser XR Device API
- **Key Methods**:
  - `startVRSession()` - Request VR session from browser
  - `checkCapabilities()` - Detect VR support
  - `onSessionStart/End()` - Session callbacks

**InputManager** (Input Handling)
- **File**: `client/src/webxr/InputManager.ts`
- **Role**: Handle keyboard/mouse/controller input
- **Dependencies**: DOM event listeners
- **Key Methods**:
  - `startListening()` - Setup event listeners
  - `updateCameraMovement()` - Apply WASD/mouse to camera
  - `handleMouseMove()` - Camera rotation

**WebXREventHandler** (Event Routing)
- **File**: `client/src/webxr/WebXREventHandler.ts`
- **Role**: Route WebXR events to UI
- **Dependencies**: WebXRCoordinator, WebXRUICoordinator, EventManager
- **Key Methods**:
  - Listens for `webxr:*` events
  - Calls WebXRUICoordinator UI methods

**WebXRUICoordinator** (VR UI)
- **File**: `client/src/ui/coordinators/WebXRUICoordinator.ts`
- **Role**: Manage VR-specific UI panels
- **Dependencies**: UIManager
- **Key Methods**:
  - `showSessionUI()` - Show VR session controls
  - `hideSessionUI()` - Hide VR UI

#### Potential Over-Layering Issues:

⚠️ **WebXRCoordinator → WebXRManager → XR API**
- **Question**: Why separate Coordinator and Manager?
- **Current**: Coordinator wraps Manager, Manager wraps XR API
- **Alternative**: Coordinator could directly call XR API
- **Benefit**: One less indirection layer
- **Risk**: Coordinator becomes more complex

⚠️ **WebXREventHandler as separate class**
- **Question**: Could event routing be in WebXRCoordinator?
- **Current**: Separate class just for event routing
- **Alternative**: WebXRCoordinator emits events directly to UI
- **Benefit**: Simpler, less files
- **Risk**: Loses clear event routing abstraction

---

### SYSTEM 3: Steam Integration System 🎮

**Purpose**: Load and manage Steam game library  
**Entry Point**: `SteamWorkflowManager`  
**Layer**: Orchestration → API → Data

#### Components:

**SteamWorkflowManager** (Workflow Orchestrator)
- **File**: `client/src/steam-integration/SteamWorkflowManager.ts`
- **Role**: Orchestrate Steam workflows with progress tracking
- **Dependencies**: SteamIntegration, SceneCoordinator, SteamUICoordinator, DataManager
- **Key Methods**:
  - `onLoadGames()` - Handle load games workflow
  - `onLoadFromCache()` - Load cached games
  - `onRefreshCache()` - Refresh cache
  - `storeSteamDataAndEmitEvent()` - Store data, emit event
- **Listens**: `steam:load-games`, `steam:load-from-cache`, `steam:cache-*`, `steam:dev-mode-toggle`
- **Emits**: `steam:data-loaded`

**SteamIntegration** (API Orchestrator)
- **File**: `client/src/steam-integration/SteamIntegration.ts`
- **Role**: High-level Steam API orchestration
- **Dependencies**: SteamApiClient, GameLibraryManager
- **Key Methods**:
  - `loadGamesForUser()` - Progressive game loading
  - `getCachedUsers()` - Get cached user list
  - `getGameLibraryState()` - Get current game state

**SteamApiClient** (HTTP Client)
- **File**: `client/src/steam/SteamApiClient.ts`
- **Role**: Make HTTP calls to Steam Web API proxy
- **Dependencies**: Fetch API
- **Key Methods**:
  - `resolveUser()` - Resolve vanity URL → Steam ID
  - `getOwnedGames()` - Fetch user's games
  - `getGameDetails()` - Fetch individual game details

**GameLibraryManager** (Game State/Cache)
- **File**: `client/src/steam-integration/GameLibraryManager.ts`
- **Role**: Manage game library state and caching
- **Dependencies**: Browser Cache API
- **Key Methods**:
  - `processGame()` - Transform Steam API → SteamGameData
  - `cacheUser()` - Cache user data
  - `loadFromCache()` - Load cached data

**SteamUICoordinator** (UI Feedback)
- **File**: `client/src/ui/coordinators/SteamUICoordinator.ts`
- **Role**: Provide UI feedback for Steam operations
- **Dependencies**: EventManager, UIManager
- **Key Methods**:
  - `loadGames()` - Emit load games event
  - `setDevMode()` - Toggle dev mode
  - Emits: `steam:load-games`, `steam:dev-mode-toggle`

#### Data Flow:
```
User Input → SteamUICoordinator → EventManager → SteamWorkflowManager 
→ SteamIntegration → SteamApiClient → HTTP → Steam API
→ GameLibraryManager (cache) → DataManager (state)
→ EventManager.emit('steam:data-loaded')
→ SceneCoordinator → RoomManager → StorePropsRenderer → GameBoxRenderer
```

#### Potential Over-Layering Issues:

⚠️ **SteamWorkflowManager → SteamIntegration → SteamApiClient**
- **Question**: Why 3 layers for API calls?
- **Current**: WorkflowManager orchestrates, Integration manages state, ApiClient makes calls
- **Alternative**: Could combine WorkflowManager + Integration
- **Benefit**: Less indirection
- **Risk**: Single class becomes large

⚠️ **Event-driven for simple operations**
- **Question**: Do we need events for every Steam operation?
- **Current**: `steam:load-games`, `steam:cache-clear`, `steam:dev-mode-toggle`, etc.
- **Alternative**: Direct method calls for simple operations
- **Benefit**: Simpler code, less event overhead
- **Risk**: Loses event-driven consistency

---

### SYSTEM 4: UI System 💻

**Purpose**: Manage user interface and feedback  
**Entry Point**: `UIManager` + Coordinators  
**Layer**: Orchestration → UI Components

#### Components:

**UIManager** (Panel Registry)
- **File**: `client/src/ui/UIManager.ts`
- **Role**: Central registry for UI panels
- **Dependencies**: None (self-contained)
- **Key Methods**:
  - `registerPanel()` - Register UI panel
  - `showPanel()` / `hidePanel()` - Panel visibility
  - `showLoading()` / `hideLoading()` - Loading screen

**SteamUICoordinator** (Steam UI)
- **File**: `client/src/ui/coordinators/SteamUICoordinator.ts`
- **Role**: Steam-specific UI workflows
- **Dependencies**: EventManager, UIManager
- **Key Methods**:
  - `loadGames()` - Trigger load games workflow
  - `setDevMode()` - Toggle dev mode
  - Emits events for workflows

**WebXRUICoordinator** (VR UI)
- **File**: `client/src/ui/coordinators/WebXRUICoordinator.ts`
- **Role**: VR session UI management
- **Dependencies**: UIManager
- **Key Methods**:
  - `showSessionUI()` - Show VR controls
  - `hideSessionUI()` - Hide VR UI

**SystemUICoordinator** (System UI)
- **File**: `client/src/ui/coordinators/SystemUICoordinator.ts`
- **Role**: System-level UI (pause menu, performance, debug)
- **Dependencies**: PerformanceMonitor, DebugStatsProvider, PauseMenuManager
- **Key Methods**:
  - `init()` - Setup system UI
  - Manages pause menu, performance stats, debug panels

**PauseMenuManager** (Pause Menu)
- **File**: `client/src/ui/pause/PauseMenuManager.ts`
- **Role**: Manage pause menu panels and tabs
- **Dependencies**: Panel implementations (GraphicsPanel, GamePanel, etc.)
- **Key Methods**:
  - `show()` / `hide()` - Menu visibility
  - `registerPanel()` - Add panel to menu
  - Tab switching logic

**PerformanceMonitor** (Performance Stats)
- **File**: `client/src/ui/PerformanceMonitor.ts`
- **Role**: Display FPS, memory, draw calls
- **Dependencies**: DOM
- **Key Methods**:
  - `start()` / `stop()` - Monitoring
  - `getStats()` - Get current stats
  - Updates UI every frame

**ToastManager** (Notifications)
- **File**: `client/src/ui/ToastManager.ts`
- **Role**: Display toast notifications
- **Dependencies**: DOM
- **Key Methods**:
  - `success()` / `error()` / `info()` - Show toast
  - Auto-dismiss after timeout

#### Potential Over-Layering Issues:

⚠️ **Three UI Coordinators (Steam, WebXR, System)**
- **Question**: Do we need separate coordinators for each UI domain?
- **Current**: Each coordinator handles one UI domain
- **Alternative**: Could merge into single UICoordinator
- **Benefit**: Less coordinator classes
- **Risk**: Single class becomes large and unfocused

✅ **UIManager + Coordinators is GOOD**
- **Reason**: UIManager is registry, Coordinators are workflow-specific
- **Keep**: This separation works well

---

### SYSTEM 5: Material System 🎨

**Purpose**: Manage shared materials and textures  
**Entry Point**: `SharedMaterialManager`  
**Layer**: Utilities → Caching

#### Components:

**SharedMaterialManager** (Material Pooling)
- **File**: `client/src/utils/SharedMaterialManager.ts`
- **Role**: Pool materials to reduce duplication (95% memory reduction)
- **Dependencies**: WoodMaterialGenerator, CarpetMaterialGenerator, CeilingMaterialGenerator
- **Key Methods**:
  - `initialize()` - Create material pool
  - `getGameBoxMaterialFromName()` - Get game box material (hue-based)
  - `getShelfMaterial()` - Get shelf material
  - `getCarpetMaterial()` / `getCeilingMaterial()` - Get environment materials

**WoodMaterialGenerator** (Shelf Materials)
- **File**: `client/src/utils/materials/WoodMaterialGenerator.ts`
- **Role**: Generate wood materials for shelves
- **Dependencies**: TextureLoader, WoodTextureGenerator
- **Key Methods**:
  - `createMDFVeneerMaterial()` - MDF with veneer
  - `createShelfInteriorMaterial()` - White glossy interior
  - `createBrandAccentMaterial()` - Blue accent posts

**CarpetMaterialGenerator** (Floor Materials)
- **File**: `client/src/utils/materials/CarpetMaterialGenerator.ts`
- **Role**: Generate carpet/floor materials
- **Dependencies**: TextureLoader
- **Key Methods**:
  - `createCommercialCarpetMaterial()` - Store carpet

**CeilingMaterialGenerator** (Ceiling Materials)
- **File**: `client/src/utils/materials/CeilingMaterialGenerator.ts`
- **Role**: Generate ceiling materials
- **Dependencies**: TextureLoader
- **Key Methods**:
  - `createPopcornCeilingMaterial()` - Acoustic tile ceiling

**MaterialUtils** (Utilities)
- **File**: `client/src/utils/MaterialUtils.ts`
- **Role**: Helper utilities for materials
- **Key Methods**:
  - `createGameBoxMaterials()` - Create placeholder materials

#### Material Pool Impact:
- **Before**: ~2,500+ material instances (one per object)
- **After**: ~50 pooled instances
- **Memory**: 95% reduction
- **Draw Calls**: Enables batching

#### Potential Over-Layering Issues:

✅ **Material system is WELL DESIGNED**
- **Reason**: Clear separation (Manager → Generators → Utils)
- **Keep**: This architecture is optimal

---

### SYSTEM 6: Data/Event Infrastructure 💾📡

**Purpose**: Centralized state and event bus  
**Entry Point**: `EventManager`, `DataManager`, `AppSettings`  
**Layer**: Infrastructure (shared by all systems)

#### Components:

**EventManager** (Event Bus)
- **File**: `client/src/core/EventManager.ts`
- **Role**: Application-wide event bus
- **Pattern**: Singleton (global event bus)
- **Key Methods**:
  - `emit(eventType, data)` - Emit event
  - `registerEventHandler(eventType, handler)` - Listen for events
  - `dispose()` - Cleanup all listeners

**DataManager** (Centralized State)
- **File**: `client/src/core/data/DataManager.ts`
- **Role**: Centralized key-value storage with domains
- **Pattern**: Singleton (global state)
- **Key Methods**:
  - `set(key, value, options)` - Store data
  - `get(key)` - Retrieve data
  - `getByDomain(domain)` - Get all data for domain
  - `clear()` - Clear all data

**AppSettings** (Configuration)
- **File**: `client/src/core/AppSettings.ts`
- **Role**: Application configuration and user preferences
- **Pattern**: Singleton (global config)
- **Key Methods**:
  - `getSetting(key)` - Get setting value
  - `updateSetting(key, value)` - Update setting
  - `resetToDefaults()` - Reset all settings

#### Event Types:
- **Steam Events**: `steam:load-games`, `steam:data-loaded`, `steam:cache-*`
- **Room Events**: `room:create`, `room:resize`, `room:resized`, `room:created`
- **WebXR Events**: `webxr:session-start`, `webxr:session-end`, `webxr:toggle-requested`
- **Game Events**: `game:start`, `scene:ready`
- **Ceiling Events**: `ceiling:toggle`
- **Lighting Events**: `lighting:toggle`, `lighting:quality-changed`

#### Data Domains:
- **SteamIntegration**: Steam game data
- **WebXR**: VR session data
- **Performance**: Performance metrics
- **Settings**: User preferences

#### Potential Over-Layering Issues:

✅ **Infrastructure is WELL DESIGNED**
- **Reason**: Singletons are appropriate for global state/events
- **Keep**: This architecture is optimal
- **Note**: Global singletons acceptable for infrastructure

---

## 🎯 Key Architectural Patterns

### 1. **Dependency Injection (DI)**
- All services registered in `ServiceContainer`
- Dependencies resolved automatically
- Singletons shared across application
- Testability through mock injection

### 2. **Event-Driven Architecture**
- Components communicate via `EventManager`
- Loose coupling between subsystems
- Asynchronous workflows
- Examples: `steam:data-loaded`, `room:resized`, `scene:ready`

### 3. **Composition Over Inheritance**
- GameBoxRenderer uses specialized managers:
  - `GameBoxTextureManager` - Texture handling
  - `GameBoxPerformanceManager` - Performance optimization
  - `SharedMaterialManager` - Material creation
- Each manager has single responsibility

### 4. **Service Locator Pattern (Limited Use)**
- UI components use `getInstance()` for simplicity
- Core services use DI for testability
- Fallbacks for backward compatibility

### 5. **Orchestrator Pattern**
- `SteamBrickAndMortarApp` - Top-level orchestrator
- `SceneCoordinator` - Scene setup orchestrator
- `WebXRCoordinator` - VR/input orchestrator
- Coordinators delegate to specialized renderers

---

## 📝 Complete Component Reference (All Systems)

| System | Component | Purpose | Layer | Files |
|--------|-----------|---------|-------|-------|
| **Entry** | `main.ts` | Application bootstrap | Entry | 1 |
| **Entry** | `SteamBrickAndMortarApp` | Top-level orchestrator | Orchestration | 1 |
| **Infrastructure** | `ServiceContainer` | DI resolution | Infrastructure | 1 |
| **Infrastructure** | `ServiceRegistration` | DI configuration | Infrastructure | 1 |
| **Infrastructure** | `EventManager` | Event bus | Infrastructure | 1 |
| **Infrastructure** | `DataManager` | Centralized state | Infrastructure | 1 |
| **Infrastructure** | `AppSettings` | Configuration | Infrastructure | 1 |
| **Scene System** | `SceneCoordinator` | Scene orchestrator | Orchestration | 1 |
| **Scene System** | `SceneManager` | Three.js context | Rendering | 1 |
| **Scene System** | `SkyboxManager` | Background environment | Rendering | 1 |
| **Scene System** | `LightingRenderer` | Illumination system | Rendering | 1 |
| **Scene System** | `LightFactory` | Light creation | Utilities | 1 |
| **Scene System** | `RoomManager` | Room structure | Rendering | 1 |
| **Scene System** | `StorePropsRenderer` | Shelf/game spawning | Rendering | 1 |
| **Scene System** | `GameBoxRenderer` | Game box creation | Rendering | 1 |
| **Scene System** | `PropRenderer` | Atmospheric props | Rendering | 1 |
| **WebXR System** | `WebXRCoordinator` | VR/input orchestrator | Orchestration | 1 |
| **WebXR System** | `WebXRManager` | Session lifecycle | Hardware | 1 |
| **WebXR System** | `InputManager` | Input handling | Hardware | 1 |
| **WebXR System** | `WebXREventHandler` | Event routing | Orchestration | 1 |
| **Steam System** | `SteamWorkflowManager` | Workflow orchestrator | Orchestration | 1 |
| **Steam System** | `SteamIntegration` | API orchestrator | API | 1 |
| **Steam System** | `SteamApiClient` | HTTP client | API | 1 |
| **Steam System** | `GameLibraryManager` | Game state/cache | Data | 1 |
| **UI System** | `UIManager` | Panel registry | Infrastructure | 1 |
| **UI System** | `SteamUICoordinator` | Steam UI | Orchestration | 1 |
| **UI System** | `WebXRUICoordinator` | VR UI | Orchestration | 1 |
| **UI System** | `SystemUICoordinator` | System UI | Orchestration | 1 |
| **UI System** | `PauseMenuManager` | Pause menu | UI | 1 |
| **UI System** | `PerformanceMonitor` | Performance stats | UI | 1 |
| **UI System** | `ToastManager` | Notifications | UI | 1 |
| **Material System** | `SharedMaterialManager` | Material pooling | Utilities | 1 |
| **Material System** | `WoodMaterialGenerator` | Shelf materials | Utilities | 1 |
| **Material System** | `CarpetMaterialGenerator` | Floor materials | Utilities | 1 |
| **Material System** | `CeilingMaterialGenerator` | Ceiling materials | Utilities | 1 |

**Total Core Components**: 37 classes  
**Total Orchestrators/Coordinators**: 8 classes  
**Potential Layering Issues**: 4 areas flagged

---

## 🔍 Layering Analysis - Potential Simplifications

### Issue 1: Scene Rendering - Too Many Layers?

**Current Flow**: App → SceneCoordinator → StorePropsRenderer → GameBoxRenderer

**Question**: Is SceneCoordinator necessary, or just wiring?

**Analysis**:
```
SceneCoordinator
├── Creates: SkyboxManager, LightingRenderer, RoomManager, StorePropsRenderer
├── Orchestrates: setupScene(), onSteamDataLoaded()
└── Emits: scene:ready, room:resize

Alternative: App could resolve these from DI directly
```

**Recommendation**: 
- ✅ **Keep** for now - SceneCoordinator provides clear "scene setup workflow"
- SceneCoordinator orchestrates **initialization sequence** (skybox → lighting → room → props)
- Without it, App becomes cluttered with scene details

### Issue 2: StorePropsRenderer - Unnecessary Layer?

**Current Flow**: StorePropsRenderer → GameBoxRenderer.createGameBox() → scene.add()

**Question**: Why not let GameBoxRenderer handle scene placement?

**Analysis**:
```typescript
// Current (2 layers)
class StorePropsRenderer {
  onRoomResized() {
    const gameBox = this.gameBoxRenderer.createGameBox(game, position)
    this.scene.add(gameBox)  // ← StorePropsRenderer adds to scene
  }
}

// Alternative (1 layer)
class GameBoxRenderer {
  createGameBoxInScene(scene, game, position) {
    const gameBox = this.createGameBox(game, position)
    scene.add(gameBox)  // ← GameBoxRenderer adds to scene
  }
}
```

**Pros of Current Approach**:
- GameBoxRenderer is pure mesh factory (no scene coupling)
- StorePropsRenderer handles shelf structure + game placement
- Clear separation: "create mesh" vs "place in scene"

**Cons of Current Approach**:
- Extra layer of indirection
- StorePropsRenderer mostly just calls GameBoxRenderer and adds result

**Recommendation**:
- ⚠️ **CONSIDER MERGING** - Merge StorePropsRenderer responsibilities into GameBoxRenderer
- GameBoxRenderer could handle both mesh creation AND scene placement
- Would eliminate one layer without losing much clarity
- **TODO**: Evaluate if shelf structure logic warrants separate class

### Issue 3: WebXR - Coordinator AND Manager?

**Current Flow**: WebXRCoordinator → WebXRManager → XR Device API

**Question**: Why two layers before hardware?

**Analysis**:
```
WebXRCoordinator
├── Wraps: WebXRManager, InputManager
├── Adds: updateCameraMovement(), callbacks
└── Purpose: "Complete WebXR functionality"

WebXRManager
├── Wraps: Browser XR Device API
└── Purpose: "Session lifecycle"

Alternative: WebXRCoordinator could call XR API directly
```

**Pros of Current Approach**:
- WebXRManager isolates browser API (testable mock)
- WebXRCoordinator adds input + event routing

**Cons of Current Approach**:
- Two thin wrappers around browser API
- Coordinator doesn't add much beyond Manager

**Recommendation**:
- ⚠️ **CONSIDER MERGING** - Merge WebXRManager into WebXRCoordinator
- Single class handling: session lifecycle, input, events
- Would eliminate wrapper-around-wrapper pattern
- **TODO**: Evaluate if session lifecycle isolation is worth separate class

### Issue 4: Steam - THREE layers to API?

**Current Flow**: SteamWorkflowManager → SteamIntegration → SteamApiClient → HTTP

**Question**: Why three layers before network call?

**Analysis**:
```
SteamWorkflowManager (Layer 1: Workflow)
├── Handles: Events, progress callbacks, UI updates
├── Dependencies: SteamIntegration, SceneCoordinator, SteamUICoordinator
└── Role: "Orchestrate Steam workflows"

SteamIntegration (Layer 2: API Orchestration)
├── Handles: Progressive loading, cache management
├── Dependencies: SteamApiClient, GameLibraryManager
└── Role: "High-level Steam API orchestration"

SteamApiClient (Layer 3: HTTP)
├── Handles: Fetch calls to Steam API
└── Role: "HTTP client"

Alternative: Merge WorkflowManager + Integration into one class
```

**Pros of Current Approach**:
- Clear separation: workflow vs API vs HTTP
- Each layer has distinct responsibility

**Cons of Current Approach**:
- Three classes for what could be one
- WorkflowManager mostly delegates to Integration

**Recommendation**:
- ⚠️ **CONSIDER MERGING** - Merge SteamWorkflowManager + SteamIntegration
- Keep SteamApiClient separate (pure HTTP client)
- Combined class: SteamManager (handles workflows + API orchestration)
- Would go from 3 layers → 2 layers
- **TODO**: Evaluate if workflow/API separation provides value

### Issue 5: Event-Driven for Simple Operations

**Current Pattern**: Everything uses events, even simple operations

**Examples**:
```typescript
// Simple dev mode toggle - needs event?
steamUICoordinator.setDevMode(true)
  → eventManager.emit('steam:dev-mode-toggle')
  → steamWorkflowManager.onDevModeToggle()
  → localStorage.setItem('steam-dev-mode', 'true')

// Alternative: Direct call
steamWorkflowManager.setDevMode(true) // ← Just do it
```

**Analysis**:
- Events add overhead for simple operations
- Events are GOOD for: complex workflows, multiple listeners
- Events are OVERKILL for: simple setters, one-to-one calls

**Recommendation**:
- ⚠️ **MIX APPROACHES** - Use events for workflows, direct calls for simple ops
- Keep events for: Steam game loading, room resizing, WebXR sessions
- Use direct calls for: Dev mode toggle, simple settings, cache clear
- **TODO**: Audit all events, identify candidates for direct calls

---

## 🎯 Layering Summary

| System | Current Layers | Potential Issue | Recommendation |
|--------|---------------|-----------------|----------------|
| Scene Rendering | 4 (App → Coord → Props → GameBox) | SceneCoordinator may be just wiring | ✅ Keep - orchestrates init sequence |
| Scene Rendering | 2 (Props → GameBox) | StorePropsRenderer thin wrapper? | ⚠️ Consider merging into GameBoxRenderer |
| WebXR | 2 (Coord → Manager) | Two wrappers around browser API | ⚠️ Consider merging Manager into Coordinator |
| Steam | 3 (Workflow → Integration → Client) | Too many layers to API? | ⚠️ Consider merging Workflow + Integration |
| Material System | 2 (Manager → Generators) | Clean separation | ✅ Keep - well designed |
| UI System | 2 (Manager → Coordinators) | Clean separation | ✅ Keep - works well |
| Infrastructure | 1 (Direct) | Global singletons | ✅ Keep - appropriate for infrastructure |

**Layering Health**: 🟢 **Generally Good** with 4 areas for potential simplification

**Next Steps**:
1. Evaluate StorePropsRenderer merge (HIGH priority - easy win)
2. Evaluate WebXR merge (MEDIUM priority)
3. Evaluate Steam merge (MEDIUM priority)
4. Audit event usage (LOW priority - incremental improvement)

---

## 🎯 Key Architectural Patterns

---

## 🧪 Testing Implications

### How to Test GameBoxRenderer
```typescript
// Unit test (isolated)
const renderer = new GameBoxRenderer()
const gameBox = renderer.createGameBox(mockGame, new THREE.Vector3(0, 1, 0))
expect(gameBox).toBeTruthy()

// Integration test (with DI)
const container = await createSceneTestContainer()
const renderer = await container.resolve(ServiceKeys.GameBoxRenderer)
const gameBox = renderer.createGameBox(mockGame, new THREE.Vector3(0, 1, 0))
expect(gameBox).toBeTruthy()
```

### How to Test StorePropsRenderer
```typescript
const container = await createSceneTestContainer()
const propsRenderer = await container.resolve(ServiceKeys.StorePropsRenderer)

// Emit room:resized event
eventManager.emit('room:resized', {
    dimensions: { width: 22, depth: 16, height: 3.2 },
    games: [mockGame1, mockGame2]
})

// Verify game boxes were spawned
const gameBoxes = scene.children.filter(obj => obj.userData.isGameBox)
expect(gameBoxes.length).toBe(2)
```

---

## 🔍 Finding Code References

### Search Patterns
```bash
# Find where GameBoxRenderer is instantiated
grep -r "new GameBoxRenderer" client/src

# Find where GameBoxRenderer.createGameBox is called
grep -r "createGameBox" client/src

# Find DI registrations
grep -r "ServiceKeys.GameBoxRenderer" client/src

# Find event emissions
grep -r "room:resized" client/src
```

### Key Files to Understand Full Flow
1. `client/src/main.ts` - Entry point
2. `client/src/core/SteamBrickAndMortarApp.ts` - App orchestrator
3. `client/src/core/di/ServiceRegistration.ts` - DI configuration
4. `client/src/scene/SceneCoordinator.ts` - Scene orchestrator
5. `client/src/scene/StorePropsRenderer.ts` - Shelf spawner
6. `client/src/scene/GameBoxRenderer.ts` - Game box creator ⭐

---

## 📚 Related Documentation

- **DI Architecture**: `docs/active/dependency-injection-cleanup-tasks.md`
- **WebXR Architecture**: `docs/architecture/webxr-architecture.md`
- **Test DI Migration**: `docs/active/test-di-migration-progress.md`
- **Current Roadmap**: `docs/active/roadmap.md`

---

## 📊 Architecture Health Report

### Strengths ✅

1. **Dependency Injection (DI) System**
   - Clean service registration via ServiceContainer
   - Proper singleton management
   - Testable architecture with mock injection
   - ✅ **Grade: A**

2. **Event-Driven Architecture**
   - Clear event types and handlers
   - Loose coupling between systems
   - Asynchronous workflows
   - ✅ **Grade: A-** (could use fewer events for simple operations)

3. **Material System**
   - 95% memory reduction via pooling
   - Clear separation: Manager → Generators → Utils
   - Excellent resource management
   - ✅ **Grade: A+**

4. **Infrastructure (EventManager, DataManager, AppSettings)**
   - Appropriate use of singletons
   - Clear global state management
   - Well-designed APIs
   - ✅ **Grade: A**

### Areas for Improvement ⚠️

1. **Scene Rendering System - Potential Over-Layering**
   - Issue: StorePropsRenderer → GameBoxRenderer (thin wrapper?)
   - Impact: Extra indirection without clear benefit
   - Fix: Consider merging StorePropsRenderer into GameBoxRenderer
   - Priority: **HIGH** (easy simplification)
   - ⚠️ **Grade: B**

2. **WebXR System - Wrapper Layers**
   - Issue: WebXRCoordinator → WebXRManager → XR API (two wrappers)
   - Impact: Indirection without isolation benefit
   - Fix: Merge WebXRManager into WebXRCoordinator
   - Priority: **MEDIUM**
   - ⚠️ **Grade: B**

3. **Steam System - Three Layers to API**
   - Issue: SteamWorkflowManager → SteamIntegration → SteamApiClient (3 layers)
   - Impact: Workflow and Integration layers overlap
   - Fix: Merge WorkflowManager + Integration into SteamManager
   - Priority: **MEDIUM**
   - ⚠️ **Grade: B-**

4. **Event Overuse**
   - Issue: Events used for simple one-to-one operations (dev mode toggle, cache clear)
   - Impact: Overhead without benefit
   - Fix: Use direct method calls for simple operations
   - Priority: **LOW** (incremental improvement)
   - ⚠️ **Grade: B**

### Overall Architecture Grade: **B+**

**Summary**: 
- Strong foundations (DI, materials, infrastructure)
- Good separation of concerns
- 4 areas with unnecessary layering
- Easy wins available for simplification

---

## 🎯 Recommended Actions (Priority Order)

### 1. HIGH Priority: Merge StorePropsRenderer into GameBoxRenderer
**Effort**: 2-4 hours  
**Impact**: HIGH - Eliminates one layer, simplifies scene rendering

**Why**:
- StorePropsRenderer mostly delegates to GameBoxRenderer
- GameBoxRenderer is mature enough to handle scene placement
- Shelf structure logic can live in GameBoxRenderer

**Implementation**:
```typescript
// After merge
class GameBoxRenderer {
  // Existing: createGameBox()
  
  // New: Handle shelf spawning directly
  spawnGamesOnShelf(scene, games, shelfPosition) {
    games.forEach((game, index) => {
      const position = this.calculatePosition(shelfPosition, index)
      const gameBox = this.createGameBox(game, position)
      scene.add(gameBox)
    })
  }
}
```

### 2. MEDIUM Priority: Merge WebXRManager into WebXRCoordinator
**Effort**: 3-5 hours  
**Impact**: MEDIUM - Simplifies WebXR system

**Why**:
- Two thin wrappers around browser XR API
- WebXRManager doesn't provide enough isolation to warrant separate class
- WebXRCoordinator can directly call XR Device API

### 3. MEDIUM Priority: Merge SteamWorkflowManager + SteamIntegration
**Effort**: 4-6 hours  
**Impact**: MEDIUM - Simplifies Steam system

**Why**:
- Workflow and API orchestration overlap
- Combined class can handle both responsibilities
- Keep SteamApiClient separate (pure HTTP client)

**Result**: 3 layers → 2 layers (SteamManager → SteamApiClient)

### 4. LOW Priority: Audit Event Usage
**Effort**: Ongoing  
**Impact**: LOW - Incremental improvement

**Why**:
- Some events are overkill for simple operations
- Mix events (for workflows) with direct calls (for simple ops)

**Examples to Convert**:
- `steam:dev-mode-toggle` → direct call
- `steam:cache-clear` → direct call
- Keep events for: game loading, room resizing, WebXR sessions

---

## 📈 Expected Impact of Simplifications

| Change | Before | After | Benefit |
|--------|--------|-------|---------|
| Merge StorePropsRenderer | 2 layers (Props → GameBox) | 1 layer (GameBox) | -1 class, cleaner code |
| Merge WebXRManager | 2 layers (Coord → Manager) | 1 layer (Coord) | -1 class, less indirection |
| Merge Steam layers | 3 layers (Workflow → Integration → Client) | 2 layers (Manager → Client) | -1 class, clearer flow |
| Reduce events | All operations use events | Mix events + direct calls | Less overhead, simpler code |

**Total Potential Reduction**: 37 classes → 34 classes (-8% complexity)

---

## 📚 Related Documentation

- **DI Architecture**: `docs/active/dependency-injection-cleanup-tasks.md`
- **WebXR Architecture**: `docs/architecture/webxr-architecture.md`
- **Test DI Migration**: `docs/active/test-di-migration-progress.md`
- **Current Roadmap**: `docs/active/roadmap.md`
- **Design Philosophy**: `docs/design-philosophy.md`

---

## 🎓 Key Takeaways

### What Works Well ✅
1. **Dependency Injection** - Clean, testable, proper singleton management
2. **Material Pooling** - 95% memory reduction, excellent resource management
3. **Event-Driven Core** - Good for complex workflows and loose coupling
4. **Infrastructure Singletons** - Appropriate use of global state

### What Could Be Simpler ⚠️
1. **Scene Rendering** - One too many layers (StorePropsRenderer unnecessary)
2. **WebXR System** - Two wrappers around browser API (merge opportunity)
3. **Steam System** - Three layers to HTTP (workflow/integration overlap)
4. **Event Usage** - Some events overkill for simple operations

### Architectural Philosophy
- **Composition over inheritance** ✅ (consistently applied)
- **Single Responsibility Principle** ✅ (mostly followed)
- **Dependency Injection** ✅ (well implemented)
- **Event-Driven Architecture** ⚠️ (slightly overused)
- **Separation of Concerns** ⚠️ (occasionally creates extra layers)

### Final Assessment
**Architecture Quality**: 🟢 **Good** (B+ grade)  
**Maintainability**: 🟢 **High** (clear structure, good documentation)  
**Performance**: 🟢 **Excellent** (material pooling, efficient rendering)  
**Testability**: 🟢 **High** (DI enables mocking)  
**Simplification Potential**: 🟡 **Medium** (4 areas identified, easy wins available)

---

**Status**: ✅ **Complete - All Systems Documented**  
**Last Updated**: January 15, 2025  
**Total Components Mapped**: 37 classes across 6 systems  
**Layering Issues Identified**: 4 areas with simplification opportunities  
**Overall Architecture**: Strong foundations with room for targeted simplifications
