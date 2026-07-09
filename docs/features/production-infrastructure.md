# Feature: Production Infrastructure

**Act**: 3
**Status**: Not Started
**Priority**: High

## Goal

Scale and harden the AWS infrastructure for public traffic — auto-scaling, security hardening, DDoS protection, cost management, and operational readiness.

## Context

Act 2 infrastructure handles multi-user scenarios at small scale (friends/family). Act 3 requires readiness for arbitrary public traffic: auto-scaling Lambda, CloudFront optimization, DDoS protection, cost monitoring, and a full operational support layer (monitoring, alerting, incident response, user support). Without this, a public launch risks abuse, runaway costs, and undetected outages.

## Acceptance Criteria

- Lambda auto-scaling handles public traffic spikes
- CloudFront CDN optimized for global delivery
- DDoS protection and abuse prevention in place
- API key management and per-client rate limiting implemented (building on Act 2 planning)
- AWS cost monitoring and alerting active
- Comprehensive security audit completed; all public-facing endpoints hardened
- Encryption at rest and in transit for all user data
- 24/7 uptime monitoring and alerting
- Incident response procedures documented and tested
- Service status page available
- User support infrastructure (ticketing/FAQ) in place
- Release management process (staged rollout, canary, rollback procedures) defined

## Stories / Tasks

- **9.2.1** Traffic scaling — Lambda auto-scaling, CloudFront optimization, load balancing, geographic distribution
- **9.2.1.2** Abuse prevention — rate limiting at infrastructure level, DDoS protection, API key management
- **9.2.1.4** Outbound Steam-traffic audit (early Act 3) — re-run the network traffic audit from [Network Rate Limiting](network-rate-limiting.md) (Story 5.4.1, never executed) at public scale rather than friends/family scale. Covers: current per-endpoint call volumes (ownership, app-details enrichment, CDN artwork — see [Traffic Safety Review](../plans/traffic-safety-review.md) for the Act 2 baseline), plus a **fresh-data batching/coalescing step** — when concurrent public users request the same still-uncached appid, collapse those into one in-flight Steam call rather than N. This coalescing problem doesn't exist at Act 2 scale (collisions are rare with a handful of testers) and only becomes worth building once request volume is high enough to make it likely. Motivation: minimize the chance of Valve rate-limiting or shutting down the integration once traffic is public and not solely from machines we control.
- **9.2.1.3** Cost management — AWS cost monitoring/alerting, resource optimization, usage limits
- **9.2.2** Security hardening — security audit, input validation, auth hardening, encryption, credential rotation, incident response
- **9.3.1** Service management — uptime monitoring, performance SLA tracking, error tracking, status page, user support ticketing
- **9.3.1.3** Release management — CI/CD pipelines, staged rollout, canary deployments, rollback procedures

## Notes / Open Questions

- Lambda-side rate limiting was planned in Act 2 (Feature 5.4.3) — implementation lands here.
- SOC 2 compliance is optional; assess based on user expectations and legal advice.
- Analytics and business intelligence (Story 9.3.2) is deferred to Act 4 unless needed for cost management.
