# Act 2: "Ready for Friends"

## Overview

**Goal**: Works for people standing next to you during conversation.

**Scope**: Infrastructure hardening, multi-user capability, and VR support. Desktop/flatscreen is the initial delivery target; VR is a required Act 2 deliverable but intentionally sequenced late — after infrastructure stability and initial friend playtesting.

**Entry Criteria**: Act 1 complete — all imagined functionality demonstrated with personal demo capability.

**Key requirements**: Handle 800+ game libraries efficiently, AWS Lambda rate limit mitigation, comprehensive caching, error recovery, multi-user capability, full VR support.

---

## Gate 1: Ready to Start Sharing

> Features that need to be solid before we hand this to anyone. Bugs here are embarrassing. Scope creep here is a trap.

- [Static Hosting](../features/static-hosting.md) — public HTTPS URL, repeatable deploy, CORS wired to Lambda; **the** prerequisite for sharing anything; CloudFront is the likely choice (cost projection discussion to happen early Act 2)
- [First Load Experience](../features/first-load-experience.md) — anonymous store is coherent and inviting; new user is guided to connect their library; performance on first load is acceptable; definition of "correct" pinned before sign-off
- [Network Rate Limiting](../features/network-rate-limiting.md) — client-side rate limiter, batched artwork loading, Lambda hardening; must land before any multi-user testing
- [Multi-Layer Caching](../features/multi-layer-caching.md) — browser layer exists; Lambda + CloudFront + S3 layers needed before multi-user
- [Input System](../features/input-system.md) — mouse/keyboard solid, gamepad support, keyboard accessibility for all menus; VR controllers are Gate 2

## Gate 2: Act 2 Complete

> Features that must land before Act 2 is done. VR support lives here — it's a delivery goal, not a stretch goal.

- [VR Support](../features/vr-support.md) — full WebXR implementation; the whole store works in headset; this is the "impressor" that defines Act 2 done
- [GameSort Full Pipeline](../features/gamesort-full-pipeline.md) — re-sort reorders game boxes and shelves in the scene, not just signs; sub-feature of the tag-sorting north star

## Also In Act 2 (Best Effort)

> Real work we intend to make a serious attempt at. Not blockers. We punt when stuck.

- [Steam Tag Pipeline](../features/steam-tag-pipeline.md) — SteamSpy tags via background Lambda + S3 snapshot; active in separate branch; feeds tag-sorting north star
- [Local File Investigation](../features/local-file-investigation.md) — user categories from Steam local files; complementary to SteamSpy tags; non-tentpole
- [Layout Variations](../features/layout-variations.md) — arc layout exists; square rows + dynamic switching + grouping parameter are the remaining work
- [Lighting and Atmosphere](../features/lighting-and-atmosphere.md) — tone presets (corporate → dank), dongle switch panel; core lighting is done, this is the experiential layer
- [Procedural Texture Quality Pass](../features/procedural-texture-quality.md) — MDF veneer, popcorn ceiling, wood plank walls, carpet; carried from Act 1
- [UI Standardization](../features/ui-standardization.md) — in-scene omnibar, 3D sign elements, component tokens (started in intermission, may extend into Act 2)
- Enhanced error handling — robust recovery for rate limits, invalid Steam IDs, timeouts, partial failures
- Infrastructure monitoring — CloudWatch metrics, client telemetry, cache performance dashboards
- ~~Test network isolation~~ — automatic blocking of external calls in tests is **done** (implemented via global fetch intercept in unit/integration test setup)

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
