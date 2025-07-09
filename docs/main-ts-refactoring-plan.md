# Steam Brick and Mortar - Main.ts Refactoring Plan

## Current Problems

The current `main.ts` is a **900+ line monolithic class** that violates single responsibility principle by handling:

1. **WebXR Setup & Management** (~150 lines)
2. **Three.js Scene Management** (~200 lines) 
3. **Steam API Integration** (~200 lines)
4. **UI Management** (~150 lines)
5. **Game Box Rendering** (~150 lines)
6. **Input Handling** (~100 lines)

This makes it difficult to:
- Test individual components
- Maintain and debug specific features
- Reuse components in other contexts
- Understand the codebase for new contributors

## Proposed Architecture

### Core Principle: **Separation of Concerns**

Break the monolith into focused, composable modules that each handle one primary responsibility.

## Module Breakdown

### 1. **Core Application** (`src/core/`)

#### `SteamBrickAndMortarApp.ts` (New main entry point)
**Responsibility**: Application orchestration and lifecycle management
- Initialize and coordinate all subsystems
- Handle app-level error boundaries
- Manage app state transitions
- ~100 lines

```typescript
class SteamBrickAndMortarApp {
  private sceneManager: SceneManager
  private webxrManager: WebXRManager
  private uiManager: UIManager
  private steamIntegration: SteamIntegration
  
  async init() {
    // Coordinate initialization of all subsystems
  }
}
```

### 2. **WebXR Management** (`src/webxr/`)

#### `WebXRManager.ts`
**Responsibility**: WebXR session and capability management
- Detect WebXR support
- Handle VR session lifecycle
- Manage XR button states
- ~150 lines

#### `InputManager.ts` 
**Responsibility**: Handle all input (mouse, keyboard, controllers)
- Desktop mouse/keyboard controls
- VR controller input
- Movement and interaction logic
- ~100 lines

### 3. **Scene Management** (`src/scene/`)

#### `SceneManager.ts`
**Responsibility**: Three.js scene setup and management
- Scene initialization
- Lighting setup
- Camera management
- Render loop coordination
- ~100 lines

#### `AssetLoader.ts`
**Responsibility**: 3D asset loading and management
- GLTF model loading
- Asset caching
- Loading progress tracking
- ~80 lines

#### `GameBoxRenderer.ts`
**Responsibility**: Game box 3D object management
- Create and position game boxes
- Handle game box animations
- Manage placeholder vs real game boxes
- ~120 lines

### 4. **Steam Integration** (`src/steam-integration/`)

#### `SteamIntegration.ts`
**Responsibility**: High-level Steam game library integration
- Orchestrate Steam API calls
- Manage progressive loading workflow
- Handle Steam data transformation
- ~100 lines

#### `GameLibraryManager.ts`
**Responsibility**: Game library state management
- Track current game data
- Handle sorting and filtering
- Manage game selection state
- ~80 lines

### 5. **UI Management** (`src/ui/`)

#### `UIManager.ts`
**Responsibility**: Overall UI coordination
- Initialize all UI components
- Coordinate UI state changes
- Handle UI events routing
- ~60 lines

#### `SteamUIPanel.ts`
**Responsibility**: Steam-specific UI controls
- Steam input form
- Load/refresh/cache buttons
- Steam status display
- ~100 lines

#### `ProgressDisplay.ts`
**Responsibility**: Loading progress UI
- Progress bar management
- Loading message display
- Progress animation
- ~60 lines

#### `WebXRUIPanel.ts`
**Responsibility**: WebXR-specific UI controls
- VR entry button
- Controls help display
- WebXR status messages
- ~60 lines

### 6. **Utilities** (`src/utils/`)

#### `DOMUtils.ts`
**Responsibility**: DOM manipulation helpers
- Element selection utilities
- Event binding helpers
- Style management utilities
- ~40 lines

#### `ValidationUtils.ts`
**Responsibility**: Input validation and parsing
- Steam URL parsing
- Input sanitization
- Data validation
- ~40 lines

## Migration Strategy

### Phase 1: **Extract Utilities** (Low Risk)
1. Create utility modules for DOM and validation
2. Update imports in main.ts
3. Test that functionality remains unchanged

