# Startup Event Tracking - Quick Reference

## Quick Start

The startup event tracker is **already running**. Just open your browser console to see the startup sequence!

## What You'll See

### Real-Time Logs
```
📊 Startup Event Tracker initialized
🚀 [+0ms] SteamBrickAndMortarApp constructor
📝 [+2ms] Initializing AppSettings
...
✅ [+15ms] Constructor complete (took 15ms)
🎯 [+245ms] MILESTONE: Controls ready - user can move around
```

### Summary Report (at the end)
```
═══════════════════════════════════════════════════
📊 STARTUP SUMMARY
═══════════════════════════════════════════════════
Total startup time: 2450ms

Phase breakdown:
  app-construction: 15ms (7 events)
  di-container-setup: 104ms (3 events)
  ...
```

## Icon Legend

| Icon | Meaning |
|------|---------|
| 📊 | Tracker status |
| 🚀 | Phase started |
| ✅ | Phase completed (with duration) |
| 📝 | Event logged |
| ⏳ | Async operation started |
| 🎯 | Milestone reached |

## Startup Phases (in order)

1. **app-construction** - Constructor execution (~15ms)
2. **di-container-setup** - DI services init (~100ms)
3. **coordinator-resolution** - Resolve coordinators (~80ms)
4. **event-handler-setup** - Set up event handlers (~5ms)
5. **controls-init** - User input ready (~45ms) ⚡
6. **critical-ui-init** - Basic UI ready (~15ms) ⚡
7. **render-loop-start** - Rendering starts (~10ms) ⚡
8. **non-essential-systems-start** - Background features (async)
9. **game-start** - Prerequisites met
10. **fully-loaded** - Everything ready 🎉

## Key Milestones

- **+245ms**: User can move around
- **+265ms**: User can see and interact
- **+380ms**: Core app ready
- **+520ms**: Game ready
- **+2450ms**: Fully loaded

## Common Questions

### Q: How do I disable tracking?
```typescript
import { StartupEventTracker } from './utils/StartupEventTracker'
StartupEventTracker.getInstance().disable()
```

### Q: How do I get metrics programmatically?
```typescript
const tracker = StartupEventTracker.getInstance()
const summary = tracker.getSummary()
console.log(summary.totalTime) // Total ms
console.log(summary.phases)    // Per-phase metrics
```

### Q: What's the difference between phases and events?
- **Phases** have start/end markers and calculate duration
- **Events** are point-in-time occurrences within phases

### Q: Why are some operations async?
Non-essential systems load in the background so users can start interacting immediately.

## Performance Debugging

### Finding Bottlenecks
Look for phases with high durations:
```
✅ [+320ms] Completed di-container-setup (took 200ms)
                                              ^^^^^
                                          Too slow!
```

### Tracking Regressions
Compare total time across versions:
```
Version 1: Total startup time: 2450ms
Version 2: Total startup time: 3100ms  ← Regression!
```

### Understanding Dependencies
Events show what depends on what:
```
🎯 [+120ms] MILESTONE: Scene ready prerequisite met
🎯 [+245ms] MILESTONE: Controls ready prerequisite met  
🎯 [+520ms] MILESTONE: Game is ready to start
               ^
               └─ Waited for all prerequisites
```

## Adding Your Own Tracking

### In Existing Code

```typescript
import { StartupEventTracker, StartupPhase } from '../utils/StartupEventTracker'

class MyNewSystem {
    async init() {
        const tracker = StartupEventTracker.getInstance()
        
        // Log an event
        tracker.logEvent(StartupPhase.NonEssentialSystemsStart, 'MySystem initializing')
        
        // Track a phase
        tracker.phaseStart(StartupPhase.MyNewPhase, 'Starting my work')
        await this.doWork()
        tracker.phaseEnd(StartupPhase.MyNewPhase)
        
        // Track async operation
        const startTime = tracker.logAsyncStart(StartupPhase.MyPhase, 'Loading data')
        await loadData()
        tracker.logAsyncEnd(StartupPhase.MyPhase, 'Loading data', startTime)
        
        // Mark milestone
        tracker.milestone(StartupPhase.MyPhase, 'Data ready!')
    }
}
```

### Adding New Phases

Edit `client/src/utils/StartupEventTracker.ts`:

```typescript
export enum StartupPhase {
    // ... existing phases ...
    MyNewPhase = 'my-new-phase',
}
```

## Best Practices

### DO ✅
- Log phase boundaries (start/end)
- Use milestones for significant achievements
- Track async operations separately
- Include meaningful descriptions

### DON'T ❌
- Log too many tiny events (noise)
- Track in hot paths (render loops)
- Leave tracking enabled in production without metrics backend
- Forget to mark phase ends

## Troubleshooting

### "Phase ended without a start marker"
You called `phaseEnd()` without `phaseStart()`. Make sure phases are properly paired.

### Timestamps seem wrong
Timestamps are relative to tracker initialization (T+0ms), not absolute time.

### Missing events in summary
Check that you're using the correct phase enum value and that the event was logged before `printSummary()`.

## Files to Know

- **Tracker**: `client/src/utils/StartupEventTracker.ts`
- **Integration**: `client/src/core/SteamBrickAndMortarApp.ts`
- **Docs**: `docs/active/startup-event-tracking.md`
- **Diagram**: `docs/active/startup-sequence-diagram.md`

## Related Systems

- **EventManager**: Logs all application events via Logger
- **Logger**: General-purpose logging utility
- **PerformanceMonitor**: Runtime performance stats (FPS, memory, etc.)

## Next Steps

1. Run the app and watch the console
2. Note any slow phases
3. Compare timing across code changes
4. Use data to optimize initialization order
5. Consider creating dependency maps from the event sequence
