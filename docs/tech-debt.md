# Tech Debt Backlog

> **Bugs belong in `bugs.md`.**
> This file is for architectural/code-quality debt that increases risk, maintenance cost, or implementation friction.
> Feature scope that was intentionally deferred belongs in the relevant feature doc, not here.

## How to use this file

- Keep entries short and actionable.
- Use stable IDs (`## id: ...`) for any debt that has `// TD: ...` source tags.
- When a debt item is mostly product scope, move details to the feature doc and leave only a short cross-reference here (or remove it entirely).
- **Section = priority, not just a label.** An entry's home section is a live claim about when it should be picked up — when that claim goes stale (a plan gets deprioritized, a section gets promoted), move the entry, don't just leave it where it was filed.
  - **Fix Now** — actively worth picking up soon; either cheap/nearly-done or blocking current work. Should stay a short list.
  - **Act 2** — real, intended work for the current act; not urgent enough to jump the queue, not vague enough to be backlog.
  - **Later / Backlog** — no active trigger; explicitly deferred, conditional on something else landing first, or genuinely indefinite.
  - **Resolved** — done. Kept as a one-line record (fix + date), not a full writeup — the code and commit history are the detail; this file is for scanning, not archaeology.

---

## Fix Now

## id: cache-clear-domain-unification
**Priority**: Medium  
**Effort**: ~0.5 day remaining (typed `CacheDomain` set + tests; call-site/dead-wiring fixes done)  
**Context**: Originally three "clear cache" UI entry points existed with inconsistent, overlapping
coverage of five real cache/session domains (identity resolution, games/playtime, artwork
metadata, pixel/texture data, `SteamIntegration`'s session state). Games (`games_<steamid>`,
per-user) and metadata (`AppDetailsCache`, per-appid, shared) are already two structurally
separate stores with different keys - not entangled, just habitually cleared together - and that
separation matters for the app's multi-profile-login goal. See [[user-games-cache-entanglement]]
for the narrower, separate debt of playtime bundled *inside* the `games_<steamid>` record itself.

**Resolved (2026-07-11)**:
- `SteamUIPanel`'s "Clear Cache"/"Refresh Cache"/"Cache Info" buttons were dead code - they looked
  up DOM ids (`clear-cache`, `refresh-cache`, `show-cache-stats`) that didn't exist in `index.html`
  or any template, almost certainly orphaned by the "steam ui readability collapse" work. Removed
  entirely rather than fixed, since there was nothing live to fix.
- `CacheManagementPanel.clearCache()` now emits `CacheClear`(`scope: 'all'`) + `ImageCacheClear`
  instead of calling `PixelDataCache`/`SteamApiClient` directly - closes both the
  zero-cross-class-dependencies violation and the stale-session bug (`CacheClear`'s `'all'` scope
  already clears `gameLibrary`/persisted `Library`/`steam.userInput` via `SteamIntegration`'s own
  listener, which this call site now reaches).
- `ImageCacheClear` is now actually emitted (previously dead wiring - `PixelDataCache` listened for
  it but nothing sent it).
- `SteamApiClient.clearCache()` now documents the pixel exclusion as intentional (different-origin
  data), not an oversight.

**Still open**:
- Cache/session domains are still a loosely-matched `scope: 'all' | 'identity'` string plus a
  bare sibling `ImageCacheClear` event, not a single typed `CacheDomain` set the compiler can
  check - see `docs/plans/cache-clear-domain-unification-plan.md` for the proposed design.
- Only two live "clear cache" entry points remain (`CacheManagementPanel`, `GameSettingsPanel`) -
  `SteamUIPanel`'s is gone, not migrated, since it was never functional.

**Related files**:
- `client/src/ui/pause/panels/CacheManagementPanel.ts`
- `client/src/ui/pause/panels/GameSettingsPanel.ts`
- `client/src/steam/SteamApiClient.ts`
- `client/src/scene/game-box/instancing/PixelDataCache.ts`

**Plan reference**:
- `docs/plans/cache-clear-domain-unification-plan.md`

## id: legacy-atlas-removal
**Priority**: Low — narrowed 2026-07-22 after a code audit found the runtime path already LOD-atlas-only
**Effort**: ~30 min (delete two dead settings, confirm no references)
**Context**: Originally scoped as "remove legacy atlas renderer paths and settings flags." A code
audit found `GpuGameBoxRenderer.ts` already instantiates only `LodArtworkOrchestratorDebug` (via
`IGameArtworkPipeline`, HIGH/MID tiers only) - no conditional legacy-atlas code path exists
anymore. What's left: `AppSettings.ts`'s `useMultiAtlas` and `useLodAtlas` flags are still defined
but referenced nowhere else in the codebase - dead settings, not dead code paths.

