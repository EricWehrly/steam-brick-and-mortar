# Release Pipeline

**Parent features**: [Static Hosting](../features/static-hosting.md) · [Native Desktop App](../features/desktop-app.md)
**Act**: 2
**Status**: 🟢 Steps 1-2 implemented and run end-to-end. `scripts/release.sh` (`fetch_s3_cache` → `scripts/repack-steam-cache.sh`) pulls 2790 raw S3 objects (9,006 KiB, independently gzipped) and repacks them into two client-ready bundles: `app-details-f2p.json.gz` (93 games, 207.5 KiB) and `app-details-rest.json.gz` (1268 games, 3.1 MiB) — combined ~3.3 MiB from ~9.0 MiB raw, via single-corpus compression + tier dedup. Client-side consumption (`BakedCacheLoader`) implemented and wired into `SteamApiClient`. Steps 3-5 (build/pack) still stubbed.

## Why this exists (the actual goal)

Not architecture tidiness — **traffic safety toward Steam**. Once we start showing this around in
Act 2, we do not want to blast Valve's servers with requests. Small chance that earns a warning;
nonzero chance it gets us shut down, which ends the project. So the release artifact should carry as
much data as it can *pre-fetched*, so a running instance hits Steam (via our Lambda) as little as
possible. The end state of "self-contained" is **works entirely offline if need be**. See
[Traffic Safety Review](traffic-safety-review.md) for the full risk framing.

## Nomenclature (this is the part that was muddy before)

Three distinct things — keep them separate:

| Term | What it means | Boundary |
|---|---|---|
| **build** | `yarn build` (web → `client/dist/`), `cargo tauri build` (desktop → installer) | Local. **Already fine** — no changes needed. |
| **release** | Assemble a self-contained, shippable artifact: fetch pre-baked data, build web, build desktop, pack it | Local, but produces the thing we hand out |
| **deploy / publish** | Push a release across the machine boundary — into public view (hosting the web build, distributing the installer) | Leaves our machine; "in the public eye" |

The rest of this doc is about **release**. Deploy/publish lives in
[`static-hosting.md`](../features/static-hosting.md).

## `release.sh`

Implemented at `scripts/release.sh` (Steps 1-2 are real; Steps 3-5 are stubbed, matching the shape below):

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. "Gimme" — grab the whole app-details cache the Lambda has already built in S3, into a
#    scratch dir OUTSIDE client/public/ (public/ should only ever hold what we actually serve).
#    Read-only. No infrastructure change. No Terraform. Just the AWS CLI.
aws s3 sync s3://steam-brick-and-mortar-dev-game-cache/ .release-cache/raw/ \
  --exclude "hydrator_state/*"

# 2. Repack: gunzip every per-appid object, merge into ONE JSON object keyed by appid
#    (hydrated tier wins over base tier per-appid), split into free-to-play vs. the rest,
#    gzip each ONCE. Single-corpus compression beats N independent per-file gzips — see
#    rationale below. Plain bash + jq + gzip, not a new language — see "Why bash, not
#    Node/TS" below.
scripts/repack-steam-cache.sh .release-cache/raw client/public/steam-cache

# 3. Build the web client — dist/ does NOT embed the cache (it's a public/ asset, fetched
#    async at runtime, not part of the JS bundle).
( cd client && yarn build )

# 4. Wrap dist/ into the desktop installer. The cache files ride along as bundled resources.
( cd desktop/tauri-app && cargo tauri build )

# 5. Pack a self-contained release.
zip -r release.zip \
  client/dist \
  desktop/tauri-app/target/release/bundle
