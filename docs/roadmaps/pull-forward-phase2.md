# Pull-Forward Track: Phase 2 Items in Active Progress

> **Purpose**: Items from Phase 2 scope that we're chipping at now, before the formal phase starts.
> This is not a new phase — it's an accelerant. Items live here while in progress; graduate to
> phase2-ready-for-friends.md for formal tracking once they reach "planned" status.
>
> **Sorted by priority.** Each item has: status · complexity · what's done · what's next.

---

## ?? P0 — Active / Blocking

### Worker Error Surfacing
**Status**: `failing-test-written` — fix queued for next branch
**Complexity**: XS (1–2h)
**Done**: `ProceduralTextureWorker-error.test.ts` — two `it.fails` tests document exact broken behavior (logs `undefined` for runtime worker crashes; rejects with `Error('undefined')`).
**Next**: In `ProceduralTextureWorker.ts` `onerror`: replace `e.message` with `e.error?.message ?? e.error?.stack ?? e.filename ?? 'unknown worker error'`. Same fix in `TextureWorker.ts` / `PixelDataCache.ts` if they have the same pattern. Remove `.fails` markers once fixed.
**Ref**: `client/src/utils/textures/ProceduralTextureWorker-error.test.ts`

---

## ?? P1 — High Priority Pull-Forward

### Steam API Usage / Legitimacy Review
**Status**: `research-in-progress` (subagent running)
**Complexity**: S (research only, no code)
**Done**: Subagent spawned to research Steam Web API, Store API, SteamSpy terms + rate limits.
**Next**: Receive subagent output ? create `docs/research/steam-api-legitimacy.md` ? inform caching strategy and rate-limit hardening in Feature 5.4.
**Ref**: Phase 2 Feature 5.4, Story 5.5.2.2

### Network Rate-Limit Hardening (Phase 2 Feature 5.4)
**Status**: `planning` — strategy partially documented
**Complexity**: L (multi-sprint)
**Done**: Phase 2 roadmap has detailed story breakdown (5.4.1–5.4.4). Steam API proxy in Lambda exists. IndexedDB cache exists and working.
**Next**: After steam-api-legitimacy research: document actual observed caps, design backoff/retry layer, plan CDN image fetch batching policy.
**Ref**: `docs/roadmaps/phase2-ready-for-friends.md` Feature 5.4

### Neon Sign — `&` Tube Proof of Concept
**Status**: `planned` — design doc exists, no code yet
**Complexity**: M (2–3 days spike)
**Done**: `docs/plans/neon-sign-3d-design.md` — 3D tube geometry + emissive material approach documented. Canvas-glow approach documented in `neon-sign-design.md` (archived as reference).
**Next**: Branch from `openclaw/feat-recently-played-ceiling-signs`. Implement a single `&` character using `THREE.TubeGeometry` along a CatmullRom spline path. Add `MeshStandardMaterial` with emissive + bloom post-processing (UnrealBloomPass). No XR work yet — flatscreen bloom only.
**Ref**: `docs/plans/neon-sign-3d-design.md`, Phase 2 Feature 5.6

### rtime_last_played Refresh Strategy
**Status**: `partial` — field added to type, sort uses it; no refresh logic
**Complexity**: S
**Done**: `rtime_last_played?: number` in `SteamApiClient.ts`. `sortByRecentlyPlayed` implemented and tested in `CategoryAssigner`. Active sort uses it.
**Next**: Debounced daily refresh: on load, if cached `rtime_last_played` is >24h stale, re-fetch GetOwnedGames and merge updated playtime/recency. Gate behind flag to avoid hammering API.
**Ref**: Glue-work bucket B, `client/src/steam/SteamApiClient.ts`

---

## ?? P2 — Medium Priority Pull-Forward