### Phase 2: **Extract UI Management** (Medium Risk)
1. Create UI manager classes
2. Move DOM manipulation out of main class
3. Establish event communication patterns
4. Test UI interactions

### Phase 3: **Extract Scene Management** (Medium Risk) ✅ COMPLETED
1. ✅ Create scene and asset management classes
2. ✅ Move Three.js setup code
3. ✅ Test 3D rendering and interactions

**Completed modules:**
- `SceneManager.ts` - Three.js scene initialization, lighting, camera, render loop
- `AssetLoader.ts` - GLTF loading, asset caching, progress tracking
- `GameBoxRenderer.ts` - Game box creation, positioning, Steam data integration
- `scene/index.ts` - Clean module exports

**Results:** Removed ~300 lines from main.ts, maintained all functionality, 39/39 tests passing.

### Phase 4: **Extract Steam Integration** (Medium Risk) ✅ COMPLETED
1. ✅ Create Steam integration layer
2. ✅ Move Steam API logic
3. ✅ Test Steam functionality end-to-end

**Completed modules:**
- `SteamIntegration.ts` - High-level Steam game library integration, progressive loading workflow, cache management
- `GameLibraryManager.ts` - Game library state management, sorting/filtering ready, game selection state
- `steam-integration/index.ts` - Clean module exports

**Results:** Removed ~200 lines of Steam integration logic from main.ts, created dedicated Steam integration layer with 27 comprehensive tests. All functionality preserved, 66/66 tests passing.

### Phase 5: **Extract WebXR Management** (High Risk)
1. Create WebXR manager
2. Move VR session handling
3. Extensive testing on VR devices

### Phase 6: **Create New Main App** (High Risk)
1. Create orchestrating app class
2. Wire up all modules
3. Remove old monolithic class
4. Full integration testing

## Benefits After Refactoring

### **Maintainability**
- Each module has clear, single responsibility
- Easier to locate and fix bugs
- Simpler to add new features

### **Testability**
- Individual modules can be unit tested
- Mock dependencies for isolated testing
- Better test coverage possible

### **Reusability**
- Scene components reusable in other 3D apps
- UI components reusable in other Steam integrations
- WebXR manager reusable in other VR projects

### **Developer Experience**
- Smaller files easier to understand
- Clear module boundaries
- Better IDE navigation and intellisense

### **Architecture**
- Follows SOLID principles
- Clear dependency flow
- Easier to extend and modify

## File Structure After Refactoring

```
src/
├── main.ts                     # ~30 lines - entry point only
├── core/
│   └── SteamBrickAndMortarApp.ts  # ~100 lines
├── webxr/
│   ├── WebXRManager.ts         # ~150 lines
│   └── InputManager.ts         # ~100 lines
├── scene/
│   ├── SceneManager.ts         # ~100 lines
│   ├── AssetLoader.ts          # ~80 lines
│   └── GameBoxRenderer.ts      # ~120 lines
├── steam-integration/
│   ├── SteamIntegration.ts     # ~100 lines
│   └── GameLibraryManager.ts   # ~80 lines
├── ui/
│   ├── UIManager.ts            # ~60 lines
│   ├── SteamUIPanel.ts         # ~100 lines
│   ├── ProgressDisplay.ts      # ~60 lines
│   └── WebXRUIPanel.ts         # ~60 lines
├── utils/
│   ├── DOMUtils.ts             # ~40 lines
│   └── ValidationUtils.ts      # ~40 lines
└── steam/                      # Existing Steam API client
    └── index.ts
```

**Total**: ~1,280 lines across 14 focused files vs 900 lines in 1 monolithic file

## Implementation Notes

### **Event Communication**
Use lightweight event emitters or reactive patterns for cross-module communication instead of tight coupling.

### **Dependency Injection**
Pass dependencies through constructors to make modules testable and loosely coupled.

### **Error Boundaries**
Each module should handle its own errors gracefully and report to the app coordinator.

### **Configuration**
Extract configuration constants to a shared config file.

### **Type Safety**
Define clear interfaces for module communication and data structures.

This refactoring will transform the codebase from a monolithic class into a maintainable, testable, and extensible modular architecture.
