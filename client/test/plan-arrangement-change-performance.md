# Plan: Arrangement Change Performance Tests

**Goal:** Create deterministic tests that measure wall‑clock duration of arrangement changes (group/sort mode changes within same layout) and catch performance regressions.

## Current Status

- **Instrumentation added:** `StorePropsCoordinator` logs `🔄 Arrangement change completed in Xms`.
- **Reset optimization:** `InstancedShelfRenderer.reset()` no longer sets `meshesAddedToScene = false` (avoids 4‑frame stagger).
- **URL param overrides:** `?shadowQuality=0`, `?lightingQuality=…`, `?enableLighting=…` work.
- **Integration test skeleton** exists but fails due to:
  1. Wrong event constant (`GamesBatch` vs `GamesBatchReady`).
  2. Missing `GameSorter` instantiation (listeners not registered).
  3. Spy on `EventManager.emit` causing infinite recursion.
  4. Expecting `reset()` to be called when it isn’t (pipeline may not trigger `LayoutClearRequest`).
- **Visual test skeleton** exists but lacks network interception and test API.

## Phase 2: Fix Integration Test

### Step 1 – Verify Event‑Type Constants
- Compare with `event‑ordering‑library‑readiness.int.test.ts`:
  - `SteamEventTypes.LibraryManifestReady`
  - `GameEventTypes.GameDataReady`
  - `SteamEventTypes.GamesBatchReady`
  - `GameEventTypes.SectionsReady`
  - `StorePropsEventTypes.LayoutClearRequest`
  - `UIEventTypes.ArrangementRequested`
- Ensure imports match exactly.

### Step 2 – Instantiate GameSorter
- In `beforeEach`, create `new GameSorter()` (already in our latest version).
- Remove side‑effect import `import '../../src/scene/categorization/GameSorter'` if not needed.

### Step 3 – Simplify Test Flow
1. **Setup initial layout:**
   - Emit `LibraryManifestReady`
   - Emit `GameDataReady` (triggers `GameSorter` → `SectionsReady`)
   - Emit batches (`GamesBatchReady`)
   - Wait for `AllBatchesComplete` (or `GamesPlaced` for all batches)
2. **Trigger arrangement change:**
   - Spy on `EventManager.emit` **before** emitting `ArrangementRequested`.
   - Emit `ArrangementRequested` with `groupMode='by-recency'`.
3. **Wait for completion:**
   - Listen for `GamesPlaced` events until all batches placed (2 batches for 36 games).
   - Measure duration between emit and last `GamesPlaced`.
4. **Assert:**
   - Duration < 500 ms (mocked environment)
   - `LayoutClearRequest` emitted exactly once
   - `SectionsReady` emitted exactly once with new group mode
   - `InstancedShelfRenderer.reset()` called exactly once
   - `InstancedShelfRenderer.setInstance()` called >0 times

### Step 4 – Remove Problematic Spies
- Do **not** spy on `EventManager.emit` with a mock that calls the original (causes recursion).
- Instead, collect emitted events via a simple wrapper:
  ```ts
  const emitted: Array<[string, any]> = []
  const originalEmit = eventManager.emit
  vi.spyOn(eventManager, 'emit').mockImplementation((type, detail) => {
    emitted.push([type, detail])
    return originalEmit(type, detail)
  })
  ```

### Step 5 – Run and Debug
- Run test with `yarn test:integration arrangement-change-performance.int.test.ts`.
- If `reset()` not called, check if `LayoutClearRequest` was emitted (should be emitted by `GameSorter.handleArrangementRequested`).
- If `SectionsReady` not emitted, verify `GameSorter` is instantiated and `GameDataReady` triggered initial sections.

### Step 6 – Add Duplicate‑Arrangement Test
- After initial layout, emit `ArrangementRequested` with same `groupMode`/`sortMode`.
- Verify no `LayoutClearRequest` or `SectionsReady` emitted.

## Phase 3: Build Visual Test

### Step 1 – Create Network Interception Helper
- File: `test/visual/helpers/mock‑steam.ts`
- Function `mockSteamApi(page: Page, gamesCount = 36)`:
  - Intercepts `**/api/steam/**`
  - Returns static library JSON (36 games, split genres)
  - Returns mock details for each appid
- Use `page.route()`.

### Step 2 – Expose Test API (Dev‑Only)
- In `SteamBrickAndMortarApp.ts`, add:
  ```ts
  if (process.env.NODE_ENV === 'development') {
    (window as any).__testApi = {
      emitArrangementChange: (groupMode: GroupMode, sortMode: SortMode) => {
        EventManager.getInstance().emit(UIEventTypes.ArrangementRequested, { groupMode, sortMode })
      }
    }
  }
  ```
- Ensure `EventManager` is globally accessible (or expose it separately).

### Step 3 – Write Playwright Test
- File: `test/visual/arrangement‑change‑performance.spec.ts`
- Steps:
  1. `mockSteamApi(page)`
  2. `page.goto('/?diagnostics=1&shadowQuality=0')`
  3. `attachConsoleCollector(page)`
  4. `waitForSceneReady(page)`
  5. `page.evaluate(() => window.__testApi.emitArrangementChange('by-recency', 'by-playtime'))`
  6. Wait for console log containing `🔄 Arrangement change completed in Xms` (poll with `page.waitForFunction`).
  7. Extract duration, assert < 2000 ms (2 seconds).
  8. Optional: repeat with `?shadowQuality=4` (skip in CI if no GPU).

### Step 4 – Fallback: UI Interaction
- If test API not feasible, inspect `LayoutControlPanel` DOM for selectors.
- Use `data‑testid` or CSS classes to click group‑mode dropdown and select “By Recency”.
- Wait for change.

## Phase 4: CI Integration

### Integration Test
- Add to `yarn test:integration` (already runs on PR).
- Ensure it passes locally before committing.

### Visual Test
- Run nightly via scheduled workflow.
- Skip shadow‑quality tests in CI if GPU unavailable (`process.env.CI`).
- Store duration history (maybe in a simple JSON file) to detect regressions.

## Open Questions / Risks

1. **Global EventManager** – not exposed. May need to expose in dev mode (`window.__eventManager = EventManager.getInstance()`).
2. **Mock data divergence** – keep mock small but representative; update when Steam API schema changes.
3. **Flaky timing** – use generous timeouts (30 s) and retry once.
4. **CI GPU** – use SwiftShader or skip shadow tests.

## Next Immediate Action

1. **Fix integration test** using steps above.
2. **Commit passing test** to `openclaw/perf-shelf-reset-arrangement`.
3. **Then** move to Phase 3.

---

**Reference: Existing Test Patterns**
- `event‑ordering‑library‑readiness.int.test.ts`
- `batch‑to‑placement‑flow.int.test.ts`
- `games‑on‑shelves‑regression.int.test.ts`