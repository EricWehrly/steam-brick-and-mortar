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
