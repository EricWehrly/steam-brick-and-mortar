# WORK.md — feat-section-per-layout-v2

**Branch:** `openclaw/feat-section-per-layout-v2`
**Base:** `openclaw/feat-renderer-lifetime-clean` (includes ordering + reload/layout split fixes)

## Goal
Implement Section-Per-Layout (SPL) with clean, phase-specific event ownership:
1) immutable library manifest,
2) definitions-ready grouping/sorting,
3) artwork/placement completion.

## Why now
- Current overlap (`DataLoaded` + `GameDataReady`) was semantically muddy.
- Batch/placement ownership was split across multiple emitters.
- Regressions (empty shelves/sign gaps) indicated readiness boundaries needed to be explicit.

---

## Milestone 1 (this pass)

### A. Event seam cleanup (single-owner boundaries)
- [x] Added `SteamEventTypes.LibraryManifestReady` + payload type (`SteamLibraryManifestReadyEvent`)
- [x] Moved canonical `GameDataReady` emission to `SteamIntegration` (definitions-ready seam)
- [x] Removed `GameDataReady` emission from `BatchCoordinator`
- [x] Updated `GameBoxSpawner` capacity init to listen to `LibraryManifestReady`
- [x] Kept `DataLoaded` as integration/UI refresh signal

### B. Layout-change replay semantics
- [x] `StorePropsCoordinator` now re-emits `LibraryManifestReady` + `GameDataReady` from DataManager state on layout change

### C. Documentation updates (existing docs only)
- [x] `docs/plans/layout-pipeline-plan.md` — rewritten event seam table by 3 phases
- [x] `docs/features/gamesort-full-pipeline.md` — updated status + contract section
- [x] `docs/agent-context/component-interaction-map.md` — added canonical runtime event flow header

### D. Regression coverage
- [x] Updated unit tests for new ownership (`BatchCoordinator` no longer emits `GameDataReady`)
- [x] Updated GameBoxSpawner tests to manifest-based renderer initialization
- [x] Added integration guard: `event-ordering-library-readiness.int.test.ts`
- [x] Simplified/retargeted `games-on-shelves-regression.int.test.ts` to manifest+sections+batches contract

---

## Validation run summary

### Unit (`yarn test ...`)
- [x] `test/unit/scene/batch/BatchCoordinator-game-data-ordering.test.ts`
- [x] `test/unit/scene/spawning/GameBoxSpawner.test.ts`
- [x] `test/unit/scene/categorization/GameSorter.test.ts`
- [x] `test/unit/scene/ShelfSectionPlanner.test.ts`

### Integration (`yarn test:integration ...`)
- [x] `test/integration/games-on-shelves-regression.int.test.ts`
- [x] `test/integration/event-ordering-library-readiness.int.test.ts`

---

## Remaining follow-ups
- [ ] Decide whether `DataLoaded` naming should be narrowed (`SteamSessionReady` / similar) to reduce confusion with `GameDataReady`.
- [ ] Consider explicit `GameDefinitionsBatchReady` / `GameDefinitionsReady` events if we want phase-2 batch semantics separate from `GamesBatchReady` transport semantics.
- [ ] Optional: add direct integration assertion for sign object presence once sign renderer/test harness contract is made deterministic in integration env.
