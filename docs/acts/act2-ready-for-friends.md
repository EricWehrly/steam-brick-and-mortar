# Act 2: "Ready for Friends"

## Overview

**Goal**: Works for people standing next to you during conversation.

**Scope**: Infrastructure hardening, multi-user capability, and VR support. **Reoriented 2026-07-22:
desktop is now the primary delivery vehicle, not a web app viewed on a desktop browser.** The
Tauri desktop build ([Native Desktop App](../features/desktop-app.md)) is the release target — a
downloadable Windows executable, distributed from the anonymous web demo store's existing
`#steam-ui` space (see [Desktop Release UI](../features/desktop-release-ui.md)). Publicly hosting
the web client is demoted to an Act 3 stretch goal (see
[act3-ready-for-everyone.md](act3-ready-for-everyone.md)) — the feature gap between desktop
(local filesystem, native HTTP, no CORS) and web has grown too wide to keep treating them as one
delivery target. VR is a required Act 2 deliverable but intentionally sequenced late — after
infrastructure stability and initial friend playtesting; VR runs through whichever build (desktop
WebView2 or hosted web) proves it out first, see [Native Desktop App](../features/desktop-app.md)'s
open VR-entry spike question.

**Entry Criteria**: Act 1 complete — all imagined functionality demonstrated with personal demo capability.

**Key requirements**: Handle 800+ game libraries efficiently, AWS Lambda rate limit mitigation, comprehensive caching, error recovery, multi-user capability, full VR support, a packaged and downloadable desktop client.

---

## Gate 1: Ready to Start Sharing

> Features that need to be solid before we hand this to anyone. Bugs here are embarrassing. Scope creep here is a trap.

