# Cache Clear Domain Unification Plan

## Goal
Replace three inconsistent "clear cache" UI entry points with one event contract, driven by
strict, checkable cache-domain types instead of ad-hoc string scopes or direct method calls.

## Why now
While collapsing `SteamEventTypes.CacheClear`/`UserClear` into one event with a `scope: 'all' |
'identity'` field, a review of every place that clears a cache surfaced a wider, pre-existing
problem than that collapse alone fixes. See [[cache-clear-domain-unification]] in
`docs/tech-debt.md`.

**Update (2026-07-11):** the two concrete bugs this doc's "Current state" section identifies
(`CacheManagementPanel`'s direct calls skipping session state; dead `ImageCacheClear` wiring) are
now fixed — see the tech-debt entry's "Resolved" section for exactly what changed. The rest of
this document (below) describes the original evidence and the still-open typed-`CacheDomain`
proposal; read it as historical context for the fixed bugs and as the live proposal for what
remains. Also note: `CacheClearEmitter.ts`, referenced throughout this doc as an existing
mechanism, was removed in the same session this doc was written (rejected as an unnecessary
wrapper) — emit calls are inlined at each call site instead. And `SteamUIPanel`'s "Clear Cache"
button, discussed below as a live entry point, turned out to be dead code (no backing DOM element)
and was deleted rather than migrated — only two live entry points remain.

## Current state (evidence)

Five real cache/session domains exist today, and critically, **games and metadata are already
two structurally separate stores with different natural keys** - `games_<steamid>` (`CacheManager`)
is keyed by steamid; `AppDetailsCache`'s records are keyed by `appid` (`CachedAppDetails.appid`,
`AppDetailsCache.ts:12`), with zero steamid dependency. Nothing today forces them to be cleared
together - `SteamApiClient.clearCache()` just happens to wipe both in one call:

1. **Identity** - `SteamApiClient`'s `CacheManager`, `resolve_*` keys (vanity URL → steamid) - per-user
2. **Games** - same `CacheManager`, `games_<steamid>` keys (owned-games list + playtime) - per-user.
   [[user-games-cache-entanglement]] is a narrower, separate concern: *within* this one key, playtime
   (frequently updated) is bundled with a duplicate of the game entity data (rarely updated) - it is
   not about games vs. metadata being coupled to each other
3. **Metadata/artwork** - `AppDetailsCache` (IndexedDB), per-appid categories/genres/artwork URLs -
   shared across every user/profile, not per-user data
4. **Pixels** - `PixelDataCache` (IndexedDB, worker-backed), decoded RGBA texture data - keyed by
   image URL, also shared, not per-user
5. *(not a cache, but bundled into "clear" today)* **Session state** - `SteamIntegration`'s
   in-memory `gameLibrary` + persisted `LibrarySource` + `DataManager`'s `steam.userInput` - per-user

This split matters beyond tidiness: the app is intended to support multiple Steam profiles logging
in on the same machine (like the Steam desktop client does). Identity and games are correctly
per-steamid already and need no further work for that. Metadata and pixels are correctly *shared*
already (Alice and Bob both owning Portal 2 should reuse one cached artwork/genre record, not
duplicate it) - lumping them in with per-user domains would be the wrong direction for multi-user
support, not a neutral simplification.

