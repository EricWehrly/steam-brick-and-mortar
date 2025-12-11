# Frame-Budget-Aware Task Scheduler

## Problem Statement

Even with IndexedDB operations moved to a Web Worker, we still see frame dips during HIGH texture loading. The profiling identified:

- **Worker round-trip**: ~14ms average (async, not blocking)
- **Texture array `.set()`**: ~0.2ms average, up to 1ms worst case
- **Frame dips**: 3 out of 5 frames exceeded 16.67ms during reload test

The issue: We're scheduling texture copies synchronously whenever the worker responds, regardless of current frame budget. If we're already behind on a frame, adding even 1ms of work compounds the problem.

## Solution: Frame-Budget-Aware Scheduler

Build a lightweight scheduler that:
1. Tracks rolling frame time statistics (minimal overhead)
2. Provides a "budget check" API for deferrable work
3. Queues work when over budget, executes when under budget
4. Self-tunes based on target framerate

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FrameBudgetScheduler                        │
├─────────────────────────────────────────────────────────────────┤
│  Frame Tracking (runs every frame via requestAnimationFrame)    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • lastFrameTime: number                                  │   │
│  │ • frameTimeRing: Float32Array(60)  // ~1 second window  │   │
│  │ • ringIndex: number                                      │   │
│  │ • rollingAvg: number (cached, updated per frame)         │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Budget Calculation                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • targetFrameTime: 16.67ms (60fps) or configurable       │   │
│  │ • currentFrameBudgetRemaining: number                    │   │
│  │ • budgetThreshold: 0.8 (only use 80% of remaining)       │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Task Queue                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • pendingTasks: Array<{ fn, estimatedMs, priority }>     │   │
│  │ • maxTasksPerFrame: number (prevent starvation)          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## API Design

```typescript
interface FrameBudgetScheduler {
  // Core API
  schedule(task: () => void, options?: TaskOptions): void
  scheduleAsync<T>(task: () => Promise<T>, options?: TaskOptions): Promise<T>
  
  // Immediate check (for inline decisions)
  hasBudget(estimatedMs?: number): boolean
  
  // Stats for debugging
  getStats(): SchedulerStats
  
  // Configuration
  setTargetFps(fps: number): void
  setBudgetThreshold(percent: number): void
}

interface TaskOptions {
  estimatedMs?: number      // Estimated execution time (for budget planning)
  priority?: 'low' | 'normal' | 'high'
  maxDeferMs?: number       // Force execution after N ms (anti-starvation, default ~16.6s = 1000 frames)
}

interface SchedulerStats {
  currentFps: number
  targetFps: number
  rollingAvgFrameTime: number
  pendingTasks: number
  tasksExecutedThisFrame: number
  tasksDeferred: number
  budgetUtilization: number  // 0-1, how much of budget we're using
}
```

## Implementation Details

### 1. Frame Time Tracking (Ultra-Lightweight)

```typescript
// Use a typed array ring buffer for minimal GC pressure
private frameTimeRing = new Float32Array(60)  // 1 second @ 60fps
private ringIndex = 0
private rollingSum = 0  // Maintain running sum for O(1) average

onFrame(now: number): void {
  const delta = now - this.lastFrameTime
  this.lastFrameTime = now
  
  // Update rolling sum (subtract old value, add new)
  this.rollingSum -= this.frameTimeRing[this.ringIndex]
  this.rollingSum += delta
  this.frameTimeRing[this.ringIndex] = delta
  this.ringIndex = (this.ringIndex + 1) % 60
  
  // O(1) average calculation
  this.rollingAvg = this.rollingSum / 60
  
  // Process pending tasks if we have budget
  this.processPendingTasks(now)
}
```

**Why this is fast:**
- No array allocations (fixed-size typed array)
- O(1) average calculation via running sum
- No object creation per frame
- Single `performance.now()` call reused

### 2. Budget Calculation

```typescript
hasBudget(estimatedMs: number = 1): boolean {
  const elapsed = performance.now() - this.frameStartTime
  const remaining = this.targetFrameTime - elapsed
  const usableBudget = remaining * this.budgetThreshold
  
  return usableBudget >= estimatedMs
}
```

**Key insight**: We check budget *at the moment of decision*, not at frame start. This accounts for work already done this frame.

### 3. Task Processing Strategy

```typescript
processPendingTasks(now: number): void {
  if (this.pendingTasks.length === 0) return
  
  let tasksExecuted = 0
  
  // Process tasks, respecting budget
  while (this.pendingTasks.length > 0 && tasksExecuted < this.maxTasksPerFrame) {
    const task = this.pendingTasks[0]
    
    // Anti-starvation: check if task has been waiting too long (time-based, not frame-count)
    // This is O(1): one subtraction, one comparison per task considered
    const waitTime = now - task.queuedAt
    const forceExecution = waitTime > task.maxDeferMs
    
    if (forceExecution) {
      console.warn(`[FrameBudgetScheduler] Task forced after ${waitTime.toFixed(0)}ms wait (limit: ${task.maxDeferMs}ms)`)
    }
    
    if (!forceExecution && !this.hasBudget(task.estimatedMs)) {
      break  // No budget and not forced - wait for next frame
    }
    
    // Execute task
    this.pendingTasks.shift()
    task.fn()
    tasksExecuted++
  }
}
```

