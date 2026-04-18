# First-Run Experience: Current Status

**Branch**: `openclaw/firs-logins`  
**Last updated**: 2026-04-17  
**Related**: `docs/features/first-load-experience.md`, `docs/plans/first-start-followup-plan.md`

---

## What "First Run" Means

The intended flow:

1. **Anonymous store** — user arrives with no account. App loads 18 demo games (all F2P) into a small store. One shelf, titled "Free to Play" (currently incidental, may become intentional).
2. **Username entry** — user types a Steam vanity URL or Steam ID into the UI.
3. **Library load** — app resolves their Steam ID, fetches their 835-game library in network batches (~25s uncached), then emits those games into the rendering pipeline.
4. **Personalized store** — room expands, shelves multiply, games appear sorted and signed.

**The problem**: step 4 doesn't work. After username entry, the personalized store never materializes. The anonymous shelf empties out and that's it.

---

## Root Cause (Confirmed by Logs)

`ShelfLayoutCoordinator` computes the arc shelf layout **once** on the first `BatchReadyForPlacement` event and sets `layoutComputed = true`. It never resets between runs.

When the real user's 47 batches arrive:
- Batch 0 hits the `!layoutComputed` branch → ~~but wait~~ — **actually** `layoutComputed` is already `true` from the anonymous run. So batch 0 skips layout computation and goes straight to `emitShelfForBatch(0)`. `shelvesByBatch` has only 1 entry (for the anonymous store), so batch 0 might succeed, but batches 1–46 all miss.
- Result: 46 consecutive `[ShelfLayoutCoordinator] WARN No shelf layout found for batch N` — confirmed in both log exports.

The "Fix: detect `totalBatches` change and call `dispose()`" from the 2026-04-16 memory was **not committed** to this branch. It was on a separate local branch that no longer exists.

### Fix Applied (2026-04-17)
`ShelfLayoutCoordinator.handleFirstBatch()` now has an `else if` branch: when `layoutComputed` is true but `totalBatches` has changed, it calls `this.dispose()` and recomputes. This is the re-application of the intended fix.

**File**: `client/src/scene/shelves/ShelfLayoutCoordinator.ts`

---

## Remaining Issues

These are the known gaps after the ShelfLayoutCoordinator fix. Ordered by impact on the visible first-run experience.

### 1. Old Anonymous Store Not Cleared (High)

When the real user's batches start arriving, the anonymous store's shelf geometry, game boxes, and GPU resources are still in the scene. No `ClearRequest` is emitted before the new data flows in. The room should either:
- Be cleared and rebuilt cleanly, or
- Have a defined transition (dissolve, etc.)

Currently: the anonymous shelf empties (because `GpuGameBoxRenderer` is disposed and reallocated for the new game count), but the physical shelf mesh stays. New shelves spawn on top of old ones.

**No fix yet.** Needs a `ClearRequest` (or equivalent teardown) to fire when a user identity is established. Likely should be triggered from `SteamIntegration.handleLoadGames` before the batch pipeline starts.

### 2. Games Load All-at-Once, Not Progressively (High)

The Steam API fetches in 9 network batches of ~100 games each (~25s total). All `GamesBatchReady` events are buffered and emitted at the end — meaning the store stays empty for 25s then snaps to fully populated. This is both a bad UX and a source of frame hitches.

**No fix yet.** Documented in `first-start-followup-plan.md` Issue 2. Requires changes to `SteamApiClient` / `BatchAppDetailsClient` to emit per network batch instead of buffering.

### 3. Room Does Not Resize for Real User's Library (High)

The room is sized for the anonymous store (6×8×3, one shelf). When 47 shelves need to spawn, the room stays tiny. `ShelfLayoutDetermined` fires with new `shelfBounds` — `RoomManager` should respond but may not be wired to handle a second resize.

**Status unclear.** Needs testing after the ShelfLayoutCoordinator fix is in.

### 4. No Re-sort After User Change (Medium)

Even if shelves spawn correctly, game boxes don't re-sort to reflect the real user's library. `GamesSort` fires but placement doesn't update. Documented in `first-start-followup-plan.md` Issue 3 and `resort-game-placement-plan.md`. This is the large refactor (load/place split on `GpuGameBoxRenderer`).

### 5. "Free to Play" Label Is Accidental (Low)

The anonymous store demo games are all F2P, so `ShelfSectionPlanner` labels the shelf "Free to Play" — correct by coincidence, not by design. Fine for now; worth revisiting when the anonymous fixture set is curated.

---

## What Works

- ✅ Anonymous store loads correctly: 18 games, 1 shelf, sorted by genre
- ✅ `BatchCoordinator` resets state between runs (clears when `completionEmitted` + new batch 0 arrives)
- ✅ `GpuGameBoxRenderer` disposes and reallocates for the new game count on re-run
- ✅ `InstancedLabelRenderer` disposes and reallocates (118 → 946 slots) — visible in logs
- ✅ Permanent artwork failure gating (labels only on confirmed-dead artwork, not transient failures)

---

## Log Signature of the Bug

From `console-export-2026-4-17_11-6-28.log`, after username entry:

```
[GpuStorePropsRenderer] INFO [ASYNC] renderer-initialization: 17.0ms (totalBatches: 47)
[ShelfLayoutCoordinator] WARN No shelf layout found for batch 1
[ShelfLayoutCoordinator] WARN No shelf layout found for batch 2
... (through batch 46)
[SteamApiClient] INFO [ASYNC] Emitted 835 uncached games with metadata in 47 batches
```

No `ShelfReady` events fire for batches 1–46. No `GamesPlaced` events for those batches. The `BatchCoordinator` never reaches `AllBatchesComplete`. The store stays empty.

After the fix, the expected log sequence is:
```
[ShelfLayoutCoordinator] DEBUG Batch count changed (1 → 47) — resetting layout
[ShelfLayoutCoordinator] DEBUG Computing arc layout for 47 shelves
[ShelfLayoutCoordinator] DEBUG Layout determined for 47 shelves
```
Followed by 47 `ShelfReady` → `GamesPlaced` pairs and a `BatchCoordinator` summary.

---

## Next Steps (Suggested Order)

1. **Test ShelfLayoutCoordinator fix** — enter username, confirm shelves spawn and games appear
2. **Wire ClearRequest on user login** — clear the anonymous store before new data arrives
3. **Verify room resize** — confirm `RoomManager` responds to second `ShelfLayoutDetermined`
4. **Progressive batch emission** — emit `GamesBatchReady` per network batch (Issue 2 from followup plan)
5. **Re-sort on user change** — load/place split (large, own branch)
