# Implementation Plan: SteamSpy Tags via Lambda

## Context and Goals
We need to enrich our Steam library data with community tags to provide better sorting and categorization in the WebXR VR environment. SteamSpy provides these tags sorted by vote count via a public API.

**Key Constraints:**
- SteamSpy has a strict **1 request per second** rate limit.
- We process a user's library of 50–500 games, meaning we need to spread requests over time to avoid hitting the rate limit.
- Tags change rarely — heavy caching is preferred; refresh is a future concern.
- **No new client-side API calls.** Tags are included inline in existing library responses. The client type definition expands; the call pattern does not.

## Phase 1 - MVP (Current Scope)
The MVP focuses on flowing tags into the existing game data response, caching them server-side, and wiring them into the type system.

### 1. Augment the Existing Library Response
Rather than a new `/tags` endpoint the client must call separately, tags are folded into the existing game data responses the Lambda already returns. The client receives enriched game objects — it does not need to know about SteamSpy at all.

**Approach:** When the Lambda processes a batch of games, it checks the SteamSpy tag cache for each `appid`. Cache hits attach `tags` directly to the game object in the response. Cache misses are queued for background fill (see §2 below).

### 2. Background Tag Fetcher (Sequential, 1 req/s)
Tags for cache-missing games are fetched after the main response returns, or on a subsequent warm invocation (via a scheduled Lambda or the next library load). Requests to SteamSpy *must* be sequential:

```javascript
// Conceptual — runs as background/async fill, not blocking main response
for (const appid of appidsToFetch) {
  const data = await fetchFromSteamSpy(appid);
  await saveToCache(appid, data);
  // Delay between calls to respect the 1 req/s hard limit
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

MVP simplification: fetch a fixed small ceiling (e.g. 5 games) per invocation. This keeps Lambda execution time bounded (~5s for 5 misses) and builds the cache incrementally over repeated loads.

### 3. Cache Strategy & Schema
Tags go into a **DynamoDB table** — lightweight, fast key-value lookup, DynamoDB TTL handles expiry automatically.

**Table:** `SteamSpyTags`
- **Partition Key:** `appid` (Number)
- **Attributes:**
  - `tags` (Map) — e.g., `{"Action": 500, "Sci-fi": 200}` (tag name → vote count)
  - `updatedAt` (String/ISO-8601)
  - `expiresAt` (Number/epoch) — TTL, set to `now() + 30 days`

**Flow per library load:**
1. `BatchGetItem` against `SteamSpyTags` for all `appids` in the request.
2. Attach cached tags directly to matching game objects in response.
3. Collect cache-miss `appids` (capped at 5 for MVP).
4. Fetch them sequentially from SteamSpy with 1s delays; write to cache.
5. Attach freshly-fetched tags to remaining game objects before returning (if within Lambda budget), otherwise they arrive on next load.

### 4. Type Definition Update (Client)
The only client change needed is expanding the `SteamGameData` interface to make `tags` an optional field. No new fetch logic, no new API calls:

```typescript
// client/src/scene/game-box/types/GameData.ts
export interface SteamGameData extends SteamGameMetadata {
    // ... existing fields ...
    /** Community tags from SteamSpy, keyed by tag name → vote count. Present when cached. */
    tags?: Record<string, number>;
}
```

`GameSortFunctions.ts` can then add a `groupByPrimaryTag` strategy that reads this field and falls back to genre when absent — no code changes needed until we actually want to expose that sort option in the UI.

### 5. Infrastructure
- **DynamoDB table** provisioned in Terraform (`infrastructure/modules/lambda`).
- **IAM policy** updated to grant the Lambda `dynamodb:BatchGetItem`, `dynamodb:PutItem` on the new table.
- Existing S3-based app details cache is unchanged.

## Out of Scope for MVP
- **Refresh mechanisms** — TTL handles expiry; no forced refreshes.
- **Client-visible tag sort mode** — type def arrives now, UI wiring is a future branch.
- **Admin tooling** for cache inspection or rate-limit monitoring.

## Next Steps
1. Add DynamoDB `SteamSpyTags` table to Terraform.
2. Add `BatchGetItem` tag lookup + sequential SteamSpy fill to the existing Lambda handler.
3. Expand `SteamGameData` type def with optional `tags` field.
4. Add `groupByPrimaryTag` stub to `GameSortFunctions.ts` (no UI wiring yet).