### 4. Integration Points

#### A. Plug into existing render loop

The scheduler needs to be called every frame. Options:

1. **Hook into Three.js render loop** (preferred - already exists)
2. **Standalone requestAnimationFrame** (fallback)

```typescript
// In main.ts or wherever the render loop is
scheduler.onFrameStart(performance.now())
renderer.render(scene, camera)
scheduler.onFrameEnd()
```

#### B. Integration with HighTextureCache

Replace synchronous `.set()` with scheduled version:

```typescript
// Before (current)
arrayData.set(imageData, offset)

// After (scheduled)
this.scheduler.schedule(() => {
  arrayData.set(imageData, offset)
  this.isDirty = true
}, { 
  estimatedMs: 0.5,  // Based on profiling data
  priority: 'normal',
  maxDeferFrames: 10  // Don't delay more than ~166ms
})
```

### 5. Adaptive Tuning

The scheduler can self-tune based on observed performance:

```typescript
// If we're consistently hitting target FPS, we can be more aggressive
// If we're struggling, back off more

updateBudgetThreshold(): void {
  const fpsRatio = this.targetFps / this.currentFps
  
  if (fpsRatio > 1.1) {
    // We're struggling - reduce threshold
    this.budgetThreshold = Math.max(0.5, this.budgetThreshold - 0.05)
  } else if (fpsRatio < 0.95 && this.pendingTasks.length > 0) {
    // We have headroom and work to do - increase threshold
    this.budgetThreshold = Math.min(0.9, this.budgetThreshold + 0.02)
  }
}
```

## Performance Considerations

### What makes this fast enough for the render loop:

1. **No allocations**: Use typed arrays and reuse objects
2. **O(1) operations**: Rolling average via running sum, not array reduce
3. **Minimal branching**: Simple conditionals, no complex logic per frame
4. **Lazy sorting**: Only sort task queue when needed, not every frame
5. **Early exit**: Skip processing if no pending tasks

### Estimated overhead per frame:

| Operation | Cost |
|-----------|------|
| Delta calculation | ~0.001ms |
| Ring buffer update | ~0.002ms |
| Budget check | ~0.001ms |
| Queue check (empty) | ~0.001ms |
| **Total (no tasks)** | **~0.005ms** |

This is negligible compared to our 16.67ms frame budget.

## Testing Strategy

### 1. Unit Tests
- Budget calculation accuracy
- Task queue ordering
- Anti-starvation behavior
- Rolling average accuracy

### 2. Integration Test
- Replace texture copy with scheduled version
- Run `runProfilingTest(10)` 
- Compare frame time variance before/after

### 3. Stress Test
- Queue 100 tasks simultaneously
- Verify no frame exceeds 2x target
- Verify all tasks eventually execute

## Implementation Plan

### Phase 1: Core Scheduler (1-2 hours)
1. Create `FrameBudgetScheduler` class
2. Implement frame time tracking
3. Implement basic task queue
4. Add budget calculation

### Phase 2: Integration (30 min)
1. Hook into render loop
2. Expose on window for debugging
3. Add stats/diagnostics

### Phase 3: Apply to Texture Loading (30 min)
1. Modify `HighTextureCache.loadHighTexture()`
2. Schedule `.set()` operations
3. Handle dirty flag properly

### Phase 4: Testing & Tuning (30 min)
1. Run profiling tests
2. Compare before/after frame times
3. Tune budget threshold
4. Add adaptive tuning if needed

## Success Criteria

1. **No frames > 20ms** during texture loading (was 18ms max)
2. **Reduced variance** in frame times
3. **Same throughput** - textures still load in ~100ms total
4. **Minimal overhead** - < 0.1ms per frame when idle

## Alternative Approaches Considered

### requestIdleCallback
- **Pros**: Browser-native, handles edge cases
- **Cons**: May never fire if not at target FPS, no budget control, not available during rendering

### setTimeout(0)
- **Pros**: Simple deferral
- **Cons**: No budget awareness, can accumulate backlog, poor timing control

### Web Worker for .set()
- **Pros**: Truly off main thread
- **Cons**: Can't access TypedArray in DataArrayTexture from worker (shared memory issues with GPU resources)

## Files to Create/Modify

| File | Action |
|------|--------|
| `client/src/utils/FrameBudgetScheduler.ts` | Create - core scheduler |
| `client/src/main.ts` | Modify - hook into render loop |
| `client/src/scene/game-box/instancing/HighTextureCache.ts` | Modify - use scheduler |
| `client/test/unit/FrameBudgetScheduler.test.ts` | Create - unit tests |

---

## Ready to Implement?

Once this plan is approved, we'll:
1. Build the scheduler
2. Integrate it
3. Re-run `runProfilingTest(10)` to measure improvement
4. Commit the changes

The goal: **Smooth 60fps during texture loading with zero frame dips.**
