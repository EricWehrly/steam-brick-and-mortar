# Startup Event Tracking System

## Overview

A comprehensive event tracking system has been implemented to understand the application startup sequence, timing, and dependencies.

## What Was Implemented

### 1. **StartupEventTracker** Utility (`client/src/utils/StartupEventTracker.ts`)

A singleton tracker that logs and analyzes startup events with:
- **Timestamp tracking**: Records precise timing using `performance.now()`
- **Phase management**: Tracks distinct initialization phases
- **Event logging**: Records individual events within phases
- **Async operation tracking**: Special handling for async operations
- **Summary generation**: Prints formatted timing analysis

### 2. **StartupPhase Enum**

Defines the order of initialization phases:

```typescript
export enum StartupPhase {
    // Phase 0: Pre-initialization
    AppConstruction = 'app-construction',
    
    // Phase 1: Core Services
    DIContainerSetup = 'di-container-setup',
    EventManagerInit = 'event-manager-init',
    AppSettingsInit = 'app-settings-init',
    SceneManagerInit = 'scene-manager-init',
    
    // Phase 2: Coordinators & Integration
    CoordinatorResolution = 'coordinator-resolution',
    WebXRSetup = 'webxr-setup',
    EventHandlerSetup = 'event-handler-setup',
    
    // Phase 3: Controls & Critical UI
    ControlsInit = 'controls-init',
    CriticalUIInit = 'critical-ui-init',
    RenderLoopStart = 'render-loop-start',
    
    // Phase 4: Non-Essential Systems
    NonEssentialSystemsStart = 'non-essential-systems-start',
    DebugSystemsInit = 'debug-systems-init',
    SteamAutoLoad = 'steam-auto-load',
    
    // Phase 5: Game Ready
    GameStart = 'game-start',
    FullyLoaded = 'fully-loaded'
}
```

### 3. **Integration Points**

Tracking has been integrated throughout `SteamBrickAndMortarApp`:

#### Constructor Phase
- AppSettings initialization
- SceneManager creation
- DI Container setup
- Service instantiation (PerformanceMonitor, SteamIntegration, WebXRCoordinator, etc.)

#### Init Method Phases
- DI Container initialization
- Coordinator resolution
- Event handler setup
- Controls initialization
- Critical UI initialization
- Render loop startup
- Non-essential systems (async)

#### Game Start Prerequisites
- Scene ready tracking
- Render loop ready tracking
- UI ready tracking
- GameStart event emission

## What You Get

### Console Output During Startup

The tracker outputs timestamped logs in the console:

```
📊 Startup Event Tracker initialized
🚀 [+0ms] SteamBrickAndMortarApp constructor
📝 [+2ms] Initializing AppSettings
📝 [+5ms] Creating SceneManager
📝 [+12ms] Setting up DI Container
✅ [+15ms] Constructor complete (took 15ms)
🚀 [+16ms] DI Container initialization
📝 [+18ms] Registering SystemUICoordinator
📝 [+25ms] Initializing DI services
✅ [+120ms] Completed di-container-setup (took 104ms)
🎯 [+200ms] MILESTONE: Controls ready - user can move around
...
```

### Summary Report

After full initialization, a formatted summary is printed:

```
═══════════════════════════════════════════════════════════
📊 STARTUP SUMMARY
═══════════════════════════════════════════════════════════
Total startup time: 2450ms

Phase breakdown:
  app-construction: 15ms (7 events)
  di-container-setup: 104ms (3 events)
  coordinator-resolution: 85ms (5 events)
  controls-init: 45ms (2 events)
  critical-ui-init: 12ms (2 events)
  render-loop-start: 8ms (1 events)
  game-start: 5ms (3 events)
  non-essential-systems-start: 280ms (4 events)

Event timeline:
  [+0ms] app-construction: SteamBrickAndMortarApp constructor
  [+2ms] app-construction: Initializing AppSettings
  ...
═══════════════════════════════════════════════════════════
```

## How to Use

### During Development

