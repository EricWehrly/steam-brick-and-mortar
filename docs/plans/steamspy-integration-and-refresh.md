# Future Work: Cache Refresh & Data Integration

## Phase 1: User-Initiated Library Refresh
- **Goal:** The client retrieves the user's library (`GetOwnedGames`) but doesn't have a reliable, user-facing mechanism to force a fresh pull when they buy a new game without poisoning the local cache if the remote is unresolvable.
- **Client UI:** Wire up the existing Cache UI tab in the settings menu to trigger a "Refresh Library" action.
- **Cache Busting Strategy:** Do not simply delete IndexedDB. Instead, fetch the new list with a flag (e.g., `?force_refresh=true`) and gracefully merge/overwrite the local cache only if the remote request succeeds.

## Phase 2: SteamSpy Data Integration (Client)
- **Goal:** Now that the background hydrator attaches tags and review scores to the S3 cache, we need the client to consume and use them.
- **Type Definitions:** Update `SteamAppDetails` in `client/src/types/Steam.ts` to include `steamspy_tags`, `positive`, `negative`, `userscore`, and `owners`.
- **Exposing the Data:** Update `SteamIntegration.getGameDetails(appId)` to parse these fields from the cached JSON and attach them to `GameMetadata`.
- **Usage (Sorting/Filtering):** Integrate the new fields into `GameSorter` and `LayoutSortPanel` (e.g., sort by User Score, sort by Review Count, sort by Tag).