# Plan: Negative Caching for Dead AppIDs

## Phase 1: Lambda Proxy Caching
- **Goal:** Stop hammering the Steam API for games that consistently fail (delisted, hidden, private).
- **Investigation:** Determine the exact payload of Steam API failures. Are there nuances (e.g., region locked vs delisted) or is it always just `{"success": false}`?
- **Implementation:** Modify the proxy lambda to catch these failures, wrap them in a standard "negative shell" (e.g., `{ appid, success: false, reason: "..." }`), and save them to the S3 cache so future requests get a cache hit.
- **Hydrator Considerations:** Check if SteamSpy has data for these delisted games. If so, consider having the hydrator or base proxy fall back to SteamSpy for title/metadata when Steam refuses to provide it.

## Phase 2: Client Handling
- **Goal:** The client must understand the cached negative responses and stop requesting them from the proxy, while gracefully rendering an "Unknown/Delisted Game" box or skipping them in the VR UI.
- **Implementation:** Update `SteamIntegration.ts` and caching layer on the client to handle the `{ success: false }` payloads.