The tracker is **always active** in development mode. Simply open your browser console to see:
1. Real-time event logging with timestamps
2. Phase start/end markers with durations
3. Milestone markers for significant achievements
4. Final summary report

### Analyzing Performance

Use the console output to:
1. **Identify bottlenecks**: Which phases take the longest?
2. **Track regressions**: Is initialization getting slower over time?
3. **Understand dependencies**: What depends on what?
4. **Debug race conditions**: See the exact order of async operations

### Programmatic Access

```typescript
import { StartupEventTracker } from './utils/StartupEventTracker'

const tracker = StartupEventTracker.getInstance()

// Get summary data
const summary = tracker.getSummary()
console.log(summary.totalTime)
console.log(summary.phases)
console.log(summary.events)

// Disable/enable tracking
tracker.disable()
tracker.enable()

// Print summary manually
tracker.printSummary()
```

## Tracked Event Types

### Phase Events
- `phaseStart()`: Mark the beginning of a phase
- `phaseEnd()`: Mark the end of a phase with duration calculation

### Regular Events
- `logEvent()`: Log a point-in-time event within a phase

### Async Events
- `logAsyncStart()`: Mark the start of an async operation
- `logAsyncEnd()`: Mark completion with duration since start

### Milestones
- `milestone()`: Mark significant achievements

## Integration with Existing Systems

### EventManager Integration
The existing `EventManager` already logs events via the `Logger` utility, providing additional event detail at the application level.

### Combined View
You now have two complementary views:
1. **Startup sequence** (StartupEventTracker): High-level phases and timing
2. **Event emissions** (EventManager/Logger): Detailed event flow

## Next Steps

### Recommended Enhancements
1. **Persist metrics**: Store timing data to track performance over time
2. **Performance budgets**: Alert if phases exceed thresholds
3. **Visualization**: Create a timeline visualization of startup
4. **Production mode**: Conditionally disable in production or send to analytics

### Using for Dependency Mapping
The tracked event order provides an excellent foundation for creating dependency maps:
1. Export event timeline to a structured format
2. Identify synchronous vs asynchronous dependencies
3. Create visual diagrams showing initialization flow
4. Document prerequisites for each system

## Example Output

When you start the app, you'll see output like:

```
📊 Startup Event Tracker initialized
🚀 [+0ms] SteamBrickAndMortarApp constructor
📝 [+1ms] Initializing AppSettings
📝 [+3ms] Creating SceneManager
📝 [+8ms] Setting up DI Container
📝 [+10ms] Creating PerformanceMonitor
📝 [+11ms] Creating SteamIntegration
📝 [+12ms] Creating WebXRCoordinator
📝 [+13ms] Creating DebugStatsProvider
📝 [+14ms] Creating UIManager
✅ [+15ms] Constructor complete (took 15ms)
🚀 [+16ms] DI Container initialization
📝 [+17ms] Registering SystemUICoordinator
📝 [+25ms] Initializing DI services
✅ [+120ms] Completed di-container-setup (took 104ms)
🚀 [+121ms] Resolving coordinators from DI
📝 [+122ms] Resolving EventManager
📝 [+125ms] Setting up prerequisite event listeners
📝 [+128ms] Resolving SceneCoordinator
📝 [+180ms] Resolving UI coordinators
✅ [+200ms] Completed coordinator-resolution (took 79ms)
🎯 [+245ms] MILESTONE: Controls ready - user can move around
🎯 [+380ms] MILESTONE: Core initialization complete
⏳ [+381ms] Non-essential systems initialization (async)
🎯 [+520ms] MILESTONE: Game is ready to start
✅ [+2450ms] Application fully loaded
```

## Files Modified

1. **Created**: `client/src/utils/StartupEventTracker.ts`
2. **Modified**: `client/src/utils/index.ts` (exports)
3. **Modified**: `client/src/core/SteamBrickAndMortarApp.ts` (integration)

## Testing

To see the tracking in action:
1. Start the development server: `yarn dev`
2. Open the browser console
3. Watch the event stream as the app initializes
4. Review the summary report at the end

The tracker is now capturing the complete startup sequence with precise timing information!
