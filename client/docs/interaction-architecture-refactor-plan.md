# Interaction Architecture Refactor Plan

## Goal
Transform SteamBrickAndMortarApp from a callback coordinator into a thin orchestrator by implementing a proper interaction/event system that supports Mouse/Keyboard + Controller + VR inputs.

## Current Problems
- **367 lines** in main app class (should be ~100)
- **18 callback handlers** that are just 1-line delegations
- Tight coupling between UI, Steam, WebXR, and App
- No clear interaction abstraction for multi-input support

## Target Architecture

### Phase 1: Create Event System Foundation (Start Here)
**Goal**: Replace callback hell with clean event system

#### 1.1 Create InteractionManager
```typescript
// New: src/core/InteractionManager.ts
class InteractionManager extends EventTarget {
  // Centralized event bus for all app interactions
  // Normalized events: 'steam:load', 'webxr:toggle', 'input:pause', etc.
}
```

#### 1.2 Create Event Types
```typescript
// New: src/types/InteractionEvents.ts  
interface SteamEvents {
  'steam:load-games': { vanityUrl: string }
  'steam:cache-clear': {}
  'steam:use-offline': { vanityUrl: string }
}
interface WebXREvents { ... }
interface InputEvents { ... }
```

### Phase 2: Self-Managing Components  
**Goal**: Each system handles its own workflows

#### 2.1 SteamWorkflowManager
```typescript
// New: src/steam-integration/SteamWorkflowManager.ts
class SteamWorkflowManager {
  // Moves: handleLoadSteamGames, prepareForGameLoading, 
  // createProgressCallbacks, handleGameLoadingSuccess/Error
  // handleUseOfflineData, handleRefreshCache, handleClearCache
}
```

#### 2.2 WebXREventHandler  
```typescript  
// New: src/webxr/WebXREventHandler.ts
class WebXREventHandler {
  // Moves: handleWebXRSessionStart/End/Error/SupportChange
  // handleWebXRToggle, handleInputPause/Resume
}
```

#### 2.3 CacheManager
```typescript
// New: src/core/CacheManager.ts  
class CacheManager {
  // Moves: cache-related operations from SteamIntegration
  // handleShowCacheStats, updateCacheStatsDisplay
}
```

### Phase 3: Slim Down SteamBrickAndMortarApp
**Goal**: App becomes pure orchestrator

#### 3.1 Remove Methods (Target: 60% reduction)
**Remove these 18 methods:**
- `handleWebXRSessionStart/End/Error/SupportChange` → WebXREventHandler
- `handleWebXRToggle` → WebXREventHandler  
- `handleInputPause/Resume` → WebXREventHandler
- `handlePauseMenuOpen/Close` → WebXREventHandler
- `handleLoadSteamGames` → SteamWorkflowManager
- `prepareForGameLoading` → SteamWorkflowManager
- `createProgressCallbacks` → SteamWorkflowManager
- `handleGameLoadingSuccess/Error` → SteamWorkflowManager
- `handleUseOfflineData` → SteamWorkflowManager
- `handleRefreshCache/ClearCache` → CacheManager
- `handleShowCacheStats` → CacheManager
- `updateCacheStatsDisplay` → CacheManager

#### 3.2 Simplify Constructor
**From:**
```typescript
// 50+ lines of callback wiring
this.uiCoordinator = new UICoordinator(this.performanceMonitor, {
  onWebXRToggle: () => this.handleWebXRToggle(),
  onLoadSteamGames: (vanityUrl: string) => this.handleLoadSteamGames(vanityUrl),
  // ... 12 more callbacks
})
```

**To:**
```typescript
// Clean initialization
this.interactionManager = new InteractionManager()
this.uiCoordinator = new UICoordinator(this.performanceMonitor)
this.steamWorkflow = new SteamWorkflowManager()
this.webxrHandler = new WebXREventHandler()
this.cacheManager = new CacheManager()
```

#### 3.3 Wire Event System
```typescript
private wireInteractions(): void {
  // Simple event wiring - no callback methods needed
  this.interactionManager.addEventListener('steam:load-games', 
    (e) => this.steamWorkflow.handleLoadGames(e.detail))
}
```

### Phase 4: Multi-Input Support (Future)
**Goal**: Support Mouse/Keyboard + Controller + VR seamlessly

#### 4.1 Input Abstraction
```typescript  
interface InputDevice {
  type: 'mouse' | 'keyboard' | 'gamepad' | 'vr-controller'
  getState(): InputState
}
```

#### 4.2 Input Mapping
```typescript
class InputMapper {
  // Maps device inputs to interaction events
  // E.g., "Spacebar" | "A Button" | "VR Trigger" → 'interaction:select'
}
```

## Success Metrics
- **SteamBrickAndMortarApp reduced from 367 → ~150 lines** 
- **18 callback handlers → 0 callback handlers**
- **Clean separation**: Each system manages its own workflows
- **Extensible**: Easy to add new input devices
- **Testable**: Each component can be tested independently

## Implementation Order
1. **Start**: InteractionManager + Event Types (Foundation)
2. **Next**: SteamWorkflowManager (Biggest impact - removes ~8 methods)
3. **Then**: WebXREventHandler (Removes ~6 methods) 
4. **Finally**: Slim down main app class

## Files to Create
- `src/core/InteractionManager.ts`
- `src/types/InteractionEvents.ts`
- `src/steam-integration/SteamWorkflowManager.ts`
- `src/webxr/WebXREventHandler.ts`
- `src/core/CacheManager.ts`

## Files to Modify
- `src/core/SteamBrickAndMortarApp.ts` (major cleanup)
- `src/ui/UICoordinator.ts` (remove callbacks)
- `src/webxr/WebXRCoordinator.ts` (integrate with event system)
- `src/steam-integration/SteamIntegration.ts` (remove UI coupling)

---

**Ready to start with Phase 1.1: InteractionManager creation**
