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

**Superseded by**: [Startup Artwork Resolution & Caching](../plans/startup-artwork-resolution-plan.md) —
root-caused further (2026-07-23): `LocalSteamDataWriter.writeLocalAppMetadata()` writes a
name-only entry with null artwork for every locally-known appid *before* the network gap-fill's
`findMissing()` check runs, so that check (which only asks "does any entry exist") never fires for
these games at all — confirmed with real appid 2062430 via direct `curl` against Steam's CDN and
API. Track further design/implementation there, not here.

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

## id: lambda-outbound-api-circuit-breaker
**Priority**: Low
**Effort**: ~1-2 hours (cockatiel is already a proven pattern here — see `client/src/steam/batch/BatchAppDetailsClient.ts` — just needs the Node/Lambda-side equivalent)
**Context**: `BatchAppDetailsClient.ts` replaced its hand-rolled circuit breaker with cockatiel (2026-07-30) to stop hammering our own Lambda during an outage. A codebase-wide sweep for the same shape of problem while reviewing that change found it on the server side too, one hop closer to the actual flaky third party:
- `getAppDetails()` in `external-tool/infrastructure/lambda-src/services/steam-api.js` calls the real Steam Store API per-appid (up to 5 concurrent), with hand-rolled retry that only backs off on HTTP 429 — a 5xx, timeout, or connection reset gets no backoff and no shared "stop trying" signal across the batch.
- `fetchSteamSpyData()` in `external-tool/infrastructure/lambda-hydrator-src/index.js` has the same shape against the SteamSpy API.

**Decision (for now)**: track it, don't fix. Neither Lambda has shown symptoms of this in practice; not worth the churn until one does.

**Done when**:
- Both functions share a per-process circuit breaker (cockatiel) around their outbound call, opening on any hard failure (not just 429) and skipping remaining concurrent/batch work once open, same shape as `BatchAppDetailsClient`'s fix

**Related files**:
- `external-tool/infrastructure/lambda-src/services/steam-api.js`
- `external-tool/infrastructure/lambda-hydrator-src/index.js`

## id: game-data-field-coverage-check
**Priority**: Low
**Effort**: Small - see the plan doc
**Context**: `SteamIntegration.ts` had a one-off, single-field version of this (`warnIfFieldUncovered`,
hardcoded to `userscore`) - removed in PR #161's review as not worth committing in that narrow
shape. Plan: [`game-data-field-coverage-check-plan.md`](../plans/game-data-field-coverage-check-plan.md).

**Related files**:
- `client/src/steam-integration/SteamIntegration.ts` (`// TD: game-data-field-coverage-check`)

## id: game-box-features-icon-display
**Priority**: Low
**Effort**: Small - icon set + a small display change in `GameBoxDebugPanel`
**Context**: Steam's raw feature-category strings ("Full controller support", "Steam Cloud", "Steam
Workshop", ...) were shown as a plain uikit chip row (`FEATURES`, same treatment as GENRES/TAGS),
but read as unhelpful clutter rather than useful information - direct request (2026-09-02): "the
features section isn't that helpful. We need to deliberately park it until we can represent it with
icons." The display is removed for now; `GameBoxFoldCoordinator` still builds a deduped
`content.categories` list (the raw strings sometimes repeated an entry verbatim - dedupe fixed
alongside parking the display), so the data is ready whenever an icon set exists.
**Done when**: each Steam feature category maps to a small icon (or is dropped if it has none worth
drawing), and `GameBoxDebugPanel` renders that icon row again instead of the parked plain-text chips.
**Related files**:
- `client/src/scene/game-box-fold/panels/GameBoxDebugPanel.ts` (`// TD: game-box-features-icon-display`)
- `client/src/scene/game-box-fold/GameBoxFoldCoordinator.ts` (still builds `content.categories`)

