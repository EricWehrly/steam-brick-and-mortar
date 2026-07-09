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

### Confirmed: app-details batching is already at Steam's hard ceiling (2026-07-02)

Verified against the actual implementation, not assumed:

- **Steam's `appdetails` endpoint does not accept multiple appids per call.** `external-tool/infrastructure/lambda-src/services/steam-api.js:42` calls `store.steampowered.com/api/appdetails` with a single `numericAppid` — there is no array/batch mode to "wire in." This is an external constraint, not an implementation gap.
- What **is** already built, and is the practical ceiling on our side:
  - **Client → Lambda**: `BatchAppDetailsClient.fetchBatch()` batches up to 100 appids per HTTP call to our `/batch-appdetails` endpoint (comma-separated).
  - **Lambda internal**: `handleBatchAppDetails()` checks S3 cache for the **entire batch in parallel** (Phase 1), then only rate-limits the genuine cache **misses** through Steam (Phase 2) — one Steam call per miss, capped at 5 concurrent / 200ms spacing (`RateLimiter(5, 200)` in `steam-api.js:8`).
- **Consequence**: the number of calls we make to Steam for enrichment is bounded by *cache miss count*, not by how we batch requests — batching the request shape can't reduce it further. The two remaining levers are (1) **raising the cache hit rate** — which is exactly what the [release-pipeline S3 cache bake](../plans/release-pipeline-plan.md) does, by shipping the entire existing cache with every release — and (2) **substituting bulk-friendly alternate sources** (e.g. SteamSpy, which does support bulk retrieval) for fields we don't strictly need from Steam's own `appdetails`, an open research question, not yet scoped.
- This finding also resolves Story 5.4.1's "identify batching opportunities" for the *appdetails* endpoint specifically — nothing more to batch there. The audit itself (`docs/network-traffic-audit.md`) still hasn't been produced, and should still happen — see the Act 3 story below for the scaled-up version of that work.

### Principle: one bulk transfer beats N individual ones

Worth stating explicitly, because it now generalizes across several threads in this project:
fetching 800 appids as **one** request/transfer is cheaper for everyone than fetching one appid 800
times — fewer round trips, fewer TCP/TLS handshakes, and (for anything JSON-shaped) dramatically
better compression, since a compressor sees cross-record redundancy only when records are compressed
together. This isn't specific to Steam's API — it applies to how *we* serve data to *our own*
clients too.

**Concrete proof point**: the [release-pipeline](../plans/release-pipeline-plan.md) cache repack —
2790 independently-gzipped per-appid S3 objects get merged into one JSON corpus and gzipped once
before being shipped to the client, instead of shipping (or worse, re-fetching) them individually.
Same principle, applied to our own release artifact rather than to a live API.

**Forward-looking generalization**: the Act 3 story below extends this from "our release bundle" to
"live traffic at public scale" — coalescing concurrent requests for the same still-uncached appid
into one Steam call is the same principle applied to concurrent users instead of concurrent files.

### Act 3 revisit (tracked)

Story 5.4.1 was written and scoped for Act 2 (friends/family scale) and was never executed. Before Act 3 opens to the public, this needs a proper revisit at public scale — see **Story 9.2.1.4** in [Production Infrastructure](production-infrastructure.md) and the [Act 3 roadmap entry](../acts/act3-ready-for-everyone.md). This doc remains the authoritative source for what's already measured/implemented on the outbound-traffic side; the Act 3 story is the "measure it again at 100x the users" pass, plus building the fresh-data batching step (queuing/coalescing concurrent user requests for the same still-uncached appid) that only matters once request volume is high enough for that collision to occur.
