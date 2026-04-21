# WORK.md — feat-renderer-lifetime

**Branch:** `openclaw/feat-renderer-lifetime-clean`  
**Base:** `origin/act1-intermission` (includes GPU-update-on-layout-determined fix)

## Goal
Separate artwork lifecycle from library lifecycle. `GpuGameBoxRenderer` lives library-lifetime, not layout-lifetime. Layout/sort/group switches don't dispose the artwork atlas or prefetch cache.

**Benefit:** Layout switches become instant (no Steam API reload, no artwork reprefetch). Unblocks section-aware distribution work downstream.

---

## Approach

### 1. Distinguish ClearRequest reasons
**File:** `client/src/scene/props/PropsEvents.ts`
- `StorePropsClearRequestEvent` already has `reason: 'layout-switch' | 'library-reload'`
- ✅ Already implemented (from prior work on this branch)

### 2. GameBoxSpawner lifecycle split
**File:** `client/src/scene/spawning/GameBoxSpawner.ts`

- **Initialize renderer once, library-sized** (GameDataReady)
  - On first `GameDataReady`: create `GpuGameBoxRenderer(totalGames + 100)`
  - Renderer lives for the library lifetime; don't dispose on layout switches
  
- **Layout-switch path** (ClearRequest with reason='layout-switch')
  - Call `renderer.clearPlacements()` only — keep renderer, keep prefetch cache
  - Clear geometry state (shelf positions, placement intents)
  - Replace `fullReset()` + `geometryReset()` distinction with conditional disposal
  
- **Library-reload path** (ClearRequest with reason='library-reload' or when batch count changes mid-session)
  - Dispose the renderer (frees artwork atlas, texture memory)
  - Clear all prefetch state
  - Reconstruct on next GameDataReady
  
- **Remove capacity checks**
  - Delete any `requiredCapacity > this.rendererCapacity` guards
  - Renderer is always full-library-sized; no under-provisioning edge case

### 3. Batch pipeline unchanged
**File:** `client/src/scene/batch/BatchCoordinator.ts`
- No changes needed. Batches still fire normally; `GameBoxSpawner` still prewarps.
- The key difference: prefetch results live beyond layout switches now.

### 4. Update tests
**Files:** `client/test/unit/scene/spawning/GameBoxSpawner.test.ts`
- Add test: layout switch does NOT dispose renderer
- Add test: library reload DOES dispose renderer
- Verify prefetch cache survives layout switch but not library reload

---

## Files Affected

- [ ] `client/src/scene/spawning/GameBoxSpawner.ts` — lifecycle split, remove capacity checks
- [ ] `client/src/scene/props/StorePropsCoordinator.ts` — pass ClearRequest reason, remove old dispose logic  
- [ ] `client/test/unit/scene/spawning/GameBoxSpawner.test.ts` — renderer lifecycle coverage
- [ ] (optional) `client/src/scene/props/PropsEvents.ts` — validate `reason` type is already present

---

## Implementation Order

1. Audit current GameBoxSpawner and identify all capacity checks
2. Add ClearRequest reason passing through StorePropsCoordinator
3. Refactor GameBoxSpawner.handleClearRequest to branch on reason
4. Update / add tests
5. Validate: layout switch is instant, prefetch cache survives

---

## Notes

- If batch count changes mid-session (new user, force-refresh), `handleBatchReadyForPlacement` should detect it and trigger library reload path
- Watch for deferred prefetch promises — they should be safer now since the renderer won't disappear under them
- Signage and shelves don't care about the renderer; no changes needed there
