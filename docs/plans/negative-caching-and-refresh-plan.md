# Plan: Negative Caching & Library Refresh

## Phase 1: Negative Caching for Dead AppIDs (Proxy Lambda)

**The Problem:** 
Currently, when the client requests app details for a game that has been delisted or made private on Steam, the Steam API returns `{"success": false}`. The Proxy Lambda sees this, throws an error, and returns it as a failure in the batch. Because it threw, the result is never saved to the S3 cache. Next time the user loads their library, the client asks for it again, resulting in repeated wasted Steam API calls (burning through the 10-request batch limits).

**The Solution:**
1. **Cache the Failure:** In `services/steam-api.js`, when Steam returns `success: false`, instead of throwing an error, we should return a standard negative shell (e.g., `{ success: false, unlisted: true }`). 
2. **Store in S3:** Save this negative shell to `appdetails/{appid}.json.gz` just like a real game. 
3. **Cache Hit:** Next time it's requested, `getFromCache` will load the negative shell. It counts as a cache hit, bypasses the Steam API entirely, and is returned to the client so the client knows to stop trying to fetch it.
4. **DRY `cache.js`:** While editing caching logic, update `getFromCache` to use a parameterized inner fetch function that takes the prefix (e.g., `hydrated`, `base`) to collapse the redundant `try/catch` blocks.

## Phase 2: User-Initiated Library Refresh (Client & Proxy)

**The Problem:**
The client retrieves the user's library (`GetOwnedGames`) but doesn't have a reliable, user-facing mechanism to force a fresh pull when they buy a new game. 

**The Solution:**
1. **Client-Side UI:** Wire up the existing Cache UI tab in the settings menu to trigger a "Refresh Library" action.
2. **Cache Busting:** When triggered, the client will bypass any local IndexedDB/memory storage for the game list and call the proxy's `/games/{steamid}` endpoint with a cache-busting flag (e.g., `?force_refresh=true`).
3. **Proxy Handling:** Ensure the proxy lambda respects `force_refresh` by skipping its own caches for the library list and fetching directly from Steam, then caching the fresh list. (Since the library fetch also triggers the background hydrator, this will automatically queue up any newly purchased games for SteamSpy tag hydration).
