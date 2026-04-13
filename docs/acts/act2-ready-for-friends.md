# Act 2: "Ready for Friends"

## Overview

**Goal**: Works for people standing next to you during conversation.

**Scope**: Infrastructure hardening and multi-user capability. Desktop/flatscreen-first — VR work is gated to low-risk spikes only until core stability milestones land.

**Entry Criteria**: Act 1 complete — all imagined functionality demonstrated with personal demo capability.

**Key requirements**: Handle 800+ game libraries efficiently, AWS Lambda rate limit mitigation, comprehensive caching, error recovery, multi-user testing capability.

## Features

**Intermission (in progress — see `docs/roadmaps/intermission-before-phase2.md`):**
- [Key Metrics Instrumentation](../features/key-metrics-instrumentation.md) — frame time, memory, hitch detection, Playwright perf reports
- [Background Resource Reduction](../features/background-resource-reduction.md) — Page Visibility API, LOD disable on blur, frame throttle
- [UI Standardization](../features/ui-standardization.md) — design tokens, component library, VR-ready architecture

**Core Act 2:**
- [Network Rate Limiting](../features/network-rate-limiting.md) — client-side rate limiter, batched artwork loading, Lambda hardening
- [Multi-Layer Caching](../features/multi-layer-caching.md) — browser + Lambda + CloudFront + S3 caching infrastructure
- [Input System](../features/input-system.md) — mouse/keyboard, gamepad, VR controller abstraction layer
- [GameSort Full Pipeline](../features/gamesort-full-pipeline.md) — re-sort reorders game boxes and shelves, not just signs

## Completion Criteria

- Can handle 800+ game libraries without rate limiting issues
- Graceful degradation when rate limits are hit
- Multi-layer caching prevents origin server overload
- Comprehensive error handling and recovery
- Multiple users can use system simultaneously without shared rate limiting
- Comprehensive input support (mouse/keyboard, gamepad, VR)
- System works reliably for multiple concurrent users with large Steam libraries
