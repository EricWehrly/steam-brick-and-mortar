# Network Fetch Optimization Plan

**Phase 1 (cached/uncached separation)**: ✅ COMPLETE — Dec 2025

Cached games now emit immediately. Uncached fetched in background, supplemental batches arrive later.

---

## Remaining Phases

### Phase 2: Known-Bad Game Tracking

Track failed fetches in IndexedDB, skip known-bad games on retry, use exponential backoff.

```typescript
interface FailedGameMetadata {
    appid: number
    failureType: '404' | '500' | 'timeout' | 'rate-limit'
    attemptCount: number
    lastAttempted: number
}
```

**Files**: `AppDetailsCache.ts`, `BatchAppDetailsClient.ts`, `SteamApiClient.ts`

---

### Phase 3: Metadata Backfill System

Event-driven metadata updates for uncached games without re-rendering already-placed game boxes.

**Files**: `InteractionEvents.ts`, `SteamApiClient.ts`, `GpuStorePropsRenderer.ts`

---

### Phase 4: Retry Logic with Backoff

Exponential backoff for transient failures (rate limits, timeouts), circuit breaker for cascading failures.

**Files**: `BatchAppDetailsClient.ts`

---

**Status**: Phases 2-4 are future work. No active timeline.
