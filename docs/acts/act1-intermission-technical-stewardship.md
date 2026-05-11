# Intermission: Technical Stewardship

## Overview

**Goal**: Pay down accumulated technical debt, establish measurable performance baselines, and stabilize tooling — without shoehorning this work into Act 1 or Act 2.

**Scope**: Instrumentation, resource efficiency, UI normalization, and debt scheduling. This is not a product act. It exists because stewardship work doesn't belong to any major feature goal, but it's real work that deserves its own clear demarcation.

**Entry Criteria**: Act 1 complete — all imagined functionality demonstrated with personal demo capability.

**Exit Criteria**: All three goals met:
1. Key metrics instrumented and hitting targets (memory, frame time, draw calls, time-to-interactive, hitches tracked and understood)
2. Background tab measurably drops resource usage (frame rate and LOD)
3. UI standardization complete (remaining panels token-ified, LayoutSortPanel polished, no layout regressions)

## Features

**Core (must land before Act 2 ramp):**
- [Key Metrics Instrumentation](../features/key-metrics-instrumentation.md) — frame time, memory, hitch detection
- [Background Resource Reduction](../features/background-resource-reduction.md) — Page Visibility API, LOD disable on blur, frame throttle
- [UI Standardization](../features/ui-standardization.md) — design tokens, component library, VR-ready architecture
  - Active implementation roadmap: [UI Normalization Plan](../plans/ui-normalization-plan.md)
  - Token source of truth: [UI Design Tokens](../plans/ui-design-tokens.md)
  - Current inconsistency inventory: [UI Normalization Audit](../plans/ui-normalization-audit.md)

**First-Start Follow-Up (must land — game rendering pipeline):**
- [First-Start Follow-Up Plan](../plans/first-start-followup-plan.md) — four issues surfaced during anonymous→logged-in user transition:
  1. **Double-allocation fix** ✅ — don't materialize game boxes until artwork resolves; remove eager label creation (P1, small)
  2. **Progressive batch loading** ✅ — emit rendering batches as network batches complete, not all-at-once after 25s (P2, medium)
  3. **Re-sort on user change** ✅ — split texture loading from instance placement so `GamesSort` can reposition boxes (P3, large, own branch). See also `resort-game-placement-plan.md` and `texture-placement-split-plan.md`.
  4. **Label slot exhaustion** — effectively resolved by #1; standalone fix is pool sizing (P4, small)

**Nice to Have (best effort, punt when stuck):**
- [GPU Memory Leak Investigation](../features/gpu-memory-investigation.md) — periodic `renderer.info.memory` reporter (dev mode), baseline counts, leak identification
- Lint baseline pass — max-params rule, TD ID convention enforcement, encoding regression fixes. See `docs/plans/linter-contract.md` for detailed rules, current violation counts, and strict-mode enablement checklist.
- suppressEmit refactor in `GpuStorePropsRenderer` — single dedicated call site
- `GpuStorePropsRenderer` split — extract layout-related functionality to its own class
- Tech debt triage session — review `tech-debt.md`, assign Do Now / Act 2 / Later / Drop to each item
- `ShelfSide` Front/Back rename to Near/Far ✅ — naming is backwards vs. player-facing intuition; currently papered over with inline comment
- Back-row suppression policy — hardcoded `rowIndex < 4` should become a `ShelfLayoutPolicy` type
- `ShelfSurfaceUtils` sort order unit test — top-to-bottom ordering has no test yet (`// TD [shelf-surface-sort]`)
- ~~Raycast drag suppression~~ ✅ — click selection now suppresses after meaningful mouse drag delta; guard coverage added
- Test-suite cost reduction pass (**higher-priority debt**) — audit slow/duplicative tests, consolidate overlapping integration tests
- Playwright scene-health collector (**lower-priority debt**) — one load per mode, shared collectors for logs/memory/startup/screenshot; no duplicated app loads

## Notes

- Active background items and open threads should be tracked directly in act docs + `tech-debt.md` (the old open-subagent tracker is deprecated).
- The categorization work (GameSorter, ShelfSectionPlanner, sort modes) is pull-forward eligible if bandwidth allows — it doesn't need to wait for full Act 2 ramp.
- The old detailed bucket breakdown is archived at `docs/archive/intermission-before-phase2.md` (superseded by this doc).
- The intermission is intentionally not a formal act. It does not have a user-facing delivery goal.
- When working on a feature, check whether related Encore items are plausibly quick — if so, pull them forward rather than leaving them for later. That's the intent of the Encore list.

## Act 1 Completed Infrastructure (for reference)

These shipped during Act 1 and are largely done. Captured here so nothing is lost when Act 1 gets its own doc:
- [Worker Infrastructure](../features/worker-infrastructure.md) — `ManagedWorker` base class; all workers migrated; `WorkerErrorUtils` deleted; main-thread hitch reduction. **One item pending** (carpet worker off-thread); check-in during Key Metrics work.
