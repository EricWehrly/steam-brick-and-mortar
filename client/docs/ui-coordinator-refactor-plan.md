# UI Coordinator Refactor Plan

## Problem
`UICoordinator` has grown too large and handles too many different concerns:
- Steam workflow coordination 
- WebXR state management
- Pause menu management
- Performance monitoring
- Settings management
- Cache management
- Event emission for everything

## Proposed Solution: Split by Domain

### 1. `SteamUICoordinator`
**Responsibility**: Steam-specific UI workflows and state management
```typescript
class SteamUICoordinator {
    // Direct method calls instead of events for simple operations
    loadGames(vanityUrl: string): Promise<void>
    loadFromCache(vanityUrl: string): Promise<void>
    setDevMode(enabled: boolean): void
    clearCache(): void
    
    // UI state management
    updateProgress(current: number, total: number, message: string): void
    showSteamStatus(message: string, type: 'loading' | 'success' | 'error'): void
}
```

### 2. `WebXRUICoordinator`
**Responsibility**: WebXR-specific UI management
```typescript
class WebXRUICoordinator {
    updateWebXRSupport(capabilities: WebXRCapabilities): void
    updateWebXRSessionState(isActive: boolean): void
    toggleVR(): Promise<void>
}
```

### 3. `SystemUICoordinator`  
**Responsibility**: System-level UI (pause menu, performance, settings)
```typescript
class SystemUICoordinator {
    setupPauseMenu(): void
    openPauseMenu(): void
    togglePerformanceMonitor(): void
    updateRenderStats(renderer: THREE.WebGLRenderer): void
}
```

### 4. `MainUICoordinator`
**Responsibility**: Orchestrates the specialized coordinators
```typescript
class MainUICoordinator {
    constructor(
        private steamUI: SteamUICoordinator,
        private webxrUI: WebXRUICoordinator,
        private systemUI: SystemUICoordinator
    )
    
    async setupUI(): Promise<void> {
        // Delegates to specialized coordinators
    }
}
```

## Benefits
- **Single Responsibility**: Each coordinator handles one domain
- **Simpler Testing**: Test each domain independently
- **Direct Method Calls**: No event overhead for simple operations
- **Clearer Dependencies**: Easier to understand what depends on what
- **Maintainable**: Easier to modify Steam UI without affecting WebXR UI

## Migration Strategy
1. Create the new specialized coordinators
2. Move methods from UICoordinator to appropriate specialized coordinator
3. Update UICoordinator to delegate to specialized coordinators
4. Remove event system for simple operations (like dev mode toggle)
5. Keep events only for complex cross-system workflows

## Event System Simplification
**Keep events for**: Complex workflows, cross-system coordination
**Use direct calls for**: Simple state updates, single-system operations

Example:
- ✅ **Direct call**: `steamUI.setDevMode(true)` 
- ✅ **Event**: Loading games workflow (multiple progress callbacks, error handling)