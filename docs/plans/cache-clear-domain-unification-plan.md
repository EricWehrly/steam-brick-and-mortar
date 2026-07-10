# Cache Clear Domain Unification Plan

## Goal
Replace three inconsistent "clear cache" UI entry points with one event contract, driven by
strict, checkable cache-domain types instead of ad-hoc string scopes or direct method calls.

## Why now
While collapsing `SteamEventTypes.CacheClear`/`UserClear` into one event with a `scope: 'all' |
'identity'` field (this session), a review of every place that clears a cache surfaced a wider,
pre-existing problem than that collapse alone fixes. See [[cache-clear-domain-unification]] in
`docs/tech-debt.md`.

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

Three UI entry points clear different, inconsistent subsets of the above:

| Entry point | Mechanism | Clears |
|---|---|---|
| `SteamUIPanel` "Clear Cache" button | `emitCacheClear('all')` → event | Identity + games (via `SteamApiClient.clearCache()`), metadata (`appDetailsCache.clear()`), session state. **Not pixels.** |
| `GameSettingsPanel` "Clear cached profile & reload" | `emitCacheClear('identity')` → event | Identity only, session state. **Not games/metadata/pixels.** |
| `CacheManagementPanel` "Clear Cache" button | **Direct method calls**, no event: `pixelCache.clear()` + `SteamApiClient.clearCache()` | Pixels, identity + games, metadata. **Not session state** - can leave a stale `LibrarySource`/`gameLibrary` behind, the same bug class fixed for the other two entry points this session. |

None of the three entry points today has any reason to distinguish games from metadata - they
always clear both together - which is exactly how the accidental lump happened. That's a call-site
default, not evidence the domains are structurally coupled.

Additionally, `SteamEventTypes.ImageCacheClear` already exists and `PixelDataCache` already
registers a handler for it (`PixelDataCache.ts:90`) - but nothing in the app ever emits it. Dead
wiring, presumably intended to be the pixel-cache entry point before `CacheManagementPanel` grew
its own direct-call path instead.

The `CacheManagementPanel` direct calls are also a standing violation of this project's "zero
cross-class dependencies" rule (root `CLAUDE.md`) independent of the cache-domain problem.

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

`emitCacheClear(domains: CacheDomain[])` (already the sanctioned single emit path, added this
session in `CacheClearEmitter.ts`) becomes the one place that validates a non-empty domain set,
same rationale as today: TypeScript enforces the parameter at the one choke point rather than
every listener re-validating.

Call-site mapping once implemented:
- "Clear Cache" (`SteamUIPanel`) → `['identity', 'games', 'metadata', 'pixels', 'session']` (today's
  `'all'`, now also reaching pixels - closes the dead-wiring gap)
- "Clear cached profile & reload" (`GameSettingsPanel`) → `['identity', 'session']` (today's
  `'identity'`, unchanged - deliberately leaves `games`/`metadata` warm so switching back to the
  same profile later doesn't force a full re-fetch)
- `CacheManagementPanel`'s "Clear Cache" → same full set as `SteamUIPanel`'s, but through the event
  instead of direct calls - closes both the missing-`session`-clear bug and the direct-call
  violation

## Alternative considered: keep `scope` as a widened string enum

E.g. `scope: 'all' | 'identity' | 'pixels'` instead of a domain set. Rejected as the starting
option because it re-creates the same problem one level up - a caller wanting "identity + pixels
but not games" has no way to express it, and `'all'` still has to be kept in sync by hand with
whatever domains exist. A domain set scales to new cache domains without a combinatorial explosion
of scope values.

## Incremental rollout

1. Add `CacheDomain` and the domain-set event shape alongside the existing `scope` field (both
   present, `scope` deprecated but still read) - no call site breaks.
2. Migrate `SteamApiClient`, `SteamIntegration`, `PixelDataCache` listeners to check `domains`
   instead of `scope`.
3. Migrate the three UI call sites to `emitCacheClear([...])`.
4. Migrate `CacheManagementPanel.clearCache()` off direct method calls onto the event.
5. Remove `scope` and `SteamEventTypes.ImageCacheClear` once nothing references either.
6. Regression coverage: each UI entry point's expected domain set, plus a test proving
   `CacheManagementPanel`'s button now clears `LibrarySource`/`gameLibrary` (the bug this whole
   plan traces back to).

## Non-goals

- Splitting playtime out of the `games_<steamid>` record itself - tracked separately in
  [[user-games-cache-entanglement]] / [[appid-keyed-cache-split]]
- Any change to `PixelDataCache`'s internal storage format or the texture pipeline itself (see
  `texture-cache-refactor-plan.md` for that surface)
- Multi-select "clear specific domain" UI - the three existing buttons keep their current intent,
  just routed correctly
- Actually building multi-profile login - this plan only ensures the cache-domain model doesn't
  actively work against that future, not implementing it

## Files affected

| File | Change |
|---|---|
| `client/src/types/InteractionEvents.ts` | `CacheDomain` type, `SteamCacheClearEvent.domains` |
| `client/src/steam-integration/CacheClearEmitter.ts` | `emitCacheClear(domains: CacheDomain[])` |
| `client/src/steam/SteamApiClient.ts` | Listener checks `domains.has('identity')` / `('games')` / `('metadata')` independently; add `deleteByPrefix('games_')` |
| `client/src/steam-integration/SteamIntegration.ts` | Listener checks `domains.has('session')` |
| `client/src/scene/game-box/instancing/PixelDataCache.ts` | Listen to `CacheClear`/`pixels` domain instead of (dead) `ImageCacheClear` |
| `client/src/ui/SteamUIPanel.ts` | Call site update |
| `client/src/ui/pause/panels/GameSettingsPanel.ts` | Call site update |
| `client/src/ui/pause/panels/CacheManagementPanel.ts` | Direct calls → event |

## Related documents
- `docs/tech-debt.md` → [[cache-clear-domain-unification]], [[user-games-cache-entanglement]]
- `.github/lessons-learned.md` → "Survey Existing Implementations Before Adding a New One"

---

**Status**: 🔮 Proposed - not started
**Priority**: Medium
**Blocked by**: None
**Blocks**: Nothing - `ImageCacheClear` staying dead and `CacheManagementPanel`'s direct calls
staying in place are tolerable in the interim, just inconsistent

---
A1 P1
