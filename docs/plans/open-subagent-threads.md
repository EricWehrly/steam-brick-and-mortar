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

### Neon Sign -- "&" Tube Proof of Concept
**Status**: `planned`
**Complexity**: M (2-3 day spike)
**Done**: Design doc at `docs/plans/neon-sign-3d-design.md` (3D tube geometry + emissive material approach). Canvas-glow archived at `neon-sign-design.md`.
**Next**: Branch from `openclaw/feat-recently-played-ceiling-signs`. Implement a single `&` using `THREE.TubeGeometry` along a CatmullRom spline path. Add `MeshStandardMaterial` with emissive + `UnrealBloomPass`. No XR work yet -- flatscreen bloom only.
**Model**: gemini-3-flash for implementation once design is locked
**Ref**: `docs/plans/neon-sign-3d-design.md`, Phase 2 Feature 5.6

### rtime_last_played Refresh Strategy
**Status**: `partial`
**Complexity**: S
**Done**: `rtime_last_played?: number` typed in `SteamApiClient.ts`. `sortByRecentlyPlayed` implemented and tested. Active sort uses it.
**Next**: Debounced daily refresh: on load, if cached `rtime_last_played` is >24h stale, re-fetch GetOwnedGames and merge updated playtime/recency. Gate behind flag to avoid hammering API.
**Ref**: Glue-work bucket B, `client/src/steam/SteamApiClient.ts`

### Steam API Usage Research
**Status**: `done`
**Complexity**: S (research only)
**Done**: Full research doc at `docs/research/steam-api-legitimacy.md`. Covers Store API rate limits (200/5min), Steam Web API (100k/day), SteamSpy terms, legitimacy for personal non-commercial use, direct CDN artwork URL pattern, IGDB as alternative.
**Key finding**: Switch artwork fetching to direct CDN URL (`shared.fastly.steamstatic.com/store_item_assets/steam/apps/[APPID]/header.jpg`) to decouple visual population from metadata rate limits.
**Ref**: `docs/research/steam-api-legitimacy.md`, Phase 2 Feature 5.4

---

## P2 -- Medium Priority

### Worker Error Surfacing
**Status**: `done` -- `WorkerErrorUtils.ts` + tests merged
**Complexity**: XS
**Done**: `client/src/utils/WorkerErrorUtils.ts` with `extractWorkerErrorMessage` and `makeWorkerErrorHandler`. All three worker managers (`ProceduralTextureWorker`, `TextureWorker`, `PixelDataCache`) updated to use it. Tests in `WorkerErrorUtils.test.ts` (8 passing).
**Next**: Verify runtime logs now show meaningful crash detail instead of "Worker error: undefined".

### UI Normalization -- Phase B Components
**Status**: `in-progress` -- UIButton + UICheckbox done
**Complexity**: M (one component per subagent run)
**Done**: Base tokens in `tokens.css`. UIButton and UICheckbox implemented.
**Next**: UIPanel.ts + `ui-panel.css` (standard container with header + body). One subagent run per component.
**Model**: gemini-3-flash
**Ref**: `docs/plans/ui-normalization-plan.md` Phase B

### Back-Row Backside Suppression Policy
**Status**: `hardcoded` -- temp `rowIndex < 4` check in GameBoxSpawner
**Complexity**: S
**Done**: Back row (row 4) suppresses backside fill. Logic is in `GameBoxSpawner.spawnGamesOnShelf` with a TD comment.
**Next**: Move policy out of spawner into a `ShelfLayoutPolicy` type emitted per batch with `ShelfCreated` (or stored in `GpuStorePropsRenderer`). Spawner reads policy, does not hardcode row index.
**Ref**: `client/src/scene/spawning/GameBoxSpawner.ts`

### Sort Mode Switch UI
**Status**: `planned`
**Complexity**: M
**Done**: Sort functions exist. Steam integration wired to recently-played sort.
**Next**: Add sort-mode selector in `SteamUICoordinator` (dropdown or toggle). Emit sort-changed event -> SteamIntegration re-sorts and re-emits batches.

### SceneManager / DataManager Pattern Consolidation
**Status**: `partial`
**Complexity**: M (multi-file)
**Done**: `SceneSignManager` reads scene from `DataManager(DataKey.MainScene)`. Pattern documented.
**Next**: Audit other classes taking `scene` in constructor. Migrate where it is always the main scene. Leave injectable for testable units.
**Ref**: `docs/roadmaps/tech-debt.md`

---

## P3 -- Low Priority / Deferred

### Popcorn Ceiling Texture Improvement
**Status**: `queued` -- waiting on visual design cycles
**Complexity**: S (design) + S (implementation)
**Next**: Design pass (sonnet/opus) -> output `docs/plans/popcorn-ceiling-plan.md` -> gemini-flash implements.
**Model**: Design = sonnet or opus; Implementation = gemini-flash

### Personalized Store Sign (Vanity URL)
**Status**: `idea`
**Complexity**: XS
**Done**: `SteamUser.vanity_url` already in API response.
**Next**: Wire into `SceneSignManager` entrance sign. Needs graceful fallback for users without vanity URL.

### getInstance Singleton Refactor
**Status**: `queued` -- defer until fresh branch
**Complexity**: S-M
**Done**: `#current` getter pattern documented, partially applied.
**Next**: Apply to remaining singletons. DataManager changes are most significant -- own branch.

### Dissolve / Entrance Animation
**Status**: `researched`
**Complexity**: L
**Done**: `docs/research/dissolve-animation-research.md` with technical findings.
**Next**: Blocked on material sharing resolution. Revisit post-merge when material system is stable.

### Room Variant -- Cozy Basement
**Status**: `idea`
**Complexity**: L
**Next**: Prerequisite is room variant/style system. Defer to late Phase 2.