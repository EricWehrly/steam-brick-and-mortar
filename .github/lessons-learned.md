# Lessons Learned

Captured insights from development that should inform future work.

---

## Three.js DataArrayTexture: Use Partial Layer Updates

**Date**: 2024-12-09  
**Context**: HIGH texture cache was causing 50-65ms frame spikes during texture loading  
**Scope**: Any Three.js project using DataArrayTexture

### Issue
When setting `dataArrayTexture.needsUpdate = true`, Three.js uploads the **entire** texture array to the GPU. For a 64-slot array at 300×450×4 bytes each, that's ~34.5 MB per upload - causing significant frame drops.

### Solution
Use `addLayerUpdate(slotIndex)` to mark only changed layers, then set `needsUpdate = true`:

```typescript
// ❌ BAD: Uploads entire array (~34MB)
this.dataArrayTexture.needsUpdate = true

// ✅ GOOD: Uploads only changed slots (~540KB each)
for (const slot of this.dirtySlots) {
    this.dataArrayTexture.addLayerUpdate(slot)
}
this.dataArrayTexture.needsUpdate = true
this.dirtySlots.clear()
```

### Impact
- **60x reduction** in GPU upload size per flush
- Frame spikes reduced from 50-65ms to near-zero
- Essential for any dynamic texture array system

### References
- [Three.js DataArrayTexture.addLayerUpdate()](https://threejs.org/docs/#api/en/textures/DataArrayTexture.addLayerUpdate)

---

## Frame Budget Scheduling for Main Thread Work

**Date**: 2024-12-09  
**Context**: Texture array `.set()` operations causing frame dips when multiple complete simultaneously  
**Scope**: Any work that can be deferred without user-visible delay

### Issue
When multiple async operations (like texture loads from IndexedDB) complete in the same frame, their callbacks all run synchronously, overwhelming the frame budget.

### Solution
Create a frame-budget-aware scheduler that:
1. Tracks rolling average frame time
2. Checks remaining budget before executing tasks
3. Defers tasks to next frame if budget exhausted
4. Processes deferred tasks at frame start (when budget is full)

```typescript
// Schedule work that can be deferred
scheduler.tryExecuteOrSchedule(() => {
    arrayData.set(pixels, offset)
}, { estimatedMs: 0.5, maxDeferMs: 500 })
```

### Key Design Points
- Use `maxTasksPerFrame` to limit batch size (1-3 for smooth frames)
- Use time-based `maxDeferMs` instead of frame counting (more efficient)
- Schedule entire logical operations together (copy + state + callback)

---

## Profiling Async vs Sync Bottlenecks

**Date**: 2024-12-09  
**Context**: Needed to identify what was actually causing frame drops  
**Scope**: Performance debugging

### Lesson
When profiling shows near-zero main thread time but frames are still dropping, the bottleneck is likely:
1. **GPU operations** (texture uploads, draw calls)
2. **Browser internals** (promise microtask queue flooding)
3. **Async operation clustering** (many callbacks in same frame)

Async "round-trip time" (like worker messages or IndexedDB reads) doesn't block the main thread - it's waiting time. The actual work happens when the callback runs.

### Debugging Approach
1. Instrument all sync operations with `performance.now()` timing
2. If main thread time is low but frames drop, look at GPU or batching
3. Use browser DevTools Performance tab to see actual frame breakdown
