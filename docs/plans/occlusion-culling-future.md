# Occlusion Culling — Future Performance Investigation

**Branch archived**: `origin/occlusion-culling` (kept for reference, not merged)
**Date archived**: 2026-04-05
**Reason for deferral**: After GPU instancing of shelves and game boxes, draw calls dropped significantly and frame rate was no longer a bottleneck. The branch's implementation hadn't been tested under real load and had known correctness issues.

---

## When to Revisit

Revisit this if:
- Frame rate degrades as library sizes grow (800+ games)
- VR performance budget becomes constrained
- The store layout grows in physical size (more shelves = more geometry)

---

## What Was Built

**`OcclusionCullingManager`** — 2D line-of-sight sweep-line algorithm
- Projects 3D scene to top-down 2D (X/Z plane)
- Finds shelves that can act as occluders
- Uses horizontal segment accumulation (sweep-line) to determine visibility
- Ran every 500ms via render loop

**Key files** (on `origin/occlusion-culling`):
- `client/src/scene/game-box/OcclusionCullingManager.ts` — core algorithm (524 lines)
- `client/src/scene/game-box/DebugVisualizationManager.ts` — debug overlay ("1" key toggle)
- `client/src/scene/game-box/GameBoxPerformanceManager.ts` — orchestration

---

## Known Issues at Deferral

- Not tested with real Steam game data loaded
- Debug visualization caused recalculation flicker (didn't pause during inspection)
- Shelf detection used name-matching heuristics, not actual geometry queries
- Only considered X-axis occlusion (no Y-axis / height handling)
- Performance impact unmeasured; CPU cost at scale unknown

---

## Better Approach (from `sweep-line-occlusion-improvements.md` on the branch)

The sweep-line implementation was overly complex. A simpler, more correct approach:

```typescript
// For each game box, check if any nearer shelf horizontally spans it:
function isOccluded(gamePos: Vector2, occluders: Shelf[]): boolean {
    const gameDist = camera.distanceTo(gamePos)
    for (const shelf of occluders) {
        if (shelf.distance < gameDist &&        // shelf is closer
            gamePos.x >= shelf.minX &&           // game is within shelf's horizontal span
            gamePos.x <= shelf.maxX) {
            return true
        }
    }
    return false
}
```

Additional improvements to consider when resuming:
1. **Frame-based updates**: recalculate every 10+ frames, not every 500ms
2. **Indexed shelf positions**: pre-calculate shelf boundaries once at spawn time
3. **Screen-space sectioning**: divide viewport into ~12 horizontal zones, cull per zone
4. **WebWorker**: move calculation off main thread entirely
5. **Shader-based**: explore GPU-side occlusion for zero CPU cost

---

## Performance Targets (from original branch notes)

| Stage | Draw Calls | Notes |
|-------|-----------|-------|
| Current (instanced) | ~300-500 | Already much better than original ~3300+ |
| Phase 1 goal | ~150 | Simple distance-based occlusion, every 10 frames |
| Phase 2 goal | ~80 | Indexed shelf system + screen-space sectioning |

---

## References

- `origin/occlusion-culling` — original implementation branch (do not delete)
- `docs/technical/occlusion-culling-wip.md` — status doc on that branch
- `docs/technical/sweep-line-occlusion-improvements.md` — improvement proposals on that branch
