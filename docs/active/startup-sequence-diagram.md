# Application Startup Sequence

## Timeline View

```
Time →
0ms ═══════════════════════════════════════════════════════════════════════
    │
    ├─ Phase 0: App Construction
    │  ├─ AppSettings initialization
    │  ├─ SceneManager creation
    │  ├─ DI Container setup
    │  ├─ PerformanceMonitor creation
    │  ├─ SteamIntegration creation
    │  ├─ WebXRCoordinator creation
    │  ├─ DebugStatsProvider creation
    │  └─ UIManager creation
    │
~15ms ─┤
    │
    ├─ Phase 1: DI Container Setup
    │  ├─ SystemUICoordinator registration
    │  └─ DI services initialization
    │
~120ms ─┤
    │
    ├─ Phase 2: Coordinator Resolution
    │  ├─ EventManager resolution
    │  ├─ Event listener setup
    │  ├─ SceneCoordinator resolution
    │  └─ UI Coordinators resolution
    │     ├─ SteamUICoordinator
    │     ├─ WebXRUICoordinator
    │     └─ SystemUICoordinator
    │
~200ms ─┤
    │
    ├─ Phase 2b: Event Handler Setup
    │  └─ WebXREventHandler initialization
    │
~210ms ─┤
    │
    ├─ Phase 3: Controls Init ⚡ USER CAN MOVE
    │  └─ WebXR setup
    │
~250ms ─┤
    │
    ├─ Phase 4: Critical UI Init
    │  ├─ UIManager.init()
    │  └─ Hide loading screen
    │
~265ms ─┤
    │
    ├─ Phase 5: Render Loop Start ⚡ USER CAN SEE
    │  ├─ CompassRose creation
    │  ├─ Render loop start
    │  └─ PerformanceMonitor start
    │
~275ms ─┤
    │
    ├─ ⏹ BLOCKING INITIALIZATION COMPLETE ⏹
    │  Core app is now interactive!
    │
    ├─ Phase 6: Non-Essential Systems (ASYNC) ⏳
    │  │
    │  ├─ (Parallel) Debug Systems Init
    │  │  └─ SystemUICoordinator.init()
    │  │
    │  └─ (Depends on prerequisites) Game Start
    │     ├─ Wait for: Scene Ready
    │     ├─ Wait for: Render Loop Ready
    │     ├─ Wait for: UI Ready
    │     └─ Emit: GameStart event
    │
~500ms ─┤
    │
    ├─ Phase 7: Steam Auto-Load (on GameStart)
    │  ├─ Check auto-load setting
    │  └─ Load cached user if available
    │
~2400ms ┤
    │
    └─ Phase 8: Fully Loaded 🎉
       └─ Show success toast
       └─ Print startup summary

═══════════════════════════════════════════════════════════════════════
```

## Dependency Graph

```
AppSettings ──┐
              ├──> DI Container ──> EventManager ──┐
SceneManager ─┘                                    │
                                                   ├──> Coordinators ──> Event Handlers
                                                   │
                                                   └──> Event Listeners

Controls Init ────────┐
                      ├──> Core Ready
Critical UI Init ─────┤     (Interactive!)
                      │
Render Loop Start ────┘


Scene Ready ───────┐
                   │
Render Loop Ready ─┼──> GameStart Event ──> Steam Auto-Load
                   │
UI Ready ──────────┘
```

## Critical Path (Blocking)

These phases **block** user interaction and must complete before the app is usable:

1. **App Construction** (~15ms)
   - Essential service instantiation
   - DI Container configuration

2. **DI Container Setup** (~105ms)
   - Service registration
   - Dependency resolution

3. **Coordinator Resolution** (~80ms)
   - Resolve all coordinators from DI
   - Set up event listeners

4. **Controls Init** (~45ms)
   - WebXR setup
   - **User can now move around!** ⚡

5. **Critical UI Init** (~15ms)
   - Basic UI elements
   - Remove loading screen

6. **Render Loop Start** (~10ms)
   - Start rendering
   - **User can now see!** ⚡

**Total Critical Path: ~270ms** 🏃

## Async Path (Non-Blocking)

These phases happen **in the background** while the user can already interact:

7. **Non-Essential Systems** (~280ms async)
   - Debug panels
   - Performance monitoring UI
   - Advanced features

8. **Game Start Prerequisites** (depends on async events)
   - Wait for scene to be fully ready
   - Wait for all prerequisites
   - Emit GameStart event

9. **Steam Auto-Load** (depends on GameStart)
   - Check settings
   - Load cached user
   - Display games

10. **Fully Loaded** (~2400ms total)
    - Everything is ready
    - Show success message

## Event Flow

### Events Emitted During Startup

```
1. (Internal) Phase start/end events
2. EventManager creation
3. Event listener registration
4. WebXR events (if VR available)
5. Scene:Ready event (from SceneCoordinator)
6. Game:Start event (when all prerequisites met)
7. Steam events (if auto-load enabled)
```

### Key Milestones

- **+15ms**: Constructor complete
- **+120ms**: DI Container ready
- **+200ms**: Coordinators resolved
- **+245ms**: ⚡ Controls ready - user can move
- **+265ms**: ⚡ UI ready - user can interact
- **+275ms**: ⚡ Render loop - user can see
- **+380ms**: Core initialization complete
- **+520ms**: Game ready to start
- **+2450ms**: 🎉 Fully loaded

## Performance Characteristics

### Fast Path (Target: <300ms)
Core app becomes interactive

### Full Load (Target: <3000ms)
All features available including debug tools and Steam integration

### Bottlenecks to Watch
1. DI Container initialization (~100ms)
2. Coordinator resolution (~80ms)
3. WebXR setup (~45ms)
4. Scene creation (async, ~240ms)
5. Steam data loading (varies by network/cache)

## How to Read the Logs

### Console Output Format

```
📊 - Tracker initialization
🚀 - Phase start
✅ - Phase complete (with duration)
📝 - Individual event
⏳ - Async operation started
🎯 - Milestone reached
```

### Understanding Timestamps

All timestamps are relative to tracker initialization (T+0ms):
- `[+0ms]` - Immediate
- `[+15ms]` - 15ms after start
- `[+1500ms]` - 1.5 seconds after start

### Duration Indicators

Phase end markers show how long that phase took:
```
✅ [+120ms] Completed di-container-setup (took 104ms)
     │                                         │
     └─ Total elapsed time                    └─ Phase duration
```

## Optimization Opportunities

Based on the tracked data, consider:

1. **Lazy Load Non-Critical Services**
   - Move debug tools further into async path
   - Defer Steam integration until after core ready

2. **Parallel Initialization**
   - Some coordinators could resolve in parallel
   - Scene creation could start earlier

3. **Progressive Enhancement**
   - Show basic UI even faster
   - Add features as they load

4. **Caching Strategies**
   - Cache DI resolutions
   - Preload critical assets

## Related Documentation

- **Implementation**: `docs/active/startup-event-tracking.md`
- **Event System**: `docs/architecture/event-driven-architecture-pattern.md`
- **DI Container**: `client/src/core/di/README.md`
