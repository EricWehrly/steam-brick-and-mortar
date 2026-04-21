# WORK.md — feat-renderer-lifecycle

**Branch:** `openclaw/feat-renderer-lifecycle`  
**Base:** `act1-intermission`

## Goal
- Renderer initialized once per library load, sized to full game count
- Layout switches rebuild geometry without reloading library (no Steam API hit)
- All capacity checks removed

## Approach

1. `StorePropsCoordinator.handleLayoutRequested`:
   - Remove `SteamEventTypes.LoadLibrary` emit
   - Instead: emit `ClearRequest` + `SetupRequest` + `GameDataReady` (from DataManager)

2. `GameBoxSpawner`:
   - Listen to `GameDataReady` to initialize renderer at library size
   - On `ClearRequest` (layout switch): `clearPlacements()` only, keep renderer + prefetchResults
   - On genuine library reload signal: full dispose+recreate
   - Remove all capacity checks

3. Distinguish layout-switch ClearRequest from library-reload ClearRequest:
   - Option A: `StorePropsCoordinator` emits a separate `SceneRebuildRequested` event for layout switches
   - Option B: `ClearRequest` payload carries a `reason: 'layout-switch' | 'library-reload'`
   - Leaning toward Option B — same event, more information, no new event type

## Affected files
- [ ] `StorePropsCoordinator.ts` — remove LoadLibrary from layout switch
- [ ] `GameBoxSpawner.ts` — renderer init on GameDataReady; clearPlacements on layout-switch ClearRequest
- [ ] `PropsEvents.ts` — add reason field to StorePropsClearRequestEvent
- [ ] `SteamIntegration.ts` — emit ClearRequest with reason='library-reload'
- [ ] Tests
