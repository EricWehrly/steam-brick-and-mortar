# LOD Application Strategies - Brainstorm

## Goal
Apply LOD dynamically to game boxes based on viewer distance/attention, while:
- Minimizing raycasting and per-frame computation
- Managing memory by only keeping high-LOD textures for visible/nearby games
- Smooth transitions that don't jar the user
- **Layout-agnostic**: Works regardless of how shelves/games are arranged

## Current System
- 3 LOD levels: High (512px), Mid (128px), Low (16px)
- Per-instance `lodLevel` attribute enables mixed LOD in same draw call
- All 3 texture arrays always loaded for all games (no memory savings yet)

---

## Chosen Approach: Incremental Distance-Based Updates

### Core Philosophy
- **Cheap checks, infrequent execution**: Check can be "expensive" but runs rarely
- **Parcel-based updates**: Check a subset of games each cycle, not all at once
- **Distance from camera**: Simple, layout-agnostic, no raycasting needed
- **Generous thresholds**: Hysteresis to prevent thrashing at boundaries
- **Layer complexity incrementally**: Distance first, then frustum, then occlusion

### Why This Works
1. **Games near player rarely need updates** - they're solidly in HIGH zone
2. **Games far away rarely need updates** - they're solidly in LOW zone  
3. **Only games near LOD boundaries need checking** - the "transition zone"
4. **Player movement doesn't matter** - expensive frames are expensive anyway
5. **Host system adaptive** - can tune check frequency based on frame budget

---

## Implementation Plan

### Phase 1: Distance-Based LOD Manager (Foundation)

**New class: `LodDistanceManager`**

```typescript
interface LodDistanceConfig {
    /** Distance thresholds for LOD transitions */
    highToMidDistance: number      // e.g., 3.0m - switch from HIGH to MID
    midToLowDistance: number       // e.g., 8.0m - switch from MID to LOW
    
    /** Hysteresis to prevent thrashing (games must move this far past threshold) */
    hysteresis: number             // e.g., 0.5m
    
    /** How many games to check per update cycle */
    gamesPerCycle: number          // e.g., 20-50 games
    
    /** Frames between update cycles */
    framesBetweenCycles: number    // e.g., 60 frames (~1 second at 60fps)
}
```

**Algorithm:**
```
Every ~60 frames:
    1. Get camera position
    2. Pick next batch of games (round-robin through all instances)
    3. For each game in batch:
        a. Calculate squared distance to camera (avoid sqrt)
        b. Determine ideal LOD based on distance + hysteresis
        c. If LOD changed, call setInstanceLod()
    4. Advance batch pointer for next cycle
```

**Key optimizations:**
- Use squared distances (no sqrt)
- Round-robin through games (spreads load evenly)
- Skip games that haven't moved (static positions)
- Batch LOD changes to minimize GPU attribute updates

### Phase 2: Priority Zones (Optional Optimization)

Instead of pure round-robin, weight checking toward the "transition zones":

```
Zone A: 0 - highToMid distance     → Check rarely (stable HIGH)
Zone B: highToMid - midToLow       → Check frequently (transition zone)  
Zone C: beyond midToLow            → Check rarely (stable LOW)
```

Games in Zone B get checked 3x more often than Zone A/C.

### Phase 3: Frustum Awareness (Layer On)

After distance check, additionally consider:
- Games behind camera can stay at LOW even if "close"
- Games directly in view get priority for HIGH
- Use dot product with view direction (cheap)

```typescript
const toGame = gamePos.sub(cameraPos).normalize()
const viewDir = camera.getWorldDirection()
const inFrontOfPlayer = viewDir.dot(toGame) > 0  // positive = in front

if (!inFrontOfPlayer && currentLod !== LOW) {
    // Behind player - can demote to save resources
    demoteToLow(instanceIndex)
}
```

### Phase 4: Occlusion Hints (Future)

For dense shelf layouts, games occluded by other shelves could stay LOW.
This is expensive to compute accurately - defer until needed.

---

## Concrete Implementation Tasks

### Task 1: Create LodDistanceManager class
**File**: `client/src/scene/game-box/instancing/LodDistanceManager.ts`

- Constructor takes `LodArtworkRenderer` reference
- Stores game positions from instance metadata
- Tracks current LOD per instance
- Frame counter for cycle timing
- Batch pointer for round-robin

### Task 2: Integrate with render loop
**File**: `client/src/core/RenderLoop.ts` or similar

- Call `lodManager.update(camera)` each frame
- Manager internally tracks frame count, only acts every N frames

### Task 3: Add configuration to AppSettings
**File**: `client/src/core/AppSettings.ts`

- `LodUpdateFrequency`: frames between checks (default: 60)
- `LodHighDistance`: HIGH→MID threshold (default: 3.0)
- `LodMidDistance`: MID→LOW threshold (default: 8.0)
- `LodHysteresis`: threshold buffer (default: 0.5)

### Task 4: Debug visualization (optional)
- Show LOD level as color tint on game boxes
- Display update stats in debug panel

---

## Distance Threshold Considerations

### VR vs Desktop
- VR: Player is "in" the scene, distances feel different
- Desktop: Camera can be anywhere, zoomed in/out
- May need different defaults for each mode

### Suggested Starting Values
```
HIGH zone:  0 - 3m    (arm's reach, examining games)
MID zone:   3 - 8m    (browsing a shelf)
LOW zone:   8m+       (overview, far walls)
Hysteresis: 0.5m      (must move 0.5m past threshold to trigger)
```

### Tuning Strategy
1. Start with generous thresholds (more HIGH than needed)
2. Measure frame times with LOD active vs all-HIGH
3. Tighten thresholds until visual quality degrades
4. Add debug key to cycle through "all HIGH / all MID / all LOW / auto"

---

## Memory Budget Considerations

Current state (all LODs always loaded): ~545MB

Future optimization (deferred HIGH loading):
- Only load HIGH textures for games currently at HIGH LOD
- LRU cache for HIGH textures (keep ~100 most recent)
- Could reduce to ~133MB total

This is Phase 2 work - get distance-based switching working first.

---

## Questions to Resolve During Implementation

1. **Where does LodDistanceManager live?**
   - Owned by GpuStorePropsRenderer? 
   - Standalone singleton?
   - Event-driven initialization?

2. **How to get camera reference?**
   - Pass to update() each frame
   - Store reference at init
   - Query from DataManager

3. **How to handle batch updates efficiently?**
   - Collect all LOD changes, apply once at end of cycle
   - Or apply immediately (simpler, probably fine)

4. **Performance monitoring?**
   - Track time spent in LOD updates
   - Adaptive frequency based on frame budget

---

## Notes from Eric

_"The games nearest the player are least likely to need updating at a given time, as well as those furthest. So we probably only want to check those near the distance we might set for our LoD"_

_"The check can be expensive, but infrequent, for now. And we'll tune both."_

_"It doesn't matter to check if the player is moving or turning, because those will be 'expensive' draws anyway"_
