# Interaction Architecture Refactor Plan

## Goal
Transform SteamBrickAndMortarApp into a thin orchestrator by implementing a clean event-driven architecture with proper separation between workflow events and data queries. Support Mouse/Keyboard, Controller, and VR inputs via extensible event system and direct injection for simple data access.

## Previous Problems
- Main app class was overly large and tightly coupled
- Callback handlers created unnecessary complexity and race conditions
- No clear separation between workflow events and data queries
- No clean abstraction for multi-input support

## Target Architecture

### Event System Foundation
**Goal**: Replace callback-based coordination with a clean event system for workflows, and direct injection for data queries

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

### Self-Managing Components
**Goal**: Each system manages its own workflows via events, with direct injection for simple data access

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

### Slim Orchestrator
**Goal**: SteamBrickAndMortarApp is now a pure orchestrator, delegating workflows via events and using direct injection for data queries (e.g., debug stats)

#### Constructor
```typescript
// Clean initialization
this.uiCoordinator = new UICoordinator(this.performanceMonitor, this.debugStatsProvider)
// ...other coordinators initialized similarly
```

#### Event System Wiring
```typescript
// Events are used for user intents and workflows only
// Direct calls are used for simple data queries
```

### Multi-Input Support (Extensible)
**Goal**: Support Mouse/Keyboard, Controller, and VR seamlessly via event system and input abstraction

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
- SteamBrickAndMortarApp reduced from 367 → ~150 lines
- Callback handlers eliminated; replaced with event-driven workflows and direct injection
- Clean separation: Each system manages its own workflows
- Event system scope: Events for workflows, direct calls for data queries
- Extensible: Easy to add new input devices
- Testable: Each component can be tested independently
- All 182 tests passing, validating architecture

## Implementation Order
1. **Start**: InteractionManager + Event Types (Foundation)
2. **Next**: SteamWorkflowManager (Biggest impact - removes ~8 methods)
3. **Then**: WebXREventHandler (Removes ~6 methods)
4. **Then**: Slim down main app class
5. **Finally**: Replace event-driven data queries with direct injection (e.g., debug stats)

## Files Created/Modified
- `src/core/InteractionManager.ts` (event bus foundation)
- `src/types/InteractionEvents.ts` (event types, cleaned up)
- `src/steam-integration/SteamWorkflowManager.ts` (workflow manager)
- `src/webxr/WebXREventHandler.ts` (WebXR event handler)
- `src/core/CacheManager.ts` (cache management)
- `src/core/SteamBrickAndMortarApp.ts` (major cleanup, pure orchestrator)
- `src/ui/UICoordinator.ts` (direct injection, event-driven workflows)
- `src/webxr/WebXRCoordinator.ts` (integrated with event system)
- `src/steam-integration/SteamIntegration.ts` (removed UI coupling)

---

**Status: Architecture refactor complete and validated. Ready for next roadmap priority.**