**Done when**:
- `useMultiAtlas` and `useLodAtlas` are removed from `AppSettings.ts` (and any settings-panel UI referencing them)
- Confirmed no other reference exists first (a quick grep, not a refactor)

**Source tags**:
- `// TD: legacy-atlas-removal` in `client/src/scene/game-box/GpuGameBoxRenderer.ts`
- `// TD: legacy-atlas-removal` in `client/src/core/AppSettings.ts`

## id: logger-level-discoverability
**Priority**: Low — narrowed 2026-07-22; `client/README.md` already documents this thoroughly, only the agent-facing half is missing
**Effort**: ~15 min (port the existing README section, not write new content)
**Context**: Originally scoped as "no documentation exists for logger-level behavior." A code audit
found `client/README.md` already documents it well (`setLogLevel()`, `setGlobalLogLevel()`,
`?debug=true`), but `.github/copilot-instructions.md` - the agent-facing doc this entry actually
asked for - still has no logger-level section, so an agent session has no reason to know to look
in the README for it.

**Done when**:
- A short logger-level section (or a pointer to `client/README.md`'s existing one) is added to `.github/copilot-instructions.md`

**Related files**:
- `.github/copilot-instructions.md`
- `client/README.md`

## id: appid-keyed-cache-split
**Priority**: High  
**Effort**: ~1-2 days (cache model refactor + migration + tests)  
**Context**: Current cache persistence paths still rely on monolithic single-entry storage patterns (for example one serialized cache blob), which makes per-app invalidation, debugging, and incremental updates harder than needed. Move to appid-keyed entries in a dedicated cache namespace/store instead of extending the single-entry path.

Confirmed evidence: a real `cache_state` blob was found holding 833 `game_<appid>` entries with no source in current `client/src/**/*.ts` that reads or writes that key shape — orphaned from a prior caching scheme, dead weight re-serialized on every save.

**Decision (for now)**:
- Track as high-priority debt and execute in a focused refactor when picked up — not urgent enough to interrupt current desktop-release work, but cheap to scope and shouldn't drift indefinitely.

**Done when**:
- Cache entries are keyed by appid (not a single aggregate entry)
- A separate cache namespace/store is introduced for this data path
- Invalidation supports per-app purge without wiping unrelated cache entries
- Read/write paths are updated consistently and covered by unit tests
- Existing cache data migration (or a safe reset strategy) is documented

**Related files**:
- `client/src/steam/cache/SimpleCacheManager.ts`
- `client/src/steam/SteamApiClient.ts`
- `client/src/steam/GamesLoader.ts`

---

## Act 2

> Real, intended work for the desktop-first Act 2 push — not urgent enough to jump the Fix Now queue, active enough that it shouldn't be treated as indefinite backlog.

## id: angled-layout-center-aisle-overlap
**Priority**: Medium — downgraded 2026-07-22; both layouts already account for shelf body width, remaining gap is narrower than originally scoped
**Effort**: ~2-4 hours (targeted validation + any remaining arc-specific fix, down from a full geometry pass)
**Context**: Originally scoped as "shelf bodies can still crowd/overlap in `arc`/`spoke`, spacing is center-point-only." A code audit found real progress already landed (commit `0d739a7f`,
2026-05-01): **Arc** now factors shelf half-width into its center-aisle config
(`centerAisleHalfWidthX: AISLE_HALF_WIDTH_X + DEFAULT_SHELF_HALF_WIDTH_X`) and derives per-row
clearance angle from it; **Spoke** has explicit body-extent enforcement via
`enforceCenterRunnerAisleX()`, computing minimum shelf-center position from shelf half-width
directly. What's unconfirmed: whether Arc's angle-based approach still has gaps under some section
distributions (the original "under some section distributions" phrasing may still apply there
specifically) - needs visual validation, not a redesign.

**Done when**:
- Visual validation confirms (or disproves) remaining overlap in `arc` specifically, across default and high-count section distributions
- If a gap is found, a targeted fix lands for that case only - the general shelf-body-extent mechanism already exists in both layouts
- Regression tests cover center-aisle clearance and nearest-neighbor spacing for both angled layouts

**Related files**:
- `client/src/scene/props/shared/ArcLayoutUtils.ts`
- `client/src/scene/props/shared/SpokeLayoutUtils.ts`

## id: placement-headroom-policy
**Priority**: High  
**Effort**: ~1 day (instrumentation review + policy implementation + validation)  
**Context**: Placement capacity is currently derived from a fixed multiplier over texture capacity. This can under-allocate during multi-group overlap and over-allocate for smaller libraries. Capacity should be policy-driven from observed overlap/cardinality and explicitly validated on arrangement/layout changes.

**Done when**:
- Placement capacity is derived from a documented policy (not a hardcoded multiplier)
- Policy is configurable/observable enough to tune safely
- Regression coverage protects against instance-capacity exhaustion on regroup/re-layout
- Runtime diagnostics can confirm reset + capacity behavior per placement run

**Source tag**:
- `// TD: placement-headroom-policy` in `client/src/scene/spawning/GameBoxSpawner.ts`

## id: instanced-mesh-memory-envelope
**Priority**: High  
**Effort**: ~0.5-1 day  
**Context**: We need a measured memory/perf envelope for game-box instancing limits before committing to long-term capacity policy. The experiment matrix should validate behavior under under-saturation, exact saturation, and over-saturation at fixed limits.

**Status**: 🚧 WIP (paused) — experimental harness exists but is currently unreliable (`mid` tier not available in the runtime path used by the visual experiment), so results are not decision-grade yet.

**Experiment matrix**:
- Limits: 100, 1000, 10000
- Saturation levels per limit: under, exact, over
- Metrics: JS heap (`mainHeapMB`), estimated GPU memory (`gpuEstimateMB`), warnings/errors, and whether saturation hooks executed

**Done when**:
- Playwright experiment output is generated and archived for all 9 scenarios
- A recommended default limit is documented from measured data
- Follow-up config plan exists for capability-driven limits (instead of hardcoded constants)

**Related files**:
- `client/test/visual/wip/instance-limit-memory-experiment.spec.ts` (intentionally skipped)

## id: cors-blocked-local-scan-artwork
**Priority**: Medium — directly affects the desktop release's first impression (local-scan-loaded libraries are the desktop-native path)
**Effort**: Not yet scoped — depends which of the two options in the plan doc gets picked (a
narrow placeholder-artwork fallback vs. folding into the larger Rust-HTTP-client migration)
**Context**: `ArtworkUrls.ts`'s `deriveArtworkFromAppId()` guesses a direct Steam CDN URL
(`cdn.akamai.steamstatic.com/steam/apps/<appid>/library_600x900.jpg`) for games with no real
capsule/header URL. Desktop's local-scan entries always lack one (local scan can't discover the
CDN hash), so this fallback now runs at whole-library scale instead of its original rare-fallback
use — observed ~1240 CORS-blocked `fetch()` calls in one real test session. Doesn't block the
library from loading, but artwork for most locally-resolved games is currently broken/missing.

