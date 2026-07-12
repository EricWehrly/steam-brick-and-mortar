# Traffic Safety Review — Not Blowing Up Valve

**Act**: 2 (gates how safely we can show this to people)
**Status**: 🟢 Review — reframes the earlier "Lambda-independence" thread around its real purpose. Synthesis of the manual-export, S3-cache-bake, desktop-capture, and disk-identity work.

## The real north star

The point of all this is **being able to hand the app to other people without generating dangerous
request volume against Steam.** When we start showing it around in Act 2:

- There's a **small chance** hammering Steam earns a warning-level response.
- There's a **nonzero chance** Valve just shuts us down — and then it's over. A lot of wasted work.

So the goal is conservative-by-default: a running instance should touch Steam as little as possible.

**Important reframe:** the Lambda is not the thing we're trying to escape for its own sake. The Lambda
is a proxy *in front of Steam* — it can be scaled to absorb our own traffic fine. Reducing Lambda
traffic matters **because every Lambda cache-miss becomes a request to Steam.** The target is
Steam-bound request volume; the Lambda is just where we measure and control it.

## What actually generates Steam-bound traffic

Three sources, in rough order of how much we've addressed them:

1. **Ownership list** — Lambda → Steam (`GetOwnedGames` / profile). One request per library load.
2. **App-details enrichment** — Lambda → Steam's own `appdetails` (genres, categories, developers,
   publishers). One request per *new* appid; already **cached in S3** so it's paid once ever, not
   per user. **First-party, no meaningful per-caller rate limit found.**
3. **Community-tag enrichment** — Lambda's *hydrator* → **SteamSpy** (`steamspy_tags`, review score).
   Also cached in S3 once fetched, but the fetch itself is bottlenecked: SteamSpy enforces **~1
   request/second, no bulk endpoint** (`STEAMSPY_DELAY_MS = 1100` in
   `lambda-hydrator-src/index.js`, confirmed live with 429 + backoff handling). **This is a different
   kind of constraint than 1–2 and needs its own treatment — see below.**
4. **Artwork images** — client → **Steam's CDN directly**, per appid, per box shown. Not proxied,
   not cached by us. **The next front** (see below) — likely the largest volume of all.

## How each channel reduces Steam traffic

| Traffic source | Reduction mechanism | Residual Steam traffic |
|---|---|---|
| Ownership list | **Manual export** (web bookmarklet) / **injected-webview capture** (desktop) — the user's own browser reads their own library; our infra never asks Steam | **Zero** for imported libraries. Online profile path still costs one Steam call per load |
| Appdetails enrichment | **Bake the whole S3 cache into the release** (`aws s3 sync`, see [Release Pipeline](release-pipeline-plan.md)). A shipped instance already holds everything the Lambda has ever cached | Only genuine **cache-misses** (appids never seen before) reach Steam. On **desktop**, even those can go via Rust (CORS-free direct fetch) without the Lambda. Note: Steam's `appdetails` endpoint has no batch/array mode (confirmed in `steam-api.js`) — cache hit rate is the only lever on miss volume, not request batching. See [Network Rate Limiting](../features/network-rate-limiting.md) for the full finding |
| Community-tag enrichment (SteamSpy) | Same bake covers whatever the hydrator has already fetched. **Cache-misses on desktop also get a Rust-native shortcut** (see [Rust CORS/Lambda Bypass Spike](rust-cors-bypass-spike.md)) — the constraint isn't politeness toward SteamSpy, it's the ~1s/appid pacing itself, see below | Bake-hit appids: zero. Miss appids: on desktop, fetched directly (slowly); on web, stays on the Lambda hydrator path. Either way, **latency**, not traffic volume, is the open problem — see "Why the SteamSpy problem isn't about traffic" below |
| Artwork (CDN) | **Researched (2026-07-09), both plans built.** [Texture Cache Refactor](../archive/texture-cache-refactor-plan-COMPLETED.md) (Plan 1, fixes double-fetch + adds MID caching) is done. [F2P Artwork Bake](f2p-artwork-bake-plan.md) (Plan 2) is done — see below for why the connected-library "rest" case doesn't get the same treatment | F2P set: **zero**, built 2026-07-11. Connected libraries: unchanged — see verdict below |

