# Open Subagent Threads

Tracks queued work and pull-forward Phase 2 items being chipped at now.
Remove entries when complete -- completed work lives in git history and roadmap docs.

---

## Status Key
`idea` | `planned` | `research-in-progress` | `partial` | `in-progress` | `failing-test-written` | `done`

## Complexity Key
XS < 2h | S 2-8h | M 1-3 days | L 3+ days

---

## P0 -- Active / Blocking

*(none currently)*

---

## P1 -- High Priority

### Back-Row Backside Suppression Policy
**Status**: `hardcoded` -- temp `rowIndex < 4` check in GameBoxSpawner
**Complexity**: S
**Done**: Near side (ShelfSide.Back / +localZ) now populated first after rotation convention fix.
Far side suppressed on row 4. TD comment in place.
**Next**: Move policy out of spawner into a `ShelfLayoutPolicy` type emitted per batch
with `ShelfCreated` (or stored in `GpuStorePropsRenderer`). Spawner reads policy,
not hardcoded row index. Also: ShelfSide.Front/Back naming is backwards vs. player-facing
intuition -- rename to Near/Far in a follow-up pass.
**Ref**: `client/src/scene/spawning/GameBoxSpawner.ts`

### UI Normalization -- Phase B Components
**Status**: `in-progress` -- UIButton + UICheckbox done
**Complexity**: M (one component per subagent run, keep chipping at it)
**Done**: Base tokens in `tokens.css`. UIButton and UICheckbox implemented.
**Next**: UIPanel.ts + `ui-panel.css` (standard container with header + body).
One subagent run per component.
**Model**: gemini-3-flash
**Ref**: `docs/plans/ui-normalization-plan.md` Phase B

### Worker Exception Visibility
**Status**: `partial` -- util exists, runtime verification pending
**Complexity**: S
**Done**: `WorkerErrorUtils.ts` with `extractWorkerErrorMessage`/`makeWorkerErrorHandler`.
All three worker managers updated. Tests passing (8).
**Next**: The util is only as good as what workers actually surface. Need to verify
the workers themselves catch and post errors (not silently swallow them in try/catch).
Audit each worker's internal error handling. Goal: any unhandled exception in a worker
should be loud -- not just logged at info level, but surfaced prominently (consider
toast or console.error at a minimum). Also flag for Playwright visibility.
**Ref**: `client/src/utils/WorkerErrorUtils.ts`

### rtime_last_played Refresh Strategy
**Status**: `partial`
**Complexity**: XS-S (manually-triggered first, then debounced)
**Done**: `rtime_last_played?: number` typed. `sortByRecentlyPlayed` implemented and tested.
**Next**: Start with a manual refresh button ("Sync library") rather than automatic.
The cheapest call is `IPlayerService/GetOwnedGames` with `include_played_free_games=1`
and `include_appinfo=1` -- returns playtime + rtime_last_played for all owned games
in one request. Debounce/cache the result for 24h after that. Gate behind flag initially.
**Ref**: `client/src/steam/SteamApiClient.ts`

---

## P2 -- Medium Priority

### SteamInfo / steaminfo.com Research (redo)
**Status**: `planned` -- previous research covered Steam Web API broadly, not steaminfo.com specifically
**Complexity**: S (research only)
**Context**: We had discussed pulling from steaminfo.com specifically as a potential
data source (not the official Steam API). The previous research doc covers the official
Steam API ecosystem and is worth keeping, but steaminfo.com is a separate service with
its own API, terms, and data profile. Need to know:
- What data does steaminfo.com expose (reviews, tags, metacritic, community scores)?
- Is there a public API or is it scraped?
- Rate limits and terms for third-party use?
- How does it compare to IGDB and SteamSpy for our use case?
**Next**: Run a targeted subagent on steaminfo.com specifically. Also check if there
is a straightforward way to get Steam review score (thumbs up %) from the store API
for the detail page -- this is a separate but related need.
**Ref**: `docs/research/steam-api-legitimacy.md` (existing context)

### Steam Review Score + Metacritic for Detail Page
**Status**: `planned`
**Complexity**: S
**Context**: Detail page should show Steam review score (positive % + review count)
and Metacritic score where available. Both are in the store API `appdetails` response.
- Steam: `data.metacritic.score`, `data.metacritic.url`
- Steam: `data.recommendations.total` (review count), no built-in % but can be derived
  from `positive` / `total` in `data.steam_reviews` -- check exact field name.
- Metacritic: available directly from appdetails if Valve has it indexed.
**Next**: Confirm exact field names from a live appdetails response, then wire into
the detail page component.
**Next**: If steaminfo.com research lands well, consider pulling richer review data from there.

### Sort Mode Switch UI
**Status**: `planned`
**Complexity**: M
**Done**: Sort functions exist. Active sort is recently-played.
**Next**: Add sort-mode selector in `SteamUICoordinator` (dropdown or toggle).
Emit sort-changed event -> SteamIntegration re-sorts and re-emits batches.

### SceneManager / DataManager Pattern Consolidation
**Status**: `partial`
**Complexity**: M (multi-file)
**Done**: `SceneSignManager` reads scene from `DataManager(DataKey.MainScene)`. Pattern documented.
**Next**: Audit other classes taking `scene` in constructor. Migrate where it is always
the main scene. Leave injectable for testable units.
**Ref**: `docs/roadmaps/tech-debt.md`

---

## P3 -- Low Priority / Deferred

### Neon Sign -- "&" Tube Proof of Concept
**Status**: `planned`
**Complexity**: M (2-3 day spike)
**Done**: Design doc at `docs/plans/neon-sign-3d-design.md`. Canvas-glow approach archived.
**Next**: Branch from current work branch. `THREE.TubeGeometry` along a CatmullRom spline,
`MeshStandardMaterial` with emissive + `UnrealBloomPass`. Flatscreen bloom only, no XR.
**Model**: gemini-3-flash for implementation

### Popcorn Ceiling Texture Improvement
**Status**: `queued`
**Complexity**: S (design) + S (implementation)
**Next**: Design pass (sonnet/opus) -> `docs/plans/popcorn-ceiling-plan.md` -> gemini-flash implements.

### Personalized Store Sign (Vanity URL)
**Status**: `idea`
**Complexity**: XS
**Done**: `SteamUser.vanity_url` already in API response.
**Next**: Wire into `SceneSignManager` entrance sign with graceful fallback.

### getInstance Singleton Refactor
**Status**: `queued` -- defer to fresh branch
**Complexity**: S-M
**Next**: Apply `#current` getter to remaining singletons. DataManager changes on own branch.

### Dissolve / Entrance Animation
**Status**: `researched`
**Complexity**: L
**Done**: `docs/research/dissolve-animation-research.md`
**Next**: Blocked on material sharing resolution. Revisit post-merge.

### Room Variant -- Cozy Basement
**Status**: `idea`
**Complexity**: L
**Next**: Depends on room variant/style system. Defer to late Phase 2.

---

## Steam API Research (existing)
**Status**: `done`
**Ref**: `docs/research/steam-api-legitimacy.md`
Official Steam Web API, Store API, SteamSpy -- rate limits, ToS, direct CDN URLs.
Separate from the steaminfo.com investigation above.