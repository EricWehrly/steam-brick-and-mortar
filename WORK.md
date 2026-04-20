# WORK.md — feat-group-sort-separation

**Branch:** `openclaw/feat-group-sort-separation`  
**Base:** `act1-intermission`

## Goal
Separate Group, Sort, and Layout as three independent player-facing controls.
No shimming: clean split, old fused `GameSortMode` deleted.

## Approach
1. **Types first** (`GroupMode`, `SortMode`, update `Section` + events)
2. **Logic** (`GroupResolver` partitions, `GameSorter`/`SectionSorter` sorts within)
3. **UI** (`LayoutControlPanel` — three dropdowns)

## Affected files
- [ ] `src/types/LayoutTypes.ts` — add `GroupMode`/`GroupModes`
- [ ] `src/types/EnvironmentEvents.ts` — `GroupMode`/`SortMode` in events, delete old `GameSortModes`
- [ ] `src/scene/categorization/GameSorter.ts` — rewrite as two-stage
- [ ] `src/scene/categorization/GroupResolver.ts` — new file
- [ ] `src/ui/LayoutSortPanel.ts` → `src/ui/LayoutControlPanel.ts` — three dropdowns
- [ ] `src/ui/index.ts` or wiring — re-export

## Open questions
- Does `SteamIntegration.isAnonymous()` check for initial group mode still make sense? 
  (anonymous → no recency data → default group 'by-genre' still valid)