## The baked cache changes the enrichment picture a lot

Because the bake grabs the *entire* S3 cache — not a curated slice — a released instance starts life
knowing every appid the Lambda has already hydrated. Runtime enrichment then hits Steam **only** for
appids that are new to the whole system. As the cache grows across releases, that miss rate trends
toward zero for the popular long tail. That's the strong version of the traffic-safety win, and it
costs us one `aws s3 sync` and a small client-seeding change.

## Why the SteamSpy problem isn't about traffic (correction to an earlier version of this doc)

An earlier version of this section argued desktop clients shouldn't call SteamSpy directly because
many independent clients would create dangerous aggregate load against a third party. **That
reasoning is dropped** — there's no strong basis to think SteamSpy would recognize or throttle a
distributed-client pattern differently than it already tolerates, and calling SteamSpy from the
desktop client (via the Rust CORS-bypass path) is in scope and wanted, same as `appdetails`.

**The real problem is latency and UX, not politeness toward SteamSpy.** It enforces roughly ~1
request/second with **no bulk endpoint** (`STEAMSPY_DELAY_MS = 1100` in
`lambda-hydrator-src/index.js`, confirmed live with 429 + backoff handling). For a library of a few
hundred games, that's several minutes of sequential fetching before tags are available —
`steam-tag-pipeline.md` already clocked "13+ minutes for 800 games." That's a shaky foundation for
sort/filter functionality regardless of which layer (Lambda hydrator or Rust desktop client) is doing
the fetching — the constraint is inherent to SteamSpy's API shape, not to who's calling it.

