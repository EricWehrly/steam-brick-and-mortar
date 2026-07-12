# Act 3: "Ready for Everyone"

## Overview

**Goal**: Public release readiness — compliance, legal, and production scalability.

**Scope**: Steam API compliance, privacy/legal, production infrastructure scaling, public traffic abuse mitigation.

**Entry Criteria**: Act 2 complete — system works reliably for multiple concurrent users with production-level infrastructure.

## Features

- [Neon Sign Stroke-Skeleton Rendering](../features/neon-sign-stroke-skeleton.md) — medial axis tracing, real neon tube geometry
- [Steam API Compliance](../features/steam-api-compliance.md) — ToS research, compliance checklist, attribution requirements
- [Legal / Privacy Compliance](../features/legal-privacy-compliance.md) — privacy policy, user consent, GDPR/CCPA
- [Production Infrastructure](../features/production-infrastructure.md) — auto-scaling, security hardening, DDoS protection, ops readiness

## Also In Act 3 (Best Effort)

- **Neon sign "&" 3D tube follow-through (early Act 3, nice-to-have)** — take the existing spike (`openclaw/spike-neon-sign-agent`, commit `d1ced42`) through human visual review and only then decide on production placement/scale/material tuning.
- **Offline access / bookmarklet export-format research (Act 3)** — define a static export format for offline/bookmarklet flows (circumventing Lambda where appropriate), then align `client/src/steam/fixtures/demo-games.ts` fixture shape to that export contract. Superseded by real implementation: see [Manual Library Export](../archive/manual-library-export-feasibility.md).
- **Outbound Steam-traffic audit, early Act 3 (tracked)** — before opening to the public, re-run the network traffic audit at public scale and add a fresh-data batching/coalescing step for concurrent cache-miss collisions. Full story: [Production Infrastructure §9.2.1.4](../features/production-infrastructure.md). Context/baseline: [Network Rate Limiting](../features/network-rate-limiting.md), [Traffic Safety Review](../plans/traffic-safety-review.md).
- **Overhead row-hanging signage pass** — replace current in-store signs with hanging overhead signs between rows to improve navigability. Target double-sided sign faces and include a color swatch system (N colors, or at least two alternating colors) that matches shelving unit colors on the ground; likely needs shader updates to support driven sign/swatch color values. Include a coordinated sign shadow-tuning pass (canvas, block letters, neon tubes) as intended feature completion work.
- **Front glass wall door interaction** — add a visible front-door handle on the glass wall; selecting the handle prompts a confirm dialog ("Are you sure?") and closes the store tab/window on confirmation.
- **"Liminal" long-row rendering (sliding window / treadmill shelves)** — use a configurable per-row shelf window with bounds `0..(totalShelves - windowSize)`, smooth continuous movement with hysteresis, and no treadmill when `totalShelves <= windowSize`. Initial version should not render/permit interaction outside the active window (nice-to-haves like impostors can come later). Keep window logic separate from rendering, emit typed movement/shift events for animation/effects, persist per-row window state in-session, and keep non-adjacent rows statically parked while only relevant/adjacent rows treadmill as the player moves along the row aisle. Prefer shifting shelves along the row axis (geometry recycling) rather than moving player state.

## Completion Criteria

- Complete privacy policy and user consent management
- Steam API terms of service compliance
- Content licensing and attribution compliance
- Auto-scaling infrastructure for public traffic
- Comprehensive security hardening and DDoS protection
- 24/7 monitoring, alerting, and incident response
- User support infrastructure and documentation
- Production service ready for public launch

## TODOs To Pull Into Act 3

- Validate settings import/export manually end-to-end in the pause menu (export file, inspect, modify valid fields, re-import, verify applied settings).
- Add integration tests that cover settings import/export with real generated JSON fixtures (valid payload, invalid payload, partial payload, and backwards-compatible payload).
- Keep generated JSON fixtures in test resources and assert round-trip behavior (export -> import -> equivalent settings snapshot).
- Add `Display > UI` subtab with a `UI Scale` slider (implementation deferred from intermission UI normalization work); finalize scope for adjacent UI-only controls in the same panel.
