# Act 2: "Ready for Friends"

## Overview

**Goal**: Works for people standing next to you during conversation.

**Scope**: Infrastructure hardening, multi-user capability, and VR support. Desktop/flatscreen is the initial delivery target; VR is a required Act 2 deliverable but intentionally sequenced late — after infrastructure stability and initial friend playtesting.

**Entry Criteria**: Act 1 complete — all imagined functionality demonstrated with personal demo capability.

**Key requirements**: Handle 800+ game libraries efficiently, AWS Lambda rate limit mitigation, comprehensive caching, error recovery, multi-user capability, full VR support.

---

## Gate 1: Ready to Start Sharing

> Features that need to be solid before we hand this to anyone. Bugs here are embarrassing. Scope creep here is a trap.

- [Static Hosting](../features/static-hosting.md) — public HTTPS URL, repeatable deploy, CORS wired to Lambda; **the** prerequisite for sharing anything; CloudFront is the likely choice (cost projection discussion to happen early Act 2); deploy consumes the local **release** artifact — see the Release Pipeline item below for what that build/pack step actually is
- [First Load Experience](../features/first-load-experience.md) — anonymous store is coherent and inviting; new user is guided to connect their library; performance on first load is acceptable; definition of "correct" pinned before sign-off
- [Network Rate Limiting](../features/network-rate-limiting.md) — substantially implemented (client `RateLimiter`, batching, backoff, circuit breaker; server-side 429 handling); client-side 429 handling and concurrency cap are the remaining gaps
- [Multi-Layer Caching](../features/multi-layer-caching.md) — browser, Lambda L1, and S3/Lambda L2 all exist; CloudFront layer and AppDetailsCache TTL are the remaining gaps
- [Input System](../features/input-system.md) — mouse/keyboard solid, gamepad support, keyboard accessibility for all menus; VR controllers are Gate 2

## Gate 2: Act 2 Complete

> Features that must land before Act 2 is done. VR support lives here — it's a delivery goal, not a stretch goal.

- [VR Support](../features/vr-support.md) — full WebXR implementation; the whole store works in headset; this is the "impressor" that defines Act 2 done
- [GameSort Full Pipeline](../features/gamesort-full-pipeline.md) — re-sort reorders game boxes and shelves in the scene, not just signs; sub-feature of the tag-sorting north star

## Also In Act 2 (Best Effort)

> Real work we intend to make a serious attempt at. Not blockers. We punt when stuck.