Originally three UI entry points cleared different, inconsistent subsets of the above (as-found
state, now historical - see the 2026-07-11 update above for what's fixed):

| Entry point | Mechanism (as found) | Cleared |
|---|---|---|
| `SteamUIPanel` "Clear Cache" button | Wired in code, but the `clear-cache` DOM id it looked up didn't exist anywhere - **dead code, never actually reachable**. Deleted rather than migrated. |
| `GameSettingsPanel` "Clear cached profile & reload" | `emit(CacheClear, {scope:'identity'})` → event | Identity only, session state. **Not games/metadata/pixels** (by design - see rollout below). |
| `CacheManagementPanel` "Clear Cache" button | **Was** direct method calls, no event: `pixelCache.clear()` + `SteamApiClient.clearCache()`. **Now** emits `CacheClear(scope:'all')` + `ImageCacheClear` instead. | Pixels, identity + games, metadata, **and now session state** (fixed - previously could leave a stale `Library`/`gameLibrary` behind). |

None of the entry points has any reason to distinguish games from metadata - they always clear
both together - which is exactly how the accidental lump happened. That's a call-site default, not
evidence the domains are structurally coupled.

`SteamEventTypes.ImageCacheClear` already existed and `PixelDataCache` already registered a
handler for it (`PixelDataCache.ts:90`), but nothing emitted it - dead wiring. **Fixed**:
`CacheManagementPanel` now emits it alongside `CacheClear`.

The `CacheManagementPanel` direct calls were also a standing violation of this project's "zero
cross-class dependencies" rule (root `CLAUDE.md`), independent of the cache-domain problem.
**Fixed** alongside the above.

## Proposed direction

One event (`SteamEventTypes.CacheClear`, already the survivor of this session's collapse) carrying
a **set of domains** rather than a single scope string, so a caller can request any combination and
each listener checks membership instead of pattern-matching a coarse `'all' | 'identity'`:

```typescript
export type CacheDomain = 'identity' | 'games' | 'metadata' | 'pixels' | 'session'

export interface SteamCacheClearEvent extends BaseInteractionEvent {
    readonly domains: ReadonlySet<CacheDomain> | readonly CacheDomain[]
}
```

Each current listener maps onto one or more domains:
- `SteamApiClient` → `identity` (`deleteByPrefix('resolve_')`, unchanged) and `games`
  (`deleteByPrefix('games_')`, new - `clearCache()` currently wipes the whole `CacheManager` in
  one call, this splits it) as two independent domains, plus `metadata` (`appDetailsCache.clear()`)
  as a third, separately checkable domain
- `PixelDataCache` → `pixels` (replaces the currently-dead `ImageCacheClear` entirely, or
  `ImageCacheClear` is deleted as redundant once this lands)
- `SteamIntegration` → `session`

`games` and `metadata` are kept as two separate domains, not merged - see "Current state" above.
[[user-games-cache-entanglement]] (playtime bundled *inside* the `games_<steamid>` record) is
orthogonal to this split and stays a separate entry.

There's no dedicated emit-helper module today (`CacheClearEmitter.ts` was tried and rejected as an
unnecessary wrapper - each call site emits directly, with a doc comment warning that the `scope`/
`domains` field is required). A future `domains: CacheDomain[]` shape would keep that same
direct-emit pattern, just with a richer payload - not a reason to reintroduce a wrapper.

Call-site mapping once implemented:
- "Clear cached profile & reload" (`GameSettingsPanel`) → `['identity', 'session']` (today's
  `'identity'`, unchanged - deliberately leaves `games`/`metadata` warm so switching back to the
  same profile later doesn't force a full re-fetch)
- `CacheManagementPanel`'s "Clear Cache" → `['identity', 'games', 'metadata', 'pixels', 'session']`
  (today's two separate emits - `CacheClear(scope:'all')` + `ImageCacheClear` - collapse into one)

## Alternative considered: keep `scope` as a widened string enum

E.g. `scope: 'all' | 'identity' | 'pixels'` instead of a domain set. Rejected as the starting
option because it re-creates the same problem one level up - a caller wanting "identity + pixels
but not games" has no way to express it, and `'all'` still has to be kept in sync by hand with
whatever domains exist. A domain set scales to new cache domains without a combinatorial explosion
of scope values.

## Incremental rollout

1. ✅ Done - `CacheManagementPanel.clearCache()` migrated off direct method calls onto
   `CacheClear(scope:'all')` + `ImageCacheClear`. Closed the missing-session-clear bug and the
   direct-call violation without waiting for the full domain-set type.
2. ✅ Done - `SteamUIPanel`'s dead "Clear Cache"/"Refresh Cache"/"Cache Info" wiring removed
   (never reachable - no backing DOM element).
3. Add `CacheDomain` and the domain-set event shape alongside the existing `scope` field (both
   present, `scope` deprecated but still read) - no call site breaks.
4. Migrate `SteamApiClient`, `SteamIntegration`, `PixelDataCache` listeners to check `domains`
   instead of `scope`.
5. Migrate the two remaining UI call sites (`GameSettingsPanel`, `CacheManagementPanel`) to the
   domain-set shape.
6. Remove `scope` and the now-redundant standalone `ImageCacheClear` event once `pixels` is a
   real domain nothing else depends on separately.
7. Regression coverage: each UI entry point's expected domain set.

## Non-goals

- Splitting playtime out of the `games_<steamid>` record itself - tracked separately in
  [[user-games-cache-entanglement]] / [[appid-keyed-cache-split]]
- Any change to `PixelDataCache`'s internal storage format or the texture pipeline itself (see
  `texture-cache-refactor-plan.md` for that surface)
- Multi-select "clear specific domain" UI - the three existing buttons keep their current intent,
  just routed correctly
- Actually building multi-profile login - this plan only ensures the cache-domain model doesn't
  actively work against that future, not implementing it

## Files affected (remaining work)

| File | Change |
|---|---|
| `client/src/types/InteractionEvents.ts` | `CacheDomain` type, `SteamCacheClearEvent.domains` |
| `client/src/steam/SteamApiClient.ts` | Listener checks `domains.has('identity')` / `('games')` / `('metadata')` independently; add `deleteByPrefix('games_')` |
| `client/src/steam-integration/SteamIntegration.ts` | Listener checks `domains.has('session')` |
| `client/src/scene/game-box/instancing/PixelDataCache.ts` | Listen to `CacheClear`/`pixels` domain instead of the standalone `ImageCacheClear` event |
| `client/src/ui/pause/panels/GameSettingsPanel.ts` | Call site update |
| `client/src/ui/pause/panels/CacheManagementPanel.ts` | Already emits both events directly (done); collapse to one domain-set emit once the type exists |

Already done, not remaining: `CacheManagementPanel`'s direct-call → event migration,
`SteamUIPanel`'s dead-code removal (no file changes needed there anymore - the call site is gone).

## Related documents
- `docs/tech-debt.md` → [[cache-clear-domain-unification]], [[user-games-cache-entanglement]]
- `.github/lessons-learned.md` → "Survey Existing Implementations Before Adding a New One"

---

**Status**: 🔮 Partially done - the two concrete bugs (missing session clear, dead `ImageCacheClear`
wiring, direct-call violation) are fixed; the typed `CacheDomain` set itself is not started.
**Priority**: Medium
**Blocked by**: None
**Blocks**: Nothing - the remaining `scope` string + sibling `ImageCacheClear` event is tolerable
in the interim, just not as strict as it could be

---
A1 P1