- **Desktop Release Pipeline** — `scripts/release.sh` Steps 3–5 (`yarn build`, `cargo tauri build`, pack `release.zip`) are currently stubbed; **this is now the prerequisite for sharing anything**, replacing Static Hosting's old role. See [Release Pipeline](../plans/release-pipeline-plan.md) for the existing design (Steps 1–2 and 2.5 are done — S3 cache pull/repack, F2P artwork bake).
- [Desktop Release UI](../features/desktop-release-ui.md) — `#steam-ui` panel gains a "download desktop client (Windows)" path off the anonymous demo store; dev builds show all available options, release builds strip to just the one download button (and bookmarks import?)
- [First Load Experience](../features/first-load-experience.md) — anonymous store is coherent and inviting; new user is guided to connect their library or download the desktop client; performance on first load is acceptable; definition of "correct" pinned before sign-off
- [Network Rate Limiting](../features/network-rate-limiting.md) — substantially implemented (client `RateLimiter`, batching, backoff, circuit breaker; server-side 429 handling); client-side 429 handling and concurrency cap are the remaining gaps; matters for desktop too — it hits the same Lambda for online-fetch/enrichment
- [Multi-Layer Caching](../features/multi-layer-caching.md) — browser, Lambda L1, and S3/Lambda L2 all exist; CloudFront layer and AppDetailsCache TTL are the remaining gaps; protects the shared backend regardless of which client hits it
- [Input System](../features/input-system.md) — mouse/keyboard solid, gamepad movement/look solid (tested), keyboard accessibility for all menus; gamepad game-selection is a known gap, see [`gamepad-button-actions-unconsumed`](../tech-debt.md#id-gamepad-button-actions-unconsumed); VR controllers are Gate 2

## Gate 2: Act 2 Complete

> Features that must land before Act 2 is done. VR support lives here — it's a delivery goal, not a stretch goal.

- [VR Support](../features/vr-support.md) — full WebXR implementation; the whole store works in headset; this is the "impressor" that defines Act 2 done. **Sequencing decided 2026-07-23: VR controllers before headset** — controller input routes through the same abstraction gamepad already proved out, and is independently testable without a headset. Sub-scope 1 (controllers) landed; sub-scope 2 (settings-menu spatial UI) underway on `feature/vr-uikit-menu-migration` — see the feature doc's "Sequencing" section and [`vr-uikit-menu-migration-plan.md`](../plans/vr-uikit-menu-migration-plan.md).
- [GameSort Full Pipeline](../features/gamesort-full-pipeline.md) — re-sort reorders game boxes and shelves in the scene, not just signs; sub-feature of the tag-sorting north star

## Also In Act 2 (Best Effort)

> Real work we intend to make a serious attempt at. Not blockers. We punt when stuck.

- [User Screenshot Wall](../features/user-screenshot-wall.md) — early Act 2 feature spike to pull a player's Steam screenshots and display them in-store; store media remains fallback baseline
- [Steam Tag Pipeline](../features/steam-tag-pipeline.md) — SteamSpy tags via background Lambda + S3 snapshot; active in separate branch; invest to try, not required
- [Local File Investigation](../features/local-file-investigation.md) — research completed enough to make an Act 2 decision: local collections are useful, but filesystem API integration is deferred; revisit in AC4.4
- [Layout Variations](../features/layout-variations.md) — arc exists; square rows + dynamic switching are the open work; grouping is Encore; include layout-owned entrance mat placement for spoke and stage mat/carpet convergence as a mid-Act 2 follow-up, and treat angled-layout center-aisle overlap cleanup (`arc`/`spoke`) as medium priority without a fixed timebox
- [Liminal Mode](../features/liminal-mode.md) — endless-shelf "void" presentation as a modifier over a base layout (Row first); camera-driven row treadmill with seamless library looping, near-high/far-projected (unlit, shadow-off) fidelity split, stretched player-following room shell + fog; gated on in-place instance repositioning (shared with Layout Variations' dynamic switching)
- [Game Detail Screen](../features/game-detail-screen.md) — design pass tied to VR; do once with VR in mind rather than twice. **2026-09-05**: the fold-open box's three faces are now real `@pmndrs/uikit` panels, merged to `act2/default` via [PR #162](https://github.com/EricWehrly/steam-brick-and-mortar/pull/162)/[#161](https://github.com/EricWehrly/steam-brick-and-mortar/pull/161) — stable, meant as the reference implementation for the settings-menu migration and the new in-world-UI thread; still needs dedicated test coverage to stay that way (see the feature doc's Notes) — see [In-Scene UI Substrate](../architecture/in-scene-ui-substrate.md) for the uikit-vs-canvas decision, its limits, and the narrow canvas escape hatch for freeform art.
- [Lighting and Atmosphere](../features/lighting-and-atmosphere.md) — tone presets (corporate → dank) via LUT3D, dongle switch panel; core lighting is done, this is the experiential layer.
- [Prop Placement Anchors](../features/prop-placement-anchors.md) — props declare *what they're attached to* (room frame / shelf frame) rather than an absolute world position computed once, so they follow when that frame moves. Designed 2026-07-31 (see [plan](../plans/placement-anchor-system-plan.md)) after [Liminal Mode](../features/liminal-mode.md)'s treadmill broke every existing placer at once: shelf units recycle and the room shell translates every frame, stranding four independently-implemented "compute the position once" placers. Replaces [`liminal-props-must-follow-player`](../tech-debt.md#id-liminal-props-must-follow-player)'s per-system audit prescription, and is the shared dependency both clutter docs flagged as the real unbuilt engineering.
- [Scene Clutter & Props (harvested)](../features/scene-clutter-and-props.md) — recognizable/ambient set dressing *sourced* from Steam art, CC0, and (personal-mode) extracted/fan/AI models; Tiers A/B ship in current arch, Tiers C/D are desktop-gated
- [Wall Art & Framed Posters](../features/wall-art-framed-posters.md) — framed wall posters from official store art and desktop-local user screenshots ship in Act 2; web-facilitated screenshot scraping and points-shop cosmetics are deliberately deferred to early Act 3 (desktop-first sequencing call, 2026-07-14); graduated from the Act 4 Encore list
- [Fabricated Set Dressing](../features/fabricated-set-dressing.md) — concessions, employee counter + 90s PCs, coming-attractions board, peripheral cutouts; built procedurally like shelves/boxes, no IP risk; targeted for **late Act 2**
- [Interactable Scene Objects](../features/interactable-objects.md) — generic prop interaction dispatch; layer infrastructure exists, dispatch gap is the work; prerequisite for any non-game-box clickable
- [Friend Stream Projection](../features/friend-stream-projection.md) — Tier 1 only (Act 2): `getDisplayMedia` → `VideoTexture` on an in-scene TV; user picks any window (Twitch tab, OBS, friend's stream, anything); proves the rendering pipeline; requires Interactable Objects first for the button
- [Procedural Texture Quality Pass](../features/procedural-texture-quality.md) — MDF veneer, popcorn ceiling, wood plank walls, carpet; carried from Act 1
- [Game Box Construction Chain](../features/game-box-construction-chain.md) — typed dependency chain replacing ad-hoc monolithic rebuilds in `LodGameArtworkRenderer`; each pipeline stage is an event with declared prerequisites; enables re-entry at any stage, clean failure signaling, and future taps (LOD streaming, preloading, perf logging); WIP plan, not yet started
- [Idempotent Library Scene Sync](../features/idempotent-library-scene-sync.md) — north star from the startup/reload self-review: fold the remaining reconcile/full branch in `GameBoxSpawner.resetForLibraryReload()` into one always-diff apply (grow the texture array in place instead of dispose+rebuild on capacity growth); closes two recorded latent issues (full-reset disposal race, reconcile's unbounded slot leak) for free; not urgent on its own, but worth landing before Tier 3 in-session remote refresh (see Desktop Offline-First below) makes the slot-leak issue unbounded
- Enhanced error handling — robust recovery for rate limits, invalid Steam IDs, timeouts, partial failures
- **Traffic safety** — reduce Steam-bound request volume before showing this around to anyone; see [Traffic Safety Review](../plans/traffic-safety-review.md). Steps 1–2 (pull the Lambda's S3 app-details cache, repack into one client-served bundle) and Step 2.5 (bake F2P artwork) of the release pipeline are **done** — cuts enrichment traffic to near-zero for already-cached games and eliminates CDN artwork traffic for the anonymous store entirely. Steps 3–5 (the actual build/pack) are now Gate 1's **Desktop Release Pipeline** item above, not a best-effort item.
- **CDN artwork traffic** — researched (2026-07-09), **both plans done**. [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) (Plan 1, archived 2026-07-11) — an audit found the double-fetch bug and MID-tier caching gap it targeted were already fixed by an unrelated artwork-pipeline rewrite; the one remaining item (re-enabling the disabled LOD graphics-settings sliders) was closed out directly. [F2P Artwork Bake](../plans/f2p-artwork-bake-plan.md) (Plan 2, built 2026-07-13): bakes the anonymous-store artwork set into one grid image (~2.6MB) and pre-seeds `PixelDataCache` under the real Steam CDN URL at startup, so the artwork pipeline never needs to know any of it was baked; connected-user libraries are deliberately *not* blanket-baked (per-user, potentially hundreds of MB — Steam's CDN, not our infra, is the right thing serving that traffic, and it's built for public fan-out at a much larger scale than we'd generate).
- **Low-priority cleanup, not scheduled**: [`metadata-refetch-no-circuit-breaker`](../tech-debt.md#id-metadata-refetch-no-circuit-breaker) — a known (not yet observed) infinite-retry path for locally-seeded cache entries missing genre/category data, surfaced while planning the taxonomy-data-event work; expected to mostly resolve itself once that plan's baked-bundle genre/category harvesting lands, revisit only if it doesn't.
- **Desktop offline-first refresh behavior** — see [Desktop Offline-First Plan](../plans/desktop-offline-first-plan.md): first real-library test surfaced an automatic online re-fetch firing for the local-scan channel (Round 1: excluded local-scan from the fetch; superseded since — that background re-fetch mechanism, "Fork A," was removed outright and replaced with `SteamIntegration`'s single-source startup waterfall) plus a full scene reset it compounded on top of; a **second** test then corrected the diagnosis — the actual primary cause of the "~300 unnecessary Lambda calls, waiting before the rest of the library loads" complaint is `LocalSteamLibraryLoader` itself blocking its first render on a full network gap-fill (Round 1.5, now top priority, not yet fixed). "Upgrade not replace" refresh redesign (web + desktop) and routing desktop network calls through Tauri's Rust HTTP client remain scheduled after that. Also surfaces [`cors-blocked-local-scan-artwork`](../tech-debt.md#id-cors-blocked-local-scan-artwork) (next thing to fix, and per the second test session, likely conflated with plain 404s — see the plan doc's log-noise section) and [`lod-tier-reset-race-condition`](../tech-debt.md#id-lod-tier-reset-race-condition) (disposal-ordering race breaking every second-and-later launch with a persisted library; fix implemented 2026-07-14, real-relaunch manual verification still open).
- [Loading Placeholder Boxes](../features/loading-placeholder-boxes.md) — when a game box's slot is known but its artwork hasn't resolved yet, render a cheap, generic "art incoming" box rather than leaving the slot empty, swapped for real artwork in place once it resolves. Deliberately **not** a per-game render — one shared texture for every pending box, which is what keeps it cheap. Designed 2026-07-30 (see [plan](../plans/loading-placeholder-boxes-plan.md)) after [Liminal Mode](../features/liminal-mode.md) testing surfaced it concretely: shelves are procedural geometry and appear instantly, artwork needs a network fetch, so the lag between them is structural rather than a bug. Layout-agnostic — also covers initial build and re-sort for every other layout, and the artwork-lag case the offline-first plan above describes. Natural tie-in to [Game Box Construction Chain](../features/game-box-construction-chain.md) if/when that lands, but not dependent on it.
- [UI Standardization](../features/ui-standardization.md) — in-scene omnibar, 3D sign elements, component tokens (started in intermission, may extend into Act 2)
- [uikit Component System](../features/uikit-component-system.md) — real content/layout/style separation for `@pmndrs/uikit`-built in-scene panels, replacing today's fully-imperative per-panel construction; **revised 2026-09-05**: building opportunistically alongside VR Support's settings-menu migration and the new in-world-UI thread rather than waiting for either to land first — cheapest real extraction as each new panel's shape shows up, not a big-bang redesign

## Move to Act 3
These "best effort" items should get moved from act 2 to "early act 3"

- [Static Hosting](../features/static-hosting.md) — publicly hosting the web client; demoted from Gate 1 (2026-07-22 desktop-first reorientation) to an Act 3 stretch goal, see act3's "Also In Act 3" list
- Infrastructure monitoring — CloudWatch metrics, client telemetry, cache performance dashboards
- [Room Variants](../features/room-variants.md) — room structure cleanup first, then variant system; Cozy Basement is the target variant
- [Post-Processing Effects](../features/postprocessing-effects.md) — SelectiveBloom lands alongside neon signs.
- **`autoLoadProfile` not honored** — [`autoloadprofile-not-wired-to-startup-waterfall`](../tech-debt.md#id-autoloadprofile-not-wired-to-startup-waterfall), high priority: the "Auto-load last used Steam profile" toggle persists but the startup waterfall (cache → local disk → online → demo, see the offline-first item below) ignores it and always auto-loads; surfaced during the same post-merge cleanup that resolved the loading-strategy split.

## Completion Criteria

- Desktop client is packaged and downloadable (Windows) from the anonymous demo store without local dev setup
- 800+ game libraries load reliably without rate limiting failures
- Graceful degradation when rate limits are hit
- Multi-layer caching prevents repeated origin hits
- Multiple users can use simultaneously without shared rate limit interference
- All core navigation accessible via keyboard without mouse dependency
- Full VR session works: navigation, game browsing, UI interaction in headset
- Sort mode change reorders game boxes and shelves in the scene

## Notes

- When actively working on a feature, check whether related items on the Encore list are plausibly quick. If so, pull them forward rather than leaving them for later — "while we're here" is the right time to try.