- [User Screenshot Wall](../features/user-screenshot-wall.md) — early Act 2 feature spike to pull a player's Steam screenshots and display them in-store; store media remains fallback baseline
- [Steam Tag Pipeline](../features/steam-tag-pipeline.md) — SteamSpy tags via background Lambda + S3 snapshot; active in separate branch; invest to try, not required
- [Local File Investigation](../features/local-file-investigation.md) — research completed enough to make an Act 2 decision: local collections are useful, but filesystem API integration is deferred; revisit in AC4.4
- [Layout Variations](../features/layout-variations.md) — arc exists; square rows + dynamic switching are the open work; grouping is Encore; include layout-owned entrance mat placement for spoke and stage mat/carpet convergence as a mid-Act 2 follow-up, and treat angled-layout center-aisle overlap cleanup (`arc`/`spoke`) as medium priority without a fixed timebox
- [Liminal Mode](../features/liminal-mode.md) — endless-shelf "void" presentation as a modifier over a base layout (Row first); camera-driven row treadmill with seamless library looping, near-high/far-projected (unlit, shadow-off) fidelity split, stretched player-following room shell + fog; gated on in-place instance repositioning (shared with Layout Variations' dynamic switching)
- [Game Detail Screen](../features/game-detail-screen.md) — design pass tied to VR; do once with VR in mind rather than twice
- [Room Variants](../features/room-variants.md) — room structure cleanup first, then variant system; Cozy Basement is the target variant
- [Lighting and Atmosphere](../features/lighting-and-atmosphere.md) — tone presets (corporate → dank) via LUT3D, dongle switch panel; core lighting is done, this is the experiential layer. See also: [Post-Processing Effects](../features/postprocessing-effects.md) — SelectiveBloom lands alongside neon signs.
- [Scene Clutter & Props (harvested)](../features/scene-clutter-and-props.md) — recognizable/ambient set dressing *sourced* from Steam art, CC0, and (personal-mode) extracted/fan/AI models; Tiers A/B ship in current arch, Tiers C/D are desktop-gated
- [Wall Art & Framed Posters](../features/wall-art-framed-posters.md) — framed wall posters from official store art and desktop-local user screenshots ship in Act 2; web-facilitated screenshot scraping and points-shop cosmetics are deliberately deferred to early Act 3 (desktop-first sequencing call, 2026-07-14); graduated from the Act 4 Encore list
- [Fabricated Set Dressing](../features/fabricated-set-dressing.md) — concessions, employee counter + 90s PCs, coming-attractions board, peripheral cutouts; built procedurally like shelves/boxes, no IP risk; targeted for **late Act 2**
- [Interactable Scene Objects](../features/interactable-objects.md) — generic prop interaction dispatch; layer infrastructure exists, dispatch gap is the work; prerequisite for any non-game-box clickable
- [Friend Stream Projection](../features/friend-stream-projection.md) — Tier 1 only (Act 2): `getDisplayMedia` → `VideoTexture` on an in-scene TV; user picks any window (Twitch tab, OBS, friend's stream, anything); proves the rendering pipeline; requires Interactable Objects first for the button
- [Procedural Texture Quality Pass](../features/procedural-texture-quality.md) — MDF veneer, popcorn ceiling, wood plank walls, carpet; carried from Act 1
- [UI Standardization](../features/ui-standardization.md) — in-scene omnibar, 3D sign elements, component tokens (started in intermission, may extend into Act 2)
- [Game Box Construction Chain](../features/game-box-construction-chain.md) — typed dependency chain replacing ad-hoc monolithic rebuilds in `LodGameArtworkRenderer`; each pipeline stage is an event with declared prerequisites; enables re-entry at any stage, clean failure signaling, and future taps (LOD streaming, preloading, perf logging); WIP plan, not yet started
- [Idempotent Library Scene Sync](../features/idempotent-library-scene-sync.md) — north star from the startup/reload self-review: fold the remaining reconcile/full branch in `GameBoxSpawner.resetForLibraryReload()` into one always-diff apply (grow the texture array in place instead of dispose+rebuild on capacity growth); closes two recorded latent issues (full-reset disposal race, reconcile's unbounded slot leak) for free; not urgent on its own, but worth landing before Tier 3 in-session remote refresh (see Desktop Offline-First below) makes the slot-leak issue unbounded
- Enhanced error handling — robust recovery for rate limits, invalid Steam IDs, timeouts, partial failures
- Infrastructure monitoring — CloudWatch metrics, client telemetry, cache performance dashboards
- ~~Test network isolation~~ — automatic blocking of external calls in tests is **done** (implemented via global fetch intercept in unit/integration test setup)
- **Traffic safety / Release Pipeline** — reduce Steam-bound request volume before showing this around to anyone; see [Traffic Safety Review](../plans/traffic-safety-review.md). `scripts/release.sh` Steps 1–2 (pull the Lambda's S3 app-details cache, repack into one client-served bundle) and Step 2.5 (bake F2P artwork) are **done** — cuts enrichment traffic to near-zero for already-cached games and eliminates CDN artwork traffic for the anonymous store entirely; see [Release Pipeline](../plans/release-pipeline-plan.md). Steps 3–5 (`yarn build`, `cargo tauri build`, pack `release.zip`) are **not yet implemented** — currently stubbed functions in the same script.
- **CDN artwork traffic** — researched (2026-07-09), **both plans done**. [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) (Plan 1, archived 2026-07-11) — an audit found the double-fetch bug and MID-tier caching gap it targeted were already fixed by an unrelated artwork-pipeline rewrite; the one remaining item (re-enabling the disabled LOD graphics-settings sliders) was closed out directly. [F2P Artwork Bake](../plans/f2p-artwork-bake-plan.md) (Plan 2, built 2026-07-13): bakes the anonymous-store artwork set into one grid image (~2.6MB) and pre-seeds `PixelDataCache` under the real Steam CDN URL at startup, so the artwork pipeline never needs to know any of it was baked; connected-user libraries are deliberately *not* blanket-baked (per-user, potentially hundreds of MB — Steam's CDN, not our infra, is the right thing serving that traffic, and it's built for public fan-out at a much larger scale than we'd generate).
- **Low-priority cleanup, not scheduled**: [`metadata-refetch-no-circuit-breaker`](../tech-debt.md#id-metadata-refetch-no-circuit-breaker) — a known (not yet observed) infinite-retry path for locally-seeded cache entries missing genre/category data, surfaced while planning the taxonomy-data-event work; expected to mostly resolve itself once that plan's baked-bundle genre/category harvesting lands, revisit only if it doesn't.
- **Desktop offline-first refresh behavior** — see [Desktop Offline-First Plan](../plans/desktop-offline-first-plan.md): first real-library test surfaced an automatic online re-fetch firing for the local-scan channel (fixed this session, Round 1) plus a full scene reset it compounded on top of; a **second** test then corrected the diagnosis — the actual primary cause of the "~300 unnecessary Lambda calls, waiting before the rest of the library loads" complaint is `LocalSteamLibraryLoader` itself blocking its first render on a full network gap-fill (Round 1.5, now top priority, not yet fixed). "Upgrade not replace" refresh redesign (web + desktop) and routing desktop network calls through Tauri's Rust HTTP client remain scheduled after that. Also surfaces [`cors-blocked-local-scan-artwork`](../tech-debt.md#id-cors-blocked-local-scan-artwork) (next thing to fix, and per the second test session, likely conflated with plain 404s — see the plan doc's log-noise section) and [`lod-tier-reset-race-condition`](../tech-debt.md#id-lod-tier-reset-race-condition) (disposal-ordering race breaking every second-and-later launch with a persisted library; fix implemented 2026-07-14, real-relaunch manual verification still open).
- **Loading placeholder boxes** — idea captured, not designed: when a game box's slot is known but its artwork hasn't resolved yet (especially relevant now that artwork resolution can lag noticeably behind library load — see the offline-first plan above), drop in a cheap, generic "art incoming" placeholder (e.g. a simple spinner/shimmer) rather than leaving the slot blank, swapped for real artwork once it resolves. Deliberately **not** a full label-box render for every pending game — too resource-heavy to generate at that scale for what's meant to be a brief, generic placeholder. Natural tie-in to [Game Box Construction Chain](../features/game-box-construction-chain.md)'s staged pipeline (a placeholder could occupy the box between `ArtworkRenderRequested` and `ArtworkTextureResolved`) if/when that lands, but doesn't require it. Discuss and scope when picked up.

## Completion Criteria

- Client is publicly hosted at a stable HTTPS URL
- 800+ game libraries load reliably without rate limiting failures
- Graceful degradation when rate limits are hit
- Multi-layer caching prevents repeated origin hits
- Multiple users can use simultaneously without shared rate limit interference
- All core navigation accessible via keyboard without mouse dependency
- Full VR session works: navigation, game browsing, UI interaction in headset
- Sort mode change reorders game boxes and shelves in the scene

## Notes

- When actively working on a feature, check whether related items on the Encore list are plausibly quick. If so, pull them forward rather than leaving them for later — "while we're here" is the right time to try.
