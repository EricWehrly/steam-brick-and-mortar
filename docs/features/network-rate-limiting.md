# Feature: Network Rate Limiting

**Act**: 2 (Gate 1)
**Status**: Substantially Implemented (client + server rate limiting exist; explicit client-side 429 handling and concurrency cap are gaps)
**Priority**: High

## Goal

Prevent Steam CDN and API rate limit exhaustion before any multi-user testing occurs.

## Context

Current network behavior is acceptable for solo testing but unsafe for multi-user. A single 800-game library requires 800×3 requests ÷ 20 req/min = 120+ minutes without caching. Batched loading, request queuing, and exponential backoff are all absent. This is a late Act 2 blocker — must land before friends/family sign-off.

## Acceptance Criteria

- No more than 50 concurrent CDN requests at any time
- Steam Store API respects ~200 req/5 min limit
- Exponential backoff on 429 responses
- Large libraries (800+ games) load reliably over 40+ minute periods
- Request priority system (visible games first)
- Lambda side has a documented rate limiting plan ready for implementation

## Stories / Tasks

- **5.4.1** Network traffic audit — document every endpoint, measure volumes, identify batching opportunities → produce `docs/network-traffic-audit.md`
- **5.4.2** Client-side rate limiter — `RateLimiter` utility, batched artwork loading (chunks of ~10), cancellable batches, progress reporting
- **5.4.3** Lambda rate limiting — planning only this act; document AWS API Gateway / WAF options → produce `docs/lambda-rate-limiting-plan.md`
- **5.4.4** Steam API hardening — exponential backoff with jitter, circuit breaker, intelligent queuing

## Notes / Open Questions

- Lambda IP pool sharing risk — AWS Lambda IPs are shared; rate limits could be hit by other users of the same pool. Research NAT Gateway options.
- Active implementation deferred until after Milestones 7/8 (input/UX stabilization).
- Related plan: `docs/plans/network-fetch-optimization-plan.md` — phased approach; Phase 1 (cached/uncached separation) done; Phases 2–4 (bad-game tracking, metadata backfill, retry/backoff) are future work.