**This is being worked on multiple parallel fronts** (bulk-snapshot bundle, progressive fade-in as
coverage grows, a renewed bulk-alternative search, checking whether Steam's own store pages embed
tags client-side, and — considered the best bet — local Steam-install data mining on desktop). Full
detail lives in the [Rust CORS/Lambda Bypass Spike — "The SteamSpy latency problem"](rust-cors-bypass-spike.md#the-steamspy-latency-problem-parallel-tracks-not-blocking-this-spike)
rather than duplicated here. See also [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md)
for the data-availability framing and [`steamspy-bulk-alternatives-research-prompt.md`](../research/steamspy-bulk-alternatives-research-prompt.md)
for the renewed bulk-alternative search.

## Verdict by run mode (framed as Steam traffic)

- **Web, anonymous store**: hits Steam **zero times**, as of [F2P Artwork Bake](f2p-artwork-bake-plan.md)
  (built 2026-07-11) — static fixture + baked enrichment + baked artwork. The cleanest win, and the only
  run mode where artwork can realistically reach zero, since the F2P set is small and shared across every visitor.
- **Web, connected via import**: **zero** ownership traffic; enrichment traffic only on cache-miss
  appids; artwork still pulls from the CDN — **and stays that way**, deliberately (see below).
- **Web, connected via online profile**: one ownership call + miss-only enrichment. Still far lighter
  than today, but not zero.
- **Desktop**: can reach **zero Lambda / near-zero Steam for ownership, appdetails, and SteamSpy
  enrichment** — Rust handles all three without our backend. SteamSpy's contribution is still gated
  by its own ~1s/appid pacing regardless of channel, which is a latency problem to solve on its own
  parallel tracks (see above), not a reason to keep the fetch server-side. Artwork is unaffected by
  the desktop vehicle either way (still a direct CDN pull, same as web); Pillar-2 native routes are
  **not built yet**.

## Next front: the CDN images — researched, both plans built

Findings from a live pass against Steam's CDN (2026-07-09):

- **Only one image is actually fetched per game** by the render pipeline — `library_600x900.jpg`
  (~55 KB), downscaled locally into both MID/HIGH textures. The `artwork.icon`/`.logo`/`.header` fields
  on `SteamGame` are unused outside a debug tool — contrary to an earlier assumption of ~4 images/game.
- **Steam's CDN is a fundamentally different risk category than the Web API**: public,
  `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=604800` (7 days; icons: 10 years).
  This is a CDN built for public embedding, not a rate-limited surface — the "Valve might ban us"
  framing that drives the rest of this doc doesn't really apply to artwork. The goal here is
  efficiency/offline-capability, not survival.
- **A real, previously-diagnosed bug sat in this path — now fixed.** [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md)
  (pre-existing, not new) documented that first-time users downloaded every image **twice** (an unused
  blob-cache warm + the real fetch), and returning users re-fetched most artwork every session because
  only the HIGH texture tier was cross-session cached, not MID (the default, most-visible tier). An
  audit on 2026-07-11 found both problems already resolved by an unrelated artwork-pipeline rewrite —
  **Plan 1 is done and archived.**
- **Blanket-baking artwork the way we baked appdetails doesn't transfer**: appdetails had a natural
  shared universal set (the S3 cache, accumulated across every user ever). Artwork doesn't — a real
  library is *personal* and potentially hundreds of MB. The **F2P/anonymous-store set is the one
  exception** (not per-user, ~1 MB total) — **Plan 2**, [F2P Artwork Bake](f2p-artwork-bake-plan.md), done.
- **Deliberately not solved**: baking the F2P set sidesteps Steam-CDN traffic for those 18 games
  specifically, but a public launch could still cause a correlated burst of requests for popular
  overlapping titles across many *connected* users' libraries. Steam's CDN is Akamai-backed and built
  for far more than we'd generate, so likely a non-issue — but flagged, not investigated, revisit if a
  real public launch is actually being planned.

## Separately tracked: the broader Act 3 traffic audit

This review is scoped to what we're actively building right now (Act 2, friends-scale). A second,
broader pass — measuring actual outbound call volume at *public* scale and building a fresh-data
batching/coalescing step (collapsing concurrent requests for the same still-uncached appid into one
Steam call) — is real, necessary follow-on work, but distinct enough in scope and timing to have its
own tracked story rather than living here. See **Production Infrastructure §9.2.1.4** (linked below).

## The two spikes this review wants stood up

Both are prepped as self-contained briefs for a fresh (cheaper-model) context:

- [Bookmarklet Capture Spike](../archive/bookmarklet-capture-spike.md) — kills ownership traffic on web.
- [Rust CORS/Lambda Bypass Spike](rust-cors-bypass-spike.md) — kills ownership + appdetails + SteamSpy Lambda traffic on desktop; SteamSpy's inherent latency is a separate, parallel-tracked problem (see above), not a reason to exclude it from this spike.

## Related
- [Release Pipeline](release-pipeline-plan.md) — the `aws s3 sync` bake that pre-loads enrichment
- [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) — CDN-artwork Plan 1, done (fixed the double-fetch/no-MID-cache bug)
- [F2P Artwork Bake](f2p-artwork-bake-plan.md) — CDN-artwork Plan 2, done (bake the anonymous store's artwork)
- [Image/Texture Pipeline](../architecture/image-texture-pipeline.md) — current artwork cache architecture
- [Manual Library Export](../archive/manual-library-export-feasibility.md) — the ownership-traffic replacement
- [Desktop App](../features/desktop-app.md) — the native routes that get desktop to near-zero
- [Steam API Research](../research/steam-api-research.md) — original CORS/Lambda rationale
- [Network Rate Limiting](../features/network-rate-limiting.md) — confirmed appdetails batching ceiling; current outbound-traffic implementation
- [Production Infrastructure §9.2.1.4](../features/production-infrastructure.md) — the tracked early-Act-3 audit + coalescing story
- [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md) — SteamSpy as the one field with no redundant source, from the data-availability angle
- [SteamSpy Bulk Alternatives Research](../research/steamspy-bulk-alternatives-research-prompt.md) — renewed search for a way to avoid the 1 req/sec fetch entirely
- [Appdetails Bundle Lambda Plan](appdetails-bundle-lambda-plan.md) — the bulk-snapshot approach that reduces how often any client needs a live SteamSpy fetch at all
- [Local File Investigation](../features/local-file-investigation.md) — the best-bet path for sidestepping SteamSpy on desktop entirely

---
*— A1 / P1*