**Decision (for now)**:
- See `docs/plans/desktop-offline-first-plan.md`'s "Next up" section for
  the two considered approaches - decide between them before starting.

**Done when**:
- Locally-resolved games with no real artwork URL either get real artwork through a CORS-safe
  path, or degrade to an intentional placeholder - not a silently-failed cross-origin fetch either way

**Related files**:
- `client/src/steam/utils/ArtworkUrls.ts`
- `docs/plans/desktop-offline-first-plan.md`

## id: test-suite-runtime-cost-reduction
**Priority**: High  
**Effort**: ~0.5-1 day (narrowed 2026-07-22 — infra already exists, see below; remaining work is the audit + guideline doc, not building tooling)
**Context**: Runtime cost is still inflated by overlapping unit/integration coverage and expensive setup paths. Directly relevant to the input-system and framerate-regression tracks both starting now — fast iteration on either depends on the test suite staying cheap to run. A code audit found the *detection* infra already exists — `client/test/reporters/summary-reporter.ts` flags tests over 2s as "SLOW (>2s)", and `vitest.config.ts` already tiers unit/integration/visual/live suites. What's missing is the audit itself (using that existing signal) and a documented "cheap tests first" guideline — no such policy exists anywhere in `docs/` or the CLAUDE.md files yet.