## id: game-box-color-centralization
**Priority**: Low - narrowed 2026-09-02 (round five) now that the minimum bar (surface/sleeve) is met
**Effort**: Small - the resolver pattern and tokens.css entries already exist; what's left is
migrating the remaining local hex literals below onto the same pattern, one at a time
**Context**: The game box's own palette (`GameBoxPanelStyle.ts`'s `BOX_SURFACE_GRAY`/`BOX_SLEEVE_GRAY`,
its section accents `play`/`rating`/`metacritic`/`genres`/`tags`/`features`/`collections`/`json`, and
`GameBoxStorePanel.ts`'s `DISC_EDGE_COLOR`) were all local hex literals rather than tokens -
deliberately, per `GameBoxPanelStyle.ts`'s own comment (now corrected), reasoning that `tokens.css`
had no vocabulary for "the box's own printed material." That reasoning left `BOX_SURFACE_GRAY` and
`GameBoxFoldModel.ts`'s raw `plainMaterial` color as two independently-guessed literals that drifted
out of sync - the actual cause of the box's center still reading black after the panels' own
steam-gray fix (direct request, 2026-09-02, round four) - and, separately, the sleeve gray chosen
was dark enough to still read as black in practice (round four again: "why black", pointing at the
sleeve). Direct request, round five: "we already have said tokens... colors should come from
existing tokens or similar steam-derived livery... one centralized definition for that." Fixed:
`--color-box-surface`/`--color-box-sleeve` now exist in `client/src/ui/tokens.css`, resolved live via
`UIKIT_COLORS.boxSurface`/`.boxSleeve` in `UikitColorTokens.ts` exactly like every other token there -
`GameBoxPanelStyle.ts`'s `BOX_SURFACE_GRAY`/`BOX_SLEEVE_GRAY` now just re-export those two resolved
values instead of their own hex literals, and the sleeve's value was lightened in the same pass.
**Done when**: the section accents (`play`/`rating`/`metacritic`/`genres`/`tags`/`features`/
`collections`/`json`) and `GameBoxStorePanel.ts`'s `DISC_EDGE_COLOR` also resolve from named
`--color-*` tokens instead of local hex literals, following the same `UIKIT_COLORS` pattern the
surface/sleeve grays now use. Still a stretch, not required - `GameBoxPanelStyle.ts`'s own comment on
`PANEL_COLORS` explains why these were left local (no existing "the genres section" vocabulary in
tokens.css) and that reasoning hasn't changed, only the surface/sleeve case that was actually broken.
**Related files**:
- `client/src/scene/game-box-fold/panels/GameBoxPanelStyle.ts` (`BOX_SURFACE_GRAY`, `PANEL_COLORS`)
- `client/src/scene/game-box-fold/panels/GameBoxStorePanel.ts` (`DISC_EDGE_COLOR`)
- `client/src/scene/game-box-fold/GameBoxFoldModel.ts` (`plainMaterial`, now reuses `BOX_SURFACE_GRAY`)
- `client/src/scene/uikit/UikitColorTokens.ts` (`boxSurface`/`boxSleeve` - the pattern to extend for the rest)
- `client/src/ui/tokens.css` (`--color-box-surface`/`--color-box-sleeve` - the app's one real design-token source)

## id: dev-tooling-cant-screenshot-backgrounded-tab
**Priority**: Low
**Effort**: Unknown - environment/tooling investigation, not app code (see Decision below)
**Context**: This session's browser-automation tooling couldn't capture screenshots or read live
render state reliably. Root cause turned out to be layered:
1. `FocusCoordinator` voluntarily pauses the render loop on tab/window blur - already correctly
   skippable via `?diagnostics=1` (unrelated to this entry, working as designed).
2. Even with that pause skipped, `WebGLRenderer.setAnimationLoop()` schedules via
   `requestAnimationFrame` internally, and a hidden/backgrounded tab gets its rAF throttled or
   suspended by the browser itself - regardless of what the app wants. A real fix for this layer
   was built and verified (`SceneManager.startRenderLoop()` driving the loop via `setInterval`
   instead under `?diagnostics=1`) but then deliberately backed out (2026-08-21, direct request) -
   see the patch below.
3. Even with (1) and (2) both addressed, the screenshot tool itself still failed with "the Browser
   pane is not displayed, so the page is not compositing frames" - a constraint on the *capture*
   mechanism (likely OS/CDP-level compositor access), not on the page's own render loop. Layer 2's
   fix couldn't have solved this on its own even if kept.

**Decision (for now)**: don't chase this with more app code. The actual fix is environment-side -
running the automated browser in the foreground when a real screenshot is needed - and that's a
tooling/environment change, not something to solve by adding render-loop workarounds to product
code. Layer 2's fix is preserved as a patch rather than discarded outright, in case it turns out to
still be useful later (e.g. a genuinely unattended CI capture scenario that can't be foregrounded):
[`docs/patches/diagnostics-render-loop-keep-alive.patch`](patches/diagnostics-render-loop-keep-alive.patch)
(apply with `git apply docs/patches/diagnostics-render-loop-keep-alive.patch`).

**Done when**: the foreground-window tooling approach is sorted out and screenshots work reliably
for this kind of session - or, if that's not achievable, layer 2's patch gets reapplied as a real
fix and this entry updates to reflect that.

**Related files**:
- `client/src/scene/SceneManager.ts` (`startRenderLoop()`)
- `client/src/utils/UrlUtils.ts` (`isDiagnosticsEnabled()`)
- `client/src/ui/coordinators/FocusCoordinator.ts`
- `docs/patches/diagnostics-render-loop-keep-alive.patch`

## id: xr-menu-button-mapping-unverified
**Priority**: Low
**Effort**: ~30 min once a real headset is on hand (connect, run the existing HID/gamepad button
dump, read the real index off `gamepad.buttons`)
**Context**: `InputProfile.ts`'s VR profile binds `OpenMenu` to raw `xr-standard` gamepad button
index 4 - a best-effort guess, not verified against real hardware. The system/Oculus button is
typically OS-reserved on Quest and may not be exposed to
`gamepad.buttons` at all; where a secondary button *is* exposed, its index isn't guaranteed stable
across controller families. See `docs/plans/vr-support-plan.md`.

**Decision (for now)**: ship the guess, don't block sub-scope 1 on it. In-headset pause-menu access
realistically belongs to VR Support's sub-scope 2 (spatial UI) anyway - low urgency until that's
picked up.

**Done when**:
- Verified (or corrected) against at least one real headset's actual button index
- If no exposed button exists on a given controller family, `OpenMenu` simply doesn't fire from XR
  on that hardware (already the graceful behavior today, not a crash) - document that instead

**Related files**:
- `client/src/input/BindingResolver.ts`

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

---

## id: liminal-props-must-follow-player
**Priority**: High (grows with every prop system liminal mode touches)
**Effort**: ~1 day for lighting; unscoped for "every prop" — needs a survey pass first
**Context**: Liminal mode's Fork A has the player walking indefinitely through absolute world
space while the corridor recycles. `RoomManager`'s shell (floor/ceiling/walls) originally sized
itself once from the initial shelf bounds and never moved again — shelves that recycled past the
original span ended up behind the static back wall, occluded (see `docs/bugs.md`, fixed in
`41f0b6fc`). Fixed by having `RoomManager` translate its `roomGroup` 1:1 with the camera each frame
while liminal is active.

That fix only covers `RoomManager`'s own geometry. Anything else anchored to a *fixed* world
position from the original (non-recycling) layout has the identical problem and hasn't been
audited yet:
- `LightingRenderer`'s point lights / spotlights (`addPointLights()`, `entranceSpot`, etc.) — placed
  at fixed positions/ranges relative to the original room. Once the player and shelves have moved
  far enough past the original span, these lights no longer illuminate anything nearby. Ambient +
  directional light (both position-independent) provide a floor so this isn't a hard-invisible bug
  like the wall was, but distant recycled shelves will read dimmer/flatter than intended.
- The "STEAM LIBRARY" title sign (`SceneSignManager`) — confirmed broken, see `docs/bugs.md`.
- Any other prop anchored via a one-time absolute-position computation rather than parented to
  `roomGroup` or otherwise following the camera (user-placed props via `UserPropPlacer`,
  `PropRenderer`'s atmospheric props, etc. — not yet individually checked).

**Decision (for now)**: don't fix lighting or do the full prop survey yet. Documented so the next
liminal pass (or anyone adding a new prop system) knows to check "does this need to follow the
player under Fork A" rather than rediscovering the pattern per-system.

**Done when**:
- Every prop/light system either follows the player under liminal mode (mirroring
  `RoomManager.onFrame`'s translate-with-camera approach) or is confirmed not to need it
- A short note in `client/CLAUDE.md` or the liminal feature doc names this as a checklist item for
  new prop systems

**Related files**: `client/src/scene/RoomManager.ts` (the reference implementation),
`client/src/scene/LightingRenderer.ts`, `client/src/scene/SceneSignManager.ts`,
`client/src/scene/props/UserPropPlacer.ts`, `client/src/scene/PropRenderer.ts`
**Related docs**: `docs/plans/liminal-mode-plan.md` (Story 5/6), `docs/bugs.md`

---

## Later (only true debt, not feature wish-list)

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

## id: progressive-speed-movement-unwired
**Priority**: Low
**Effort**: N/A — intentionally left unwired, no active work planned
**Context**: `InputStateTracker.getProgressiveSpeed()` (ramps from 10% to a configurable multiplier
of `options.speed` over a configurable hold time) has zero callers — `CameraInputApplier.updateMovement()`
applies `options.speed` directly per axis with no ramp. Left over from an earlier movement design
that was superseded before wiring. Kept rather than deleted per 2026-07-23 discussion: it's a
plausible alternate movement scheme worth revisiting later, and deleting it now would mean
re-deriving the same ramp curve from scratch if that decision comes back around.

**Decision (for now)**:
- Keep the method as-is (no caller). Do not delete, do not expand into a full implementation.
  Revisit only if there's a concrete decision to add ramped movement acceleration back into
  `CameraInputApplier`.

**Done when**:
- Either wired into `CameraInputApplier.updateMovement()` as a real per-axis multiplier, or removed
  entirely if a future review decides ramped movement isn't wanted.

**Source tag**:
- `// TD: progressive-speed-movement-unwired` in `client/src/input/InputStateTracker.ts`

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

## id: gamepad-menu-navigation-unimplemented
**Priority**: Medium
**Effort**: Unestimated — a real UI-navigation layer (D-pad/stick-driven focus movement, `Interact`-to-activate), not a small patch
**Context**: A gamepad-only user (no mouse/keyboard) can open the pause menu (`OpenMenu` is bound to
button 9 by default) but has no way to navigate *inside* it — every panel control
(`ControlsPanel`/`GraphicsSettingsPanel`/etc. checkboxes, sliders, selects, buttons) only responds
to mouse clicks and native keyboard Tab/Enter focus. Nothing translates gamepad D-pad/stick state
into DOM focus movement or synthesizes a click on the focused element. Surfaced 2026-07-24 while
checking whether a gamepad-only player could reach the existing `fullscreen-enabled` checkbox in
`GraphicsSettingsPanel` (`GraphicsSettingsPanel.ts`'s `setFullscreenEnabled()`) — the checkbox
itself already works via the Fullscreen API, but a gamepad-only user cannot reach or toggle it,
or any other in-menu control, today.

**Decision (for now)**:
- Not building this now — scoped as its own feature, not a fast-follow patch, since it needs a
  design pass (focus order, visual focus indicator, analog-stick vs. D-pad repeat/acceleration,
  and how `Interact` disambiguates "activate focused menu control" from its existing
  "click at reticle" scene behavior while the menu is open).

**Done when**:
- A gamepad-only user can open the pause menu, move focus between its controls, and
  activate/adjust each control type (checkbox, select, slider, button) without a mouse or keyboard.

**Related files**:
- `client/src/ui/pause/panels/ControlsPanel.ts`
- `client/src/ui/pause/panels/GraphicsSettingsPanel.ts`
- `client/src/ui/pause/PauseMenuManager.ts`

---

## id: cancel-pressed-listener-duplication
**Priority**: Low
**Effort**: Small
**Context**: `PauseMenuManager`, `GameLibraryBinderUI`, `BinderGameDetailPanel`, and
`GameArtworkInspector` each independently register/deregister an `InputEventTypes.CancelPressed`
handler that closes themselves if open - identical boilerplate in four places. A composition-based
`CancelDismissHandler` helper was tried (2026-07-25) and reverted: it didn't feel like the right
shape for the job. Worth another look, but not urgent - the duplication is small and mechanical,
not a source of bugs.

**Done when**:
- The four register/deregister call sites share one implementation, however it ends up shaped
  (base class, mixin, or a different composition helper) - or a deliberate decision is made that
  four copies is fine and this entry is closed as won't-fix.

**Related files**:
- `client/src/ui/pause/PauseMenuManager.ts`
- `client/src/ui/binder/GameLibraryBinderUI.ts`
- `client/src/ui/binder/BinderGameDetailPanel.ts`
- `client/src/debug/GameArtworkInspector.ts`

---

## Resolved

## id: game-box-canvas-ui-hit-testing
**Status**: ✅ Resolved 2026-09-02 — the game-box fold's three faces were hand-drawn onto canvas
textures, with content/style/layout interleaved in one imperative draw call per face and "buttons"
hit-tested via raycast UV → canvas coords (`isPointInPlayButton`/`isPointInCacheEntry`). Replaced
with `@pmndrs/uikit` panels parented to the existing hinge groups (real flexbox layout, real hover/
click/scroll via `@pmndrs/pointer-events`) - see [`in-scene-ui-substrate.md`](architecture/in-scene-ui-substrate.md)
for the decision to standardize on uikit. No `isPointIn*`-style hit-testing remains in
`GameBoxFoldModel`.

## id: steam-integration-loading-strategy-split
**Status**: ✅ Resolved 2026-07-22 — split into `OnlineLibraryLoader`/`DemoLibraryLoader`/`ImportLibraryHandler` (plain functions, not classes, matching `LocalSteamLibraryLoader`'s shape); `applyLibrary` stayed on `SteamIntegration` as shared substrate. `SteamIntegration.ts` dropped ~510 → ~365 lines.

## id: lod-tier-reset-race-condition
**Status**: ✅ Resolved 2026-07-22 — `GameBoxSpawner.resetForLibraryReload()` reconciles instead of disposing on capacity-compatible reloads (`LodArtworkOrchestrator.reconcileForLibraryReload()`); manually verified against a real desktop relaunch-with-persisted-library, no `Unknown tier: mid` errors. Residual (log-level only, not a bug): the surviving full-dispose path (capacity-incompatible transitions, e.g. demo → real library) still logs a disposed-instance race, now at `debug` not `error`; closes permanently once [Idempotent Library Scene Sync](../features/idempotent-library-scene-sync.md) removes that path.

## id: carpet-worker-offload
**Status**: ✅ Resolved 2026-04-13 — carpet texture generation moved to `ProceduralTextureWorker` (`carpet_enhanced` type). ~700ms main-thread startup hitch eliminated.

## id: approximated-placement-tripwire
**Status**: ✅ Resolved (date not tracked — confirmed via code audit 2026-07-22) — approximation assumptions documented inline (`GameBoxUtils.ts:9-13`, explicitly framed as a deliberate tripwire for model-sync regressions) and covered by `client/test/unit/scene/placement-tripwire.test.ts`.

## id: gamepad-button-actions-unconsumed
**Status**: ✅ Resolved 2026-07-24 — see `docs/plans/input-action-routing-plan.md` (implemented, then revised twice the same day after design reviews — see the plan's "Revision history" for what changed and why each time). Keyboard `Interact`/`OpenMenu` now fire directly off the real `keydown` DOM event (via a new `InputStateTracker.onRawKeyDown` callback) — no polling, no frame-diffing, since keyboard already has a real press edge. Mouse deliberately has no equivalent path: a real mouse click already has its own independent dispatch (`SystemUICoordinator`), entirely separate from the binding system, so nothing was added to route it through here too. Gamepad has no native press event, so `DeviceDetector.pollGamepads()` (which already polls every frame) tracks per-button state and emits `InputEventTypes.GamepadButtonPressed` on a transition. Both keyboard and gamepad funnel through `InputActionResolver`'s new `handleRawKeyPress()`/`handleGamepadButtonPress()`, which look up bound actions via a new `BindingResolver.findButtonActionsBoundTo()` and resolve all the way to a *specific* event per action (`InputEventTypes.OpenMenuPressed`, `InputEventTypes.InteractPressed`) rather than a generic tagged envelope — `InputActionResolver` is the class whose job is deciding which action fired, so it does that fully rather than handing a partial answer downstream. No dispatcher class: `PauseMenuManager` listens for `OpenMenuPressed` directly and calls its own `toggle()` (replacing the old hardcoded `Escape`-only listener); `SystemUICoordinator` listens for `InteractPressed` (simulates a click at the reticle position by emitting the existing `SceneCanvasClick` with center-screen NDC) and owns the gamepad/VR reticle. Along the way, fixed two real bugs: (1) pausing didn't actually stop gamepad-driven camera movement — `InputManager` now has `pause()`/`resume()` that gate camera application only, while `updateFrame()` (gamepad polling) keeps running; (2) `DeviceDetector.pollGamepads()` only flagged a device-list change on gamepad *disconnect*, never *connect* via polling. `ToggleUI` and `ToggleFullscreen` were both removed entirely rather than built (see [Input System](features/input-system.md) Stretch section) — no consumer was ever designed for `ToggleUI`, and `ToggleFullscreen` was redundant scope (F11 already provides native browser fullscreen).
