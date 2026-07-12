# Feature: Multi-Layer Caching

**Act**: 2 (Gate 1)
**Status**: In Progress (browser/IndexedDB layer + Lambda L1 in-memory + Lambda L2/S3 all exist; CloudFront layer is the remaining gap; AppDetailsCache has no TTL; no in-flight request deduplication)
**Priority**: High

## Goal

Implement a multi-layer caching system (browser → Lambda → CloudFront → S3) so origin servers are never hammered by repeated artwork or API requests.

## Context

Without caching, every session re-fetches all artwork and metadata. At 800+ games this is both slow and abusive to Steam CDN. Caching must cover browser storage, Lambda function caching, CDN delivery, and S3 backing — with a clean abstraction layer so backends can be swapped. This pairs with rate limiting as the "must land before friends" infrastructure pair.

## Acceptance Criteria

- Browser-level caching (localStorage/IndexedDB) for artwork and metadata
- Lambda-level caching to avoid redundant upstream calls
- CloudFront CDN integration for artwork delivery
- S3 backing store for cached artwork assets
- Cache invalidation and refresh strategy documented and implemented
- Cache hit/miss ratios measurable
- Can handle traffic waves of 500+ concurrent users with minimal origin requests

## Stories / Tasks

- **5.5.1** Infrastructure analysis — evaluate CloudFront, Redis/ElastiCache, S3; compare cloud vs. self-hosted options → produce `docs/infrastructure-caching-strategy.md`
- **5.5.2** Design unified caching architecture — abstraction layer, invalidation strategy, offline-first approach, cache warming plan; research Steam CDN usage policies
- **5.5.3** Implementation — browser layer, Lambda layer, CloudFront + S3 integration, cache warming, background preload

## Notes / Open Questions

- Steam CDN usage policies need explicit research — check for domain restrictions or API key requirements before building around it.
- Self-hosted fallback (Docker-based local cache) is worth designing even if not the default path.
- Related: `docs/archive/texture-cache-refactor-plan-COMPLETED.md` — the redundant blob cache (`ImageManager`) is eliminated, MED texture caching in `PixelDataCache` is unified with HIGH via resolution-qualified keys. See `docs/architecture/image-texture-pipeline.md` for the current architecture.

### Cache-buster — tracked, required before Act 3 public ship

A new cache layer landed as part of the [release pipeline](../plans/release-pipeline-plan.md): a
static baked bundle (`client/public/steam-cache/*.json.gz`) seeded into `AppDetailsCache`
(IndexedDB) at startup via `BakedCacheLoader`. That loader's "skip if IndexedDB already has entries"
check is deliberately coarse — it can tell "something is cached" but not "the baked bundle changed
since this was cached," so a schema change or a bad bake can't currently force a re-seed for existing
users.

There's a partial building block already in place: `AppDetailsCache.CURRENT_SCHEMA_VERSION` marks
individual entries stale when the schema changes, forcing a refetch of *those* entries. What's
missing is the layer above it — one lever that can invalidate **all** cache layers at once (baked
bundle + IndexedDB + Lambda's S3 cache) when we decide a rebuild is needed, rather than relying on
each layer's own local staleness logic. Not needed for Act 2 friends-testing. **Required before Act 3
opens to the public** — without it, a bad bake or a restructuring decision made after shipping means
every existing client silently keeps stale data with no way to force a refresh, which is exactly the
kind of thing that turns into unnecessary repeat traffic against Steam (see
[Traffic Safety Review](../plans/traffic-safety-review.md)).
