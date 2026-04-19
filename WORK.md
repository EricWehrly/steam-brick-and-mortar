# WORK.md

## Task
Capture post-PR architectural intent and bootstrap next branch work for layout pipeline cleanup.

## Branch
`openclaw/feat-layout-registry`

## Approach
- Start new branch from `origin/act1-intermission` (default target branch available in remote).
- Capture future architecture in planning doc:
  - `ILayoutDefinition` + `LayoutRegistry` barrel as single source of truth.
  - Coordinator lifecycle split (resettable singleton coordinators vs disposable GPU owners).
  - Keep section-per-layout plan and UI gating item.
- Mark immediate technical debt at call sites with `TD` comments.

## Files touched
- [x] `docs/plans/layout-variations-next-steps.md`
- [x] `client/src/scene/shelves/ShelfLayoutCoordinator.ts`
- [x] `client/src/scene/props/StorePropsCoordinator.ts`
- [x] `WORK.md`

## Open questions
- Whether to execute lifecycle model changes in same branch as section-per-layout or split into a prep branch.
- Whether `GameBoxSpawner` remains data-only enough for singleton+reset, or should stay per-rebuild instance.