**Done when**:
- Slow/duplicative tests (per the existing SLOW reporter) are audited and grouped by overlap reason
- Expensive integration assertions that are already covered at unit level are reduced or replaced
- Runtime improves measurably without reducing behavioral coverage guarantees
- A short "cheap tests first" guideline is written into `client/CLAUDE.md`'s Testing section (or similar) for future additions

## id: shadow-default-policy-evaluation
**Priority**: Medium — bumped from Low; a candidate contributor to the frame-time regression under investigation (see [Framerate Regression Investigation Plan](../plans/framerate-regression-investigation-plan.md))
**Effort**: ~0.5 day (extend the existing policy to meshes, not design one from scratch — narrowed 2026-07-22)
**Context**: A code audit found this is further along than "still all per-object flags" suggested:
a `ShadowPolicy.ts` module already exists (`applyLightShadowPolicy()` etc.) and is applied to
lights in `LightingRenderer.ts` — the centralized-policy design question for *lights* is already
answered. What's still per-object, at creation sites, with no policy: mesh objects — floors
(`RoomManager.ts`), signage (`SignageRenderer.ts`, `BlockLetterSignRenderer.ts`,
`NeonTubeSignRenderer.ts`). The open question narrows to: does `ShadowPolicy.ts`'s existing
approach extend cleanly to meshes, or do meshes need a different policy shape than lights did.

**Done when**:
- A short recommendation on extending `ShadowPolicy.ts` (or a mesh-specific sibling) to the mesh creation sites listed above
- Tradeoffs are explicit for performance, visual correctness, and accidental over-shadowing risk
- If adopted, a bounded rollout plan exists with clear exclusions (transparent surfaces, emissive signage, special-effect meshes)

**Related files**:
- `client/src/scene/RoomManager.ts`
- `client/src/scene/SignageRenderer.ts`
- `client/src/scene/signs/BlockLetterSignRenderer.ts`
- `client/src/scene/signs/NeonTubeSignRenderer.ts`
- `client/src/scene/LightingRenderer.ts`

**Plan reference**:
- `docs/plans/lighting-shadow-refactor-plan.md`

---

## Later / Backlog

> No active trigger — explicitly deferred, conditional on something else landing first, or indefinite. Revisit when the stated condition is met, not on a schedule.