### Back-Row Backside Suppression Policy
**Status**: `hardcoded` — temp `rowIndex < 4` check in GameBoxSpawner
**Complexity**: S
**Done**: Back row (row 4) suppresses backside fill. Logic is in `GameBoxSpawner.spawnGamesOnShelf` with a `// TD` comment.
**Next**: Move policy out of spawner into a `ShelfLayoutPolicy` type emitted with `ShelfCreated` (or stored in `GpuStorePropsRenderer` per-batch). Spawner should read policy, not hardcode row index.
**Ref**: `client/src/scene/spawning/GameBoxSpawner.ts` (TD: formalize as layout policy from planner)

### UI Normalization — Phase B Components
**Status**: `in-progress` — UIButton + UICheckbox done
**Complexity**: M (one component per subagent run)
**Done**: Base tokens in `tokens.css`. UIButton and UICheckbox implemented.
**Next**: UIPanel.ts + `ui-panel.css` (standard container with header + body). One subagent run per component.
**Ref**: `docs/plans/ui-normalization-plan.md` Phase B, `docs/plans/open-subagent-threads.md`

### Popcorn Ceiling Texture Improvement
**Status**: `queued` — waiting on visual design cycles
**Complexity**: S (design) + S (implementation via subagent)
**Done**: Current popcorn texture in place but needs quality pass.
**Next**: Design pass (sonnet/opus) ? output `docs/plans/popcorn-ceiling-plan.md` ? gemini-flash implements.
**Ref**: `docs/plans/open-subagent-threads.md`

### Sort Mode Switch UI + "Sort by" Affordance
**Status**: `planned` — no code yet
**Complexity**: M
**Done**: Sort functions exist (`sortByRecentlyPlayed`, `sortByGenreThenPlaytime`). Steam integration wired to recently-played sort.
**Next**: Add a sort-mode selector in `SteamUICoordinator` (dropdown or toggle). Emit sort-changed event ? SteamIntegration re-sorts and re-emits batches.
**Ref**: Dossier / Phase 2 early items

### SceneManager / DataManager Pattern Consolidation
**Status**: `partial` — `SceneSignManager` already migrated; others use constructor injection
**Complexity**: M (multi-file)
**Done**: `SceneSignManager` reads scene from `DataManager(DataKey.MainScene)`. Pattern documented.
**Next**: Audit other classes that take `scene` in constructor. Migrate where the scene is always the main scene (not a different scene). Leave dependency-injectable for testable units.
**Ref**: Dossier, tech-debt.md "SceneManager/DataManager scene access"

---

## ?? P3 — Low Priority / Deferred Pull-Forward

### Dissolve / Entrance Animation System
**Status**: `researched` — doc exists
**Complexity**: L
**Done**: `docs/research/dissolve-animation-research.md` exists with technical findings.
**Next**: Blocked on material sharing resolution. Revisit post-Phase-1 merge when material system is stable.
**Ref**: Phase 2 TBD section

### Room Variant — Cozy Basement
**Status**: `idea` — not designed
**Complexity**: L
**Done**: Concept noted. Lighting preset system (Feature 8.5.0) is a dependency.
**Next**: Defer to late Phase 2. Prerequisite: room variant / style system.

### Personalized Store Sign (Vanity URL)
**Status**: `idea` — data available
**Complexity**: XS
**Done**: `SteamUser.vanity_url` already in API response.
**Next**: Wire into `SceneSignManager` entrance sign. Needs graceful fallback for users without vanity URL.
**Ref**: Phase 2 TBD section

### getInstance Singleton Refactor
**Status**: `queued` — defer until fresh branch
**Complexity**: S–M
**Done**: `#current` getter pattern documented / partially applied.
**Next**: Apply to remaining singletons. DataManager changes are most significant — own branch. Others are lighter.
**Ref**: `docs/plans/open-subagent-threads.md`

---

## Complexity Key
- **XS**: < 2h, single file
- **S**: 2–8h, few files
- **M**: 1–3 days, multi-file
- **L**: 3+ days / multi-sprint

## Status Values
`idea` · `planned` · `research-in-progress` · `partial` · `in-progress` · `hardcoded` · `failing-test-written` · `done`