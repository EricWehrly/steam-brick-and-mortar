# Automated Appdetails Bundle Lambda

**Parent**: [Release Pipeline](release-pipeline-plan.md) (the manual step this replaces/feeds) ·
[Traffic Safety Review](traffic-safety-review.md) (why the bundle exists at all) ·
[Multi-Layer Caching](../features/multi-layer-caching.md) (the cache-buster this bundle needs)
**Act**: 2/3 boundary — infra work, not gated on either act's feature list specifically
**Status**: 🔮 Proposed — not started

## Goal

Today, the S3-cache bundle (`app-details-f2p.json.gz` / `app-details-rest.json.gz`) that
`BakedCacheLoader` seeds on startup only gets assembled when someone manually runs `release.sh` —
a local, on-demand step (`aws s3 sync` of ~2790 individual objects, then a bash/jq repack). That
means the bundle is only as fresh as the last person who happened to cut a release. Replace the
manual step with a small Lambda that keeps a pre-assembled, publicly-servable bundle continuously
current, and change how clients get it: fetch one object from a cheap public URL instead of each
client (or each release) re-syncing thousands of individual S3 objects.

## Why now

Two motivations converged on this at once:
1. **[[library-game-appid-metadata-duplication]]-adjacent**: the sort/filter data-provenance pass
   (`docs/architecture/sort-filter-data-provenance.md`) confirmed SteamSpy tag/review-score data —
   the one dimension with no bulk alternative — arrives slowly and incrementally via the hydrator
   Lambda. A stale bundle means a released client is missing tag data for anything hydrated *after*
   that release was cut, with no way to know without re-running the whole release process.
2. **The manual repack step is real toil** for what's fundamentally a mechanical "gather + merge +
   compress" job the server already has all the ingredients for — `release-pipeline-plan.md` itself
   flags this as bash-only, not yet automated, Steps 3-5 still stubbed.

## Current state (confirmed by reading the actual source, not assumed)

- **Two Lambdas already exist**: `lambda` (`external-tool/infrastructure/lambda-src`, serves API
  Gateway requests, writes base `appdetails/{appid}.json.gz` on cache-miss) and `lambda_hydrator`
  (`external-tool/infrastructure/lambda-hydrator-src`, a **separate background batch job** that reads
  appids needing enrichment, fetches SteamSpy data at an enforced **1.1s delay per request**
  (`STEAMSPY_DELAY_MS`), and writes hydrated `appDetailsWithTags/{appid}.json.gz`). The hydrator
  already has its own singleton lock (`hydrator_state/lock.json`) and `BATCH_SIZE`-driven batching —
  it does **not** run per-individual-SteamSpy-call; it processes a batch, then finishes.
- **No scheduling/trigger infra exists yet** for the hydrator itself (no EventBridge rule found in
  `main.tf`) — it appears to run on-demand today, matching `steam-tag-pipeline.md`'s "active in
  separate branch, invest to try" framing.
- **S3 objects already carry the timestamp we need, for free**: every `PutObjectCommand` gets a
  server-side `LastModified` timestamp automatically — no code change to the hydrator required to
  get "when was this appid's hydrated data last written."
- **The repack logic already exists** (`scripts/repack-steam-cache.sh`) — bash + `jq`, gunzip-merge
  (hydrated-over-base precedence) + F2P/rest split + gzip. This plan's Lambda can reuse the same
  logic (ported to the Lambda's runtime, or literally shell out to the same jq pipeline if the
  Lambda environment supports it) rather than reinventing the merge semantics.

## Trigger design: two options, pick one

The user's framing was "debounce via `clearTimeout`/`setTimeout` whenever we facilitate a SteamSpy
call." That doesn't map directly onto Lambda's execution model — each invocation is a fresh,
stateless environment; timers don't survive across invocations. Two real options:

**Option A (recommended) — trigger at the end of a hydrator run, not per-appid.**
The hydrator already processes a *batch* under its own lock before finishing. That batch structure
already gives most of the debounce value for free — many appids get hydrated together, then one
signal fires, rather than one attempted rebuild per individual SteamSpy call (which would otherwise
need real debounce machinery to avoid triggering hundreds of times per batch). Concretely: the
hydrator's last step, after releasing its lock, does an async `InvokeCommand` (fire-and-forget) to
the new bundling Lambda, or — even more decoupled — writes a `bundle_state/rebuild_needed.json`
marker that a lightweight scheduled check picks up. This needs **zero new AWS infra primitives**,
just one more line in the hydrator's existing completion path.

**Option B — real debounce via a rescheduled EventBridge Scheduler target.**
If a trigger is wanted per-write (not just per-batch), EventBridge Scheduler supports creating a
one-time schedule and *replacing* it by reusing the same schedule name — creating a new one with an
updated fire time overwrites the pending one, which is the actual AWS-native equivalent of
`clearTimeout`/`setTimeout`. More moving parts (a new schedule resource, IAM for the hydrator to
manage it) for a debounce granularity Option A's batch structure likely makes unnecessary. Worth it
only if per-write freshness turns out to matter in practice.

**Recommendation**: build Option A first. It requires no new AWS primitives, and the hydrator's
existing batch-then-finish shape already provides the debounce window the user was reaching for.
Revisit Option B only if batches turn out to be too infrequent or too large for the freshness this
is meant to buy.

## Bundle freshness timestamp

Use S3's own `LastModified` on `appDetailsWithTags/` objects — `ListObjectsV2` (or, cheaper,
tracked incrementally by the hydrator itself in a small state object it already maintains via
`hydrator_state/`) gives the max `LastModified` across all hydrated objects without touching the
hydrator's write path. The bundle's own `generated_at` envelope field (already part of the format
per `release-pipeline-plan.md`) becomes **"the newest hydrated appid's write time," not "when this
Lambda happened to run"** — a more honest freshness signal, and the natural key for a future
cache-buster (`multi-layer-caching.md`'s tracked, not-yet-built lever) to compare against.

## Where to serve it from — storage/cost research

The bundling Lambda's job ends at producing the `.json.gz` object(s) in S3. Serving them cheaply at
volume is a separate question, and the answer is likely **already decided elsewhere in this
project, not a new research thread**:

- `docs/acts/act2-ready-for-friends.md`'s Gate 1 already names **CloudFront as the likely choice**
  for static hosting the app itself. A small, infrequently-changing `.json.gz` object is exactly
  the workload CloudFront-in-front-of-S3 is built for — cache-hit responses cost fractions of a
  cent per 10k requests with **zero compute per request** once cached, which is categorically
  cheaper than invoking a Lambda (or even hitting API Gateway) per client. This is the same
  "CDN, not compute, for anything static and shared" principle `traffic-safety-review.md` already
  applies to Steam's own artwork CDN.
- **Recommendation**: don't stand up separate infra for this. Put the bundle objects in the same S3
  bucket (or a public-read sibling bucket, to avoid loosening ACLs on the cache-data bucket the
  Lambdas read/write) behind the **same CloudFront distribution** static hosting is already getting.
  One more cached path on infra that's being built anyway, not a new cost center.
- A real dollar-figure comparison (S3+CloudFront vs. alternatives) wasn't done here — the existing
  project direction already points at CloudFront for materially the same reason this bundle wants,
  so a from-scratch storage-provider bake-off would be re-deriving a decision this project has
  effectively already made. Worth a quick sanity-check of actual request-volume pricing if/when this
  gets built, not a research phase of its own.
- **Public bucket access implication**: today's cache bucket presumably isn't public. Serving the
  bundle via a public S3/CloudFront URL means either (a) a dedicated public-read bucket the bundling
  Lambda writes its output to (keeping the raw per-appid cache bucket private), or (b) a narrowly-
  scoped public path/policy on the existing bucket. (a) is cleaner and avoids any risk of the raw
  per-appid objects becoming accidentally public — recommended.

## What this changes downstream

- **`release.sh`'s Step 1 (`aws s3 sync` of ~2790 objects) can likely be replaced** with a single
  `curl`/fetch of the pre-assembled bundle from its public URL — dramatically simpler and faster
  than syncing and repacking thousands of individual objects locally every release. Step 2's repack
  script becomes unnecessary for the *release* path specifically (the Lambda already produces the
  same output continuously) — though keeping it around for local dev / disaster-recovery re-derivation
  is cheap insurance, not a reason to delete it.
- **`BakedCacheLoader` itself doesn't need to change** — it already fetches
  `/steam-cache/app-details-*.json.gz` as a relative path bundled with the client. Whether that file
  got there via `release.sh`'s local repack or was pulled from the public bundle URL at build/release
  time is invisible to the client-side loader.
- Opens the door to **runtime bundle refresh** (not just release-time baking) — an already-running
  client could periodically check the public bundle's `generated_at` against what it has and pull a
  delta or full refresh, which is exactly the kind of lever `multi-layer-caching.md`'s tracked
  cache-buster item wants. Not scoped here, just noted as a natural follow-on once the bundle is
  continuously fresh instead of release-pinned.

## Open questions

- Does the bundling Lambda re-run the full repack every time (simple, correct, costs a few seconds
  of compute per batch) or maintain the merged bundle incrementally (faster, more state to get
  wrong)? Recommend starting with full-repack-every-time — `repack-steam-cache.sh` already proved
  this is a ~4-second job at 2790 objects when batched correctly; premature incrementalism here
  mirrors the "top-N curation" idea `release-pipeline-plan.md` already rejected for the same reason.
- Exact IAM/bucket-separation shape for the public-read output bucket — a detail to settle during
  implementation, not a design fork.
- Whether the F2P/rest split stays as two objects or becomes more granular now that serving cost is
  ~free either way (splitting was originally about load-priority for the client, not size) — probably
  unchanged, revisit only if a concrete reason appears.

## Non-goals

- Building Option B (real per-write debounce) unless Option A proves insufficient in practice.
- A from-scratch cloud storage-provider cost comparison — see "Where to serve it from" above for why
  that's treated as already-decided by the existing CloudFront direction.
- Any change to the hydrator's SteamSpy-fetching logic or rate limiting itself — this plan is about
  what happens *after* data lands in S3, not how it gets there.

## Related
- [Release Pipeline](release-pipeline-plan.md) — the manual process this automates
- [Traffic Safety Review](traffic-safety-review.md) — why a fresh bundle matters
- [Multi-Layer Caching](../features/multi-layer-caching.md) — the cache-buster this bundle's
  freshness timestamp feeds
- [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md) — why SteamSpy
  freshness specifically matters more than other fields
- [Steam Tag Pipeline](../features/steam-tag-pipeline.md) — the hydrator feature this plugs into
- `external-tool/infrastructure/lambda-hydrator-src/index.js` — the batch job this triggers off of
- `scripts/repack-steam-cache.sh` — the merge logic to reuse or port