## id: personal-data-in-git-history
**Priority**: High (privacy exposure on a public repo, but no active harm — it's the author's own account, not a third party's)
**Effort**: Not yet scoped — needs its own careful pass (history rewrite tooling: `git filter-repo` or BFG, plus a force-push and coordinating anyone else with a clone)
**Context**: The real Steam persona name "spitemonger" (the account owner's own real identity, surfaced while fixing real-account-data test fixtures in `desktop/tauri-app/src/steam/{identity,keyvalues}.rs`) is baked into six **committed** files under `docs/research/local-steam/` — filenames and contents, including a full real game-library dump (`live-games-response-spitemonger.json`, 836 games). Already pushed to the public remote (`github.com/EricWehrly/steam-brick-and-mortar`).

**Decision (for now)**: track it, don't act yet. Revisit when there's bandwidth for a proper history-scrub pass rather than a quick rename (renaming going forward doesn't remove it from history).

**Done when**:
- Personal-identifying data (persona name, real library contents) is not reachable in git history, not just absent from the current tree

**Related files**: `docs/research/local-steam/live-appids-spitemonger.json`, `live-games-response-spitemonger.json`, `local-steam-app-signal-samples-local-steam-spitemonger.{json,md}`, `local-steam-coverage-local-steam-spitemonger.{json,md}`

## id: user-games-cache-entanglement
**Priority**: Medium  
**Effort**: ~1 day (model split + migration)  
**Context**: The app has three logically distinct cache domains — user identity (vanity url → steamid), games (library entities from Steam), and artwork (images). Today the "games" cache entry (`games_<steamid>`) bundles per-profile metadata (`playtime_forever`, etc.) together with the game entity data itself, so clearing/refreshing "the user" and clearing/refreshing "the games" aren't cleanly separable — a user-scoped reset can't touch identity without also reasoning about games data that's keyed by that same identity. See [[appid-keyed-cache-split]] for the related storage-format debt.

**Decision (for now)**:
- Do not refactor this now. `SteamApiClient.clearCurrentUser()` (added alongside the pause-menu "Clear Profile & Reload" button) only deletes `resolve_*` entries, leaving `games_*` and the artwork cache untouched — this works today because `getCachedUsers()` requires both a `resolve_` and `games_` entry to consider a profile "cached," so deleting just `resolve_` is sufficient to make the app treat no profile as loaded.
- Revisit if/when per-profile metadata (playtime, hidden/favorite flags, etc.) needs to live somewhere other than inline on the cached game record.

**Done when**:
- Profile-specific metadata (playtime, etc.) is modeled separately from the shared game entity data
- User, games, and artwork caches can each be cleared/invalidated independently without special-casing

**Related files**:
- `client/src/steam/SteamApiClient.ts`
- `client/src/steam/cache/SimpleCacheManager.ts`
- `client/src/steam-integration/SteamIntegration.ts`

## id: autoloadprofile-not-wired-to-startup-waterfall
**Priority**: High — for whenever it's picked up; deliberately not Fix Now (touches the just-reworked startup-waterfall seam, see [[steam-integration-loading-strategy-split]])
**Effort**: ~2-4 hours (small in isolation, but touches the same seam as [[steam-integration-loading-strategy-split]] - re-run the survey step before editing, don't just drop a check in)
**Context**: `autoLoadProfile` is a real, user-facing `AppSettings` toggle ("Auto-load last used Steam profile" in `GameSettingsPanel`/`game-settings-panel.html`) that persists correctly and defaults to `true`, but nothing in `SteamIntegration`'s startup waterfall (`handleGameStart`) reads it. The waterfall (persisted cache → local disk scan → online fetch → demo) runs unconditionally regardless of the toggle's value - so turning it off currently does nothing.

**Decision (for now)**: track it, don't fix inline. Surfaced during Act 2 post-merge cleanup (the same session that resolved [[steam-integration-loading-strategy-split]]) as a known gap rather than something to patch on top of that already-reworked seam in the same pass. Roadmap placement: `docs/acts/act2-ready-for-friends.md`'s "Move to Act 3" list.

**Done when**:
- `handleGameStart` honors `autoLoadProfile === false` by skipping straight past the cache/local-disk/online branches (falling through to demo, or an explicit idle/"choose a profile" state - product call, not yet made) instead of always auto-loading
- A manual "load my profile" action (existing `LoadLibrary` event path) still works when auto-load is off

**Related files**:
- `client/src/steam-integration/SteamIntegration.ts`
- `client/src/core/AppSettings.ts`
- `client/src/ui/pause/panels/GameSettingsPanel.ts`

## id: appsettings-default-vs-override-persistence
**Priority**: Medium  
**Effort**: ~1-2 hours  
**Context**: App settings currently mix environment-derived defaults (Vite `DEV`) with persisted values. We started refactoring persistence to store only explicit overrides vs defaults, but paused to avoid churn during current shipping work.

**Decision (for now)**:
- Revisit after current release-critical tasks are complete.

**Done when**:
- Effective value model is explicitly defined as: runtime defaults + user overrides
- Persistence behavior is documented and covered by tests (especially `developmentMode`)
- Reset-to-default behavior in settings panels cannot force dev mode in production builds

**Related files**:
- `client/src/core/AppSettings.ts`
- `client/src/ui/pause/panels/GameSettingsPanel.ts`

## id: room-defaults-ownership
**Priority**: Medium  
**Effort**: ~1-2 hours (ownership cleanup + test updates)  
**Context**: Room spatial defaults are currently split across domains. `RoomManager`/`RoomConstants` defines room defaults while `AppSettings` also hardcodes ceiling defaults (`4.2`). This creates drift risk and unclear ownership for baseline room dimensions.

**Done when**:
- A single owner is defined for room spatial defaults (including ceiling height; prefer room-domain ownership in `RoomManager`/`RoomConstants`)
- `AppSettings` consumes room-owned defaults via dependency/bootstrap wiring instead of hardcoded competing values
- Startup and settings-change tests verify no default mismatch can regress

**Related files**:
- `client/src/scene/RoomManager.ts`
- `client/src/core/AppSettings.ts`

**Source tag**:
- `// TD: room-defaults-ownership` in `client/src/scene/RoomManager.ts`

## id: debug-window-consolidation
**Priority**: Low  
**Effort**: ~1-2 hours  
**Context**: Debug classes self-register onto `window` in their own module files (`GpuMemoryEstimator`, `StartupEventTracker`, etc.). This scatters debug setup across the codebase and makes it harder to audit what's exposed in production builds.

**Done when**:
- A single `debug/DebugRegistry.ts` (or similar) imports all debug classes and attaches them to `window`
- Individual class files no longer contain `window.*` assignments
- The registry is only imported from the debug side-effect import site in `SteamBrickAndMortarApp` (already has `import '../debug/GpuMemoryEstimator'`)
- Easy to tree-shake or gate behind a dev flag if desired

## id: shelf-end-cap-signs
**Priority**: Low  
**Effort**: Medium (requires instanced/batched text rendering)  
**Context**: Shelf end-cap labels ("FRONT" / "BACK" per shelf) are disabled in `SceneSignManager.handleShelfCreated` because at 47 shelves they add ~94 draw calls (2 canvas sign DCs × 47). Canvas signs can't be instanced as-is because each bakes a unique texture.

**Done when**:
- Sign rendering supports instanced or atlased text so repeated labels (same text, many positions) cost 1-2 DCs total instead of N
- OR a deliberate decision is made that end-cap labels aren't needed and the dead code is removed

**Source tags**:  
- `// TD: shelf-end-cap-signs` in `client/src/scene/SceneSignManager.ts`

## id: system-events-split
**Priority**: Low  
**Effort**: ~1-2 hours  
**Context**: `InteractionEvents.ts` already has a `// TD` noting it conflates user interaction events with system lifecycle events. The new `AppEventTypes` entries (`WorldDetailEnhanced`, `StoreFirstContentReady`, `StoreFullyPopulated`) are system events masquerading as app/UI events because there's nowhere better to put them yet.

**Done when**:
- A dedicated `SystemEvents.ts` (or `LifecycleEvents.ts`) exists for system-to-system pipeline signals
- `WorldDetailEnhanced`, `StoreFirstContentReady`, `StoreFullyPopulated` (and similar future entries) live there
- `InteractionEvents.ts` is scoped to user-facing and UI-driven events
- `LightingEvents.ts` precedent is followed

**Source tags**:  
- `// TD: system-events-split` in `client/src/types/InteractionEvents.ts`

## id: sticker-coordinator
**Priority**: Medium  
**Effort**: 1-2 days (when sticker/sign ownership work is active)  
**Context**: `ShelfStickerHandler` still depends on renderer wiring (`setManagers`) instead of a clean event-owned coordination model.

**Done when**:
- Sticker lifecycle is owned by a dedicated coordinator reacting to events
- Renderer internals are no longer passed directly into sticker logic
- Ownership boundaries mirror the sign lifecycle pattern

**Related feature/doc context**:
- `docs/features/gamesort-full-pipeline.md`

**Source tag**:
- `// TD: sticker-coordinator` in `client/src/scene/stickers/ShelfStickerHandler.ts`

## id: metadata-refetch-no-circuit-breaker
**Priority**: Low  
**Effort**: ~2-3 hours (bounded-retry/give-up state + tests)  
**Context**: `GamesLoader.isMetadataComplete()` (`client/src/steam/GamesLoader.ts:206-259`) gates on
`categories.length>0 || genres.length>0`. Desktop's `LocalSteamDataWriter` currently leaves both
undefined on locally-seeded cache entries, so those entries are always judged "incomplete" and
queue a network `appdetails` refetch on every run, with no cap on retries and no "good enough,
stop asking" state. Once `docs/plans/taxonomy-data-event-plan.md`'s baked-bundle genre/category
harvesting lands, this resolves itself for any appid the bundle covers — but any appid missing
from both the bundle and a live fetch (Lambda unreachable, never-baked title) retries forever.
Not expected to actually bite anyone today (identified while explicitly reasoning about a
Lambda-goes-away scenario, not from an observed failure), but leaving a known infinite-retry path
in on purpose is bad form — track it rather than let it go unrecorded.

**Decision (for now)**:
- Not urgent — the baked-bundle harvesting work should close most of this gap as a side effect.
  Revisit only if it doesn't, or if a real "Lambda unreachable" report surfaces first.

**Done when**:
- `isMetadataComplete` (or its caller) treats a bounded number of failed refetch attempts per
  appid as "give up, render with what we have" rather than retrying indefinitely
- Local-only entries with tags/name/developer/publisher but no genre/category are not treated as
  permanently incomplete once the give-up state is reached

**Related files**:
- `client/src/steam/GamesLoader.ts`
- `client/src/steam/LocalSteamDataWriter.ts`
- `docs/plans/taxonomy-data-event-plan.md`

## id: reconcile-slot-leak-on-repeated-reload
**Priority**: Low — gated on Tier 3, not yet built
**Effort**: Bundled into [Idempotent Library Scene Sync](../features/idempotent-library-scene-sync.md); not worth scoping standalone
**Context**: `LodArtworkOrchestrator.reconcileForLibraryReload()` deliberately doesn't rewind the
slot allocator or reclaim a removed game's texture slot — it's cleared from the name→slot map, but
the underlying slot index is never returned to the pool. Today that's fine: desktop reconciles
exactly **once** per launch (the startup local scan) and each launch is a fresh process, so the
leak is bounded to one reconcile's worth of removed slots before the process ends. It stops being
bounded once Tier 3 (periodic in-session remote refresh — see
[Desktop Startup Load Ordering](../plans/desktop-startup-load-ordering-plan.md)'s Tier 3 row) lands:
repeated in-session reconciles would monotonically consume the atlas (`maxTextures = totalGames +
100`) until exhaustion. Recorded during the startup/reload self-review as
`docs/plans/startup-reload-review-findings.md` F6.

**Decision (for now)**: not urgent — no caller reconciles more than once per process today. Do not
build Tier 3 without first landing slot reclamation (either standalone or, preferably, as part of
Idempotent Library Scene Sync's diff step, since that feature needs the same reclamation logic
regardless).

**Done when**:
- Reconcile releases a removed game's texture slot back to the allocator for reuse (analogous to
  the existing `compactMidTier` compaction pass)
- A test simulating N repeated in-session reconciles with overlapping removed/added games shows
  bounded atlas usage, not monotonic growth

**Related files**:
- `client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts`
- `client/src/scene/game-box/instancing/HighTextureCache.ts`
- `docs/features/idempotent-library-scene-sync.md`
- `docs/plans/desktop-startup-load-ordering-plan.md`

## id: library-game-appid-metadata-duplication
**Priority**: Low  
**Effort**: ~1 day (new appid-keyed store + wiring) if ever picked up  
**Context**: The manual-import bookmarklet mines a one-shot Steam profile page hydration blob that carries `capsule_filename`, `has_dlc`/`has_workshop`/`has_market`/`has_community_visible_stats`/`has_leaderboards`, `content_descriptorids`, and `img_icon_url` per game — data `AppDetailsCache` doesn't have, since it's fed only by the Lambda's Store API batch endpoint, a different source that doesn't return these fields. These are genuinely appid-level (describe the game, not the owner), so `ImportedGame` (`client/src/steam-integration/Library.ts`) captures and validates them — a saved export JSON file carries them — but they deliberately go no further: threading them into `LibraryGame` would duplicate appid-level data per-owner, the same entanglement [[user-games-cache-entanglement]] describes for the online games cache. Net effect: the app captures this data but currently has nowhere to put it, so it's dropped the moment `handleImportLibrary` converts `ImportedGame` to `LibraryGame` — the only way to retain it today is to keep the raw exported `.json` file. `playtime_disconnected` is not part of this problem: it's per-owner (like `playtime_forever`) and already threads through to `LibraryGame.playtimeDisconnected` normally.

**Decision (for now)**:
- Capture and validate at the wire layer only. Build the real per-appid store when a concrete feature needs one of these fields — don't grow `LibraryGame` to hold appid-level data in the meantime.

**Done when**:
- A shared, appid-keyed store (not per-owner) exists for this data, sourced from whichever channel captured it first or most recently
- The captured `ImportedGame` fields feed that store instead of being discarded at import time

**Related files**:
- `client/src/steam-integration/Library.ts`
- `client/src/steam-integration/SteamIntegration.ts`
- `client/public/bookmarklets/export-library.js`

## id: aisle-terminology-main-vs-row
**Priority**: Low  
**Effort**: ~1-2 hours  
**Context**: "Aisle" currently ambiguously refers to both the global/main aisle and row-local aisle traversal space. This creates friction in implementation discussions, event naming, and UI labels.

**Done when**:
- Canonical terms are chosen and documented for global aisle vs row-local aisle zones
- Existing references in docs/event names/UI labels are normalized where touched
- New code/docs avoid the ambiguous term without qualifier

**Related docs**:
- `docs/acts/act3-ready-for-everyone.md`

## id: layout-math-renderer-decoupling
**Priority**: Low  
**Effort**: Deferred (no active timebox)  
**Context**: Layout math in shelf layout utilities currently depends on `THREE` types/constructors (`Vector3`) and overlaps with renderer-adjacent concerns. Long term, layout generation should be pure geometry data so it can be tested and reused without Three.js coupling.

**Done when**:
- Layout utility outputs are plain serializable geometry data (no `THREE.Vector3` construction in layout files)
- A mapping layer translates layout DTOs into renderer-specific types near rendering boundaries
- Layout files no longer import `three`

**When to pick up**:
- Indefinite backlog (revisit only when layout architecture work naturally touches these modules)

**Related files**:
- `client/src/scene/props/shared/ArcLayoutUtils.ts`
- `client/src/scene/props/shared/RowLayoutUtils.ts`
- `client/src/scene/props/shared/SpokeLayoutUtils.ts`

## id: playwright-scene-health-collector
**Priority**: Low  
**Effort**: ~1 day (collector wiring + baseline report)  
**Context**: A shared Playwright scene-health collector is useful for observability, but it is not currently release-critical compared to core correctness and unit/integration test quality.

**Done when**:
- A single pass per mode captures logs, memory snapshot, startup smoothness, and screenshot pointer
- Collection avoids duplicate app loads and output clobbering
- Output format is stable enough to compare runs over time

## id: conventions-codification
**Priority**: Medium  
**Effort**: ~1-2 hours  
**Context**: Logger/EventManager/DataManager conventions are repeatedly rediscovered during implementation and review.

**Done when**:
- Conventions live in one durable technical reference
- Reference is linked from contributor/agent docs
- New reviews can point to the single source instead of restating policy

## id: game-artwork-box-shading-plan
**Priority**: Medium — narrowed 2026-07-22; artwork boxes are already resolved, only labels remain
**Effort**: ~1 day (labels only, down from the original spike+full-implementation estimate)
**Context**: Originally scoped as "instanced game artwork/labels use custom ShaderMaterial
pipelines with no lighting/shadow chunks." A code audit found **artwork is already resolved** -
`LitArtworkMaterial.ts` uses `MeshStandardMaterial` with shader injection anchored at
`#include <map_fragment>`/`#include <roughnessmap_fragment>`, so lighting/shadow chunks are
preserved. **Labels are not**: `InstancedLabelRenderer.ts` uses a raw `ShaderMaterial`
(`instanced-label.frag`) that only samples a texture - no lighting chunks, so labels neither cast
nor visually receive shadow.

**Done when**:
- A chosen shading approach is documented and implemented for instanced label boxes specifically
- Lighting/shadow behavior is validated across at least one quality tier and one fallback tier
- Regression coverage exists for shadow participation assumptions in the label renderer

**Related files**:
- `client/src/scene/game-box/instancing/InstancedLabelRenderer.ts`
- `client/src/scene/game-box/materials/LitArtworkMaterial.ts` (the already-resolved reference implementation)

**Plan reference**:
- `docs/plans/game-artwork-box-shading-plan.md`

---

## Resolved

## id: steam-integration-loading-strategy-split
**Status**: ✅ Resolved 2026-07-22 — split into `OnlineLibraryLoader`/`DemoLibraryLoader`/`ImportLibraryHandler` (plain functions, not classes, matching `LocalSteamLibraryLoader`'s shape); `applyLibrary` stayed on `SteamIntegration` as shared substrate. `SteamIntegration.ts` dropped ~510 → ~365 lines.

## id: lod-tier-reset-race-condition
**Status**: ✅ Resolved 2026-07-22 — `GameBoxSpawner.resetForLibraryReload()` reconciles instead of disposing on capacity-compatible reloads (`LodArtworkOrchestrator.reconcileForLibraryReload()`); manually verified against a real desktop relaunch-with-persisted-library, no `Unknown tier: mid` errors. Residual (log-level only, not a bug): the surviving full-dispose path (capacity-incompatible transitions, e.g. demo → real library) still logs a disposed-instance race, now at `debug` not `error`; closes permanently once [Idempotent Library Scene Sync](../features/idempotent-library-scene-sync.md) removes that path.

## id: carpet-worker-offload
**Status**: ✅ Resolved 2026-04-13 — carpet texture generation moved to `ProceduralTextureWorker` (`carpet_enhanced` type). ~700ms main-thread startup hitch eliminated.

## id: approximated-placement-tripwire
**Status**: ✅ Resolved (date not tracked — confirmed via code audit 2026-07-22) — approximation assumptions documented inline (`GameBoxUtils.ts:9-13`, explicitly framed as a deliberate tripwire for model-sync regressions) and covered by `client/test/unit/scene/placement-tripwire.test.ts`.