```

(Steps 3-5 sketch — exact staging paths and zip contents still a detail to settle.)

### Why bash, not Node/TS, for the repack step

Considered and rejected a `.mjs` script: this project's JS/TS lives entirely in `client/` (proper
TypeScript, typed, tested); a lone `.mjs` build-tool file would be JS-that-looks-like-TS-but-isn't,
sitting outside that discipline, in a codebase that otherwise keeps a clean split (TypeScript for the
app, Bash for `scripts/`, Python for the Blender/extraction pipeline). That's real ongoing-maintenance
surface for something we're unlikely to touch again.

Bash + `jq` + `gzip`/`gunzip` needs no new tooling (`scripts/` is already 100% bash; `jq` and `gzip`
are already present) and turned out not to be awkward for this job: `jq`'s `+` operator does exactly
the shallow "right side wins per key" merge the two-tier precedence needs, `with_entries(select(...))`
does the free-to-play split in one line, and the whole thing is ~10 meaningful lines of jq. The one
real trap was performance: looping `gunzip`/`jq` once per file (2790 files) took over a minute and was
killed before finishing a test run. Batching via `find -name '*.json.gz' -print0 | xargs -0 gunzip -c`
(gunzip accepts multiple files, concatenating decompressed output) brought that down to ~4 seconds.
Lesson for whoever touches this next: never loop a subprocess per file at this scale in bash — batch it.

### The S3 cache grab, concretely
- **Bucket**: `steam-brick-and-mortar-dev-game-cache` (region `us-east-1`), confirmed in
  `external-tool/infrastructure/modules/s3-cache`. Hardcoded in `release.sh` is fine — we run a
  single `dev` environment for now and friends get served from it. A dedicated `prod` environment
  (and the bucket-name parameterization that implies) is explicitly an Act 3 concern, not something
  to build ahead of need.
- **Layout**: one gzipped-JSON object per appid under two prefixes —
  `appDetailsWithTags/{appid}.json.gz` (hydrated: appdetails + SteamSpy tags, preferred) and
  `appdetails/{appid}.json.gz` (base, fallback). See `lambda-src/services/cache.js`.
- **We grab everything.** No appid list, no "top-N", no curation. `aws s3 sync` pulls the lot.
- **Measured (2026-07-02)**: 2790 objects (`hydrator_state/lock.json` excluded — Lambda's own
  bookkeeping, not game data), 9,006 KiB compressed as independently-gzipped per-appid files.
  Confirmed via `scripts/release.sh`, already implemented and run.
- **Cost/maintenance**: read-only CLI, no deployed-infra change, no meaningful code maintenance on
  the acquisition side. This is deliberately the dumbest possible mechanism.

### Repack into one file — why this isn't premature optimization

2790 independently-gzipped files each pay their own gzip header/footer overhead, and — more
significantly — each file's compressor only sees *its own* content. Steam's app-details JSON is
heavily repetitive across games (`categories`, `genres`, `developers`, `publishers`, shared
category/genre ID vocab, `full_data` boilerplate), and that redundancy is invisible to gzip unless
the records are compressed **together**, in one pass, sharing one LZ77 window.

This is different in kind from the "top-N curation" idea we already rejected as premature: curation
required a judgment call about what to keep, gated on a measurement we didn't have yet. Recombine-
then-compress requires no judgment call — it's strictly smaller output for the same input, a
mechanical packaging improvement, not a product decision. So it happens now, unconditionally, as
part of `release.sh`, not as a "measure first, then maybe optimize" follow-up.

**Merge semantics**: the two S3 prefixes are a two-tier cache, not independent data — for any appid
present in both, `appDetailsWithTags/` (hydrated) wins over `appdetails/` (base), matching the
precedence `lambda-src/services/cache.js` already uses at read time. `scripts/repack-steam-cache.sh`
applies the same precedence (`jq -s '.[0] + .[1]'`, base then hydrated — shallow merge, right side
wins whole-value on key overlap), not a blind concatenation of both prefixes.

**Measured (2026-07-03)**: 9,006 KiB raw (2790 independently-gzipped objects, base + hydrated tiers,
with overlap) repacks to **207.5 KiB + 3.1 MiB ≈ 3.3 MiB** combined — well over 2x smaller, and that's
*with* the F2P/rest split (below) rather than one single file, which would compress somewhat better
still. The reduction comes from two effects at once: single-corpus compression (cross-record schema
redundancy gzip can now see) and tier dedup (an appid present in both tiers is stored once, not twice).

### Split: free-to-play vs. the rest, not one file

Beyond the single-file idea originally sketched here, the repack now produces **two** bundles:
`app-details-f2p.json.gz` (93 games, 207.5 KiB) and `app-details-rest.json.gz` (1268 games, 3.1 MiB).
This isn't a size-reduction curation — everything still ships, same as the "grab it all, no top-N"
decision above — it's a **load-priority split**. The anonymous store's fixture (`demo-games.ts`) is
exactly the free-to-play set, so the client can fetch the small F2P bundle first and populate the
anonymous store almost immediately, then fetch the larger "rest" bundle in the background without
blocking that first paint. `is_free` is already a field Steam returns per-game (`steam-api.js`
already lifts it to `data.is_free`), so the split needs no external appid list or manual curation —
it's a factual filter (`with_entries(select(.value.data.is_free == true))`) on data already in hand.

Each bundle is wrapped in a small envelope — `{ generated_at, games }` — rather than a bare
appid-keyed object, so there's room to add a cache-invalidation marker later (see "Cache-buster" in
[Multi-layer Caching](../features/multi-layer-caching.md)) without a breaking format change. We use
`generated_at` (a timestamp) rather than a "version" number — this is cache data with a natural
recency concept, not a schema/API version; a timestamp is the more honest label for what it is.

## The two real code touches

1. **The repack script** (`scripts/repack-steam-cache.sh`) — implemented. Bash + `jq` + `gzip`/
   `gunzip`; gunzip+merge each tier (hydrated-over-base precedence), split by `is_free`, gzip each
   bundle. See "Why bash, not Node/TS" above for why this isn't a `.mjs` file.
2. **Client-side consumption** (`client/src/steam/cache/BakedCacheLoader.ts`) — implemented, wired
   into `SteamApiClient`'s constructor alongside the existing `appDetailsCache.init()` fire-and-forget
   call (same non-blocking pattern already used there, so this doesn't introduce a new startup-timing
   contract). Behavior:
   - **Skip if already warm**: checks `AppDetailsCache.getStats().count > 0` first: if IndexedDB
     already has entries (returning user), skips the fetch entirely. This is a **coarse placeholder**,
     not real cache invalidation — it can't detect "the baked bundle changed since this IndexedDB was
     populated," only "IndexedDB currently has *something*." The real lever is the cache-buster work
     tracked in [Multi-layer Caching](../features/multi-layer-caching.md), explicitly not built yet.
   - **F2P tier first, rest second**: fetches and seeds `app-details-f2p.json.gz` before
     `app-details-rest.json.gz`, both awaited inside the loader but the loader itself is never awaited
     by its caller — so from the scene's perspective this all happens in the background regardless of
     which tier is "first."
   - **Decompression**: `response.body.pipeThrough(new DecompressionStream('gzip'))` — the actual
     `.gz` bytes are shipped and decoded client-side (Compression Streams API, supported in all
     evergreen browsers this project already targets for WebXR), rather than relying on HTTP
     content-encoding negotiation from a not-yet-decided host.
   - **Logging**: uses the project's `Logger` (`BakedCacheLoader` context) — `info` for the
     lifecycle events (found/skipped existing cache, seeded N games per tier), `debug` for the
     per-fetch play-by-play (which tier, which path, parsed counts). Enable during development with
     `setLogLevel('BakedCacheLoader', 'DEBUG')` in the browser console.
   - **Failure handling**: missing file (404), empty body, or parse failure all log a warning and
     return — no special-casing needed elsewhere, since this just falls through to the existing
     Lambda-batch-fetch behavior as if the bundle never existed.

## "Self-contained" — now vs. goal

- **Now**: a release still hits the Lambda/Steam at runtime for anything not in the baked cache
  (cache-miss appids, ownership if using the online path). It just does so *far less*.
- **Goal**: "self-contained" grows to mean fully offline-capable — the baked cache covers enrichment,
  a manually-imported/captured library covers ownership, CDN artwork is the remaining online pull
  (its own future thread, see Traffic Safety Review).

## Open questions
- Exact `release.zip` contents — desktop installer only, or installer + web `dist/` for publishing?
- Whether release re-runs the sync + repack every time or reuses a recent local pull (the sync is
  cheap; probably every time).
- The real cache-buster (dump-all-cache-layers lever) — tracked, not designed yet. See
  [Multi-layer Caching](../features/multi-layer-caching.md). Required before Act 3 public ship, not before.
- **Not a question for now**: dev/prod environment split. One `dev` environment serves Act 2 friends-testing fine; revisit only when Act 3 scaling/isolation actually demands it.

## Related
- [Traffic Safety Review](traffic-safety-review.md) — why we're doing this at all
- [Network Rate Limiting](../features/network-rate-limiting.md) — the "one bulk fetch beats N individual fetches" principle this repack step is a proof point of
- [Static Hosting](../features/static-hosting.md) — the deploy/publish half
- [Desktop App](../features/desktop-app.md) / [Tauri spike](desktop-tauri-spike-plan.md) — the desktop build wrapped by release
- [Multi-layer Caching](../features/multi-layer-caching.md) — the runtime cache the bake pre-warms

---
*— A1 / P1*
