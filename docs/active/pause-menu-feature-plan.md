# Pause Menu Feature - Planning Document

## Overview
Add a comprehensive pause menu system triggered by the Escape key, consolidating various application controls into an extensible, well-organized interface.

## Motivation
- **Current Issues**: Cache management scattered across UI, Steam profile input too wide, no centralized settings
- **User Experience**: Need intuitive way to access app settings and controls while in the environment  
- **Extensibility**: Future features (graphics settings, input remapping, etc.) need a home
- **VR Preparation**: Pause menu foundation for future VR interaction patterns

## Current State Analysis

### Existing UI Components to Integrate:
1. **Cache Management** (`CacheManagementUI.ts`):
   - Currently in top-right corner with advanced stats
   - Functions: refresh, clear cache, storage quota monitoring
   - Should move to pause menu settings

2. **Steam Profile Input** (`SteamUIPanel.ts`):
   - Currently full-width input field
   - Functions: profile URL/vanity name, load games, offline data
   - Input box should be narrower, grow on focus

3. **Controls Help** (`WebXRUIPanel.ts`):
   - Currently basic keyboard controls display
   - Should expand to comprehensive help section

4. **Performance Monitor** (`PerformanceMonitor.ts`):
   - Recently added, shows FPS/memory in corner
   - Settings for position, metrics visibility needed

### Input System Integration:
- **InputManager** already handles keyboard events (WASD, mouse)
- Need to add Escape key handling
- Prevent movement when pause menu is open
- Resume input when menu closes

## Feature Design

### Menu Structure
```
📋 Pause Menu (Escape to toggle)
├── 🎮 Game Settings
│   ├── Steam Profile Management
│   ├── Cache Management  
│   └── Performance Monitor Settings
├── ⚙️ Application Settings
│   ├── Graphics Quality
│   ├── Input Configuration
│   └── Interface Settings
├── 📊 Debug/Development
│   ├── Performance Statistics
│   ├── Cache Details
│   └── Console Toggle
├── 📖 Help & Controls
│   ├── Keyboard/Mouse Controls
│   ├── VR Controls (future)
│   └── Interaction Guide
└── 🚪 Application
    ├── Resume (Escape)
    ├── Restart Application
    └── Exit/Close
```

### Technical Architecture

#### Core Components:
1. **`PauseMenuManager.ts`** - Main orchestrator
2. **`PauseMenuPanel.ts`** - Base extensible panel class  
3. **`GameSettingsPanel.ts`** - Steam, cache, performance settings
4. **`AppSettingsPanel.ts`** - Graphics, input, interface settings
5. **`DebugPanel.ts`** - Development and diagnostic tools
6. **`HelpPanel.ts`** - Controls and guidance
7. **`ApplicationPanel.ts`** - App-level actions

#### Integration Points:
- **InputManager**: Add escape key handling, pause movement
- **UIManager**: Coordinate with existing UI panels
- **CacheManagementUI**: Refactor into settings panel
- **SteamUIPanel**: Extract profile input, reduce width
- **PerformanceMonitor**: Add settings interface

### Implementation Phases

#### Phase 1: Foundation (Current Sprint)
- [ ] Create basic `PauseMenuManager` with escape key toggle
- [ ] Implement extensible `PauseMenuPanel` base class
- [ ] Add input pause/resume functionality
- [ ] Create basic menu overlay with close button

#### Phase 2: Core Panels
- [ ] **GameSettingsPanel**: Move cache management, add profile settings
- [ ] **HelpPanel**: Expand controls documentation
- [ ] **ApplicationPanel**: Add resume/restart/exit options
- [ ] Reduce Steam profile input width, add focus expansion

#### Phase 3: Advanced Features  
- [ ] **AppSettingsPanel**: Graphics, input, interface settings
- [ ] **DebugPanel**: Performance stats, cache details, console
- [ ] Settings persistence (localStorage)
- [ ] Keyboard navigation within menus

#### Phase 4: Polish & Extensibility
- [ ] Smooth animations and transitions
- [ ] VR interaction preparation
- [ ] Plugin/extension system for future panels
- [ ] Accessibility improvements

## Technical Specifications

### Escape Key Handling
```typescript
// In InputManager.ts - add to handleKeyDown
case 'Escape':
    this.callbacks.onEscapePress?.()
    break
```

### Menu State Management
```typescript
interface PauseMenuState {
    isOpen: boolean
    activePanel: string | null
    inputPaused: boolean
    previousFocus: HTMLElement | null
}
```

### Panel Architecture
```typescript
abstract class PauseMenuPanel {
    abstract readonly id: string
    abstract readonly title: string
    abstract readonly icon: string
    
    abstract render(): string
    abstract attachEvents(): void
    abstract onShow(): void
    abstract onHide(): void
    abstract dispose(): void
}
```

### Steam Profile Input Changes
- Current width: `width: 100%` 
- New width: `width: 50%` 
- Focus behavior: `transition: width 0.3s ease; &:focus { width: 100% }`

## Integration Plan

### Files to Modify:
1. **`src/webxr/InputManager.ts`**: Add escape key, pause functionality
2. **`src/ui/UIManager.ts`**: Integrate pause menu coordination
3. **`src/ui/SteamUIPanel.ts`**: Reduce input width, remove redundant cache buttons
4. **`client/index.html`**: Update input styling for width behavior
5. **`src/core/SteamBrickAndMortarApp.ts`**: Wire up pause menu events

### Files to Create:
1. **`src/ui/pause/PauseMenuManager.ts`**
2. **`src/ui/pause/PauseMenuPanel.ts`** (base class)
3. **`src/ui/pause/panels/GameSettingsPanel.ts`**
4. **`src/ui/pause/panels/HelpPanel.ts`**
5. **`src/ui/pause/panels/ApplicationPanel.ts`**

### Backward Compatibility:
- Existing cache management API preserved
- Steam UI events remain unchanged
- Performance monitor continues to function
- Gradual migration of features, no breaking changes

## Success Criteria

### Functionality:
- [ ] Escape key toggles pause menu reliably
- [ ] Movement input properly paused when menu open
- [ ] Cache management fully integrated and functional
- [ ] Steam profile input behaves as specified
- [ ] All existing features continue to work

### Code Quality:
- [ ] Extensible architecture for future menu additions
- [ ] Clean separation of concerns between panels
- [ ] Proper TypeScript typing throughout
- [ ] Unit tests for core pause menu functionality

### User Experience:
- [ ] Intuitive navigation and visual hierarchy
- [ ] Smooth transitions and responsive design
- [ ] Keyboard navigation support
- [ ] Clear visual feedback for all interactions

## Future Considerations

### VR Readiness:
- Design with spatial UI in mind
- Panel layout adaptable to 3D positioning
- Touch/controller interaction preparation

### Extension Points:
- Plugin architecture for community additions
- Theme/customization system
- Keyboard shortcut configuration
- Multi-language support preparation

### Performance:
- Lazy loading of non-essential panels
- Efficient DOM manipulation
- Memory cleanup on menu disposal
- Animation performance optimization

---

**Status**: Planning Phase - Ready for Implementation
**Priority**: High - Improves core UX and consolidates scattered UI
**Complexity**: Medium - Well-defined scope with clear integration points
