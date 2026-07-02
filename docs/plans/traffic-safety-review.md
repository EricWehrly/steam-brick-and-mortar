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
2. **App-details enrichment** — Lambda → Steam (store appdetails / SteamSpy). One request per *new*
   appid; already **cached in S3** so it's paid once ever, not per user.
3. **Artwork images** — client → **Steam's CDN directly**, per appid, per box shown. Not proxied,
   not cached by us. **This is the next front** (see below) — it's likely the largest volume of all.

## How each channel reduces Steam traffic

| Traffic source | Reduction mechanism | Residual Steam traffic |
|---|---|---|
| Ownership list | **Manual export** (web bookmarklet) / **injected-webview capture** (desktop) — the user's own browser reads their own library; our infra never asks Steam | **Zero** for imported libraries. Online profile path still costs one Steam call per load |
| Enrichment | **Bake the whole S3 cache into the release** (`aws s3 sync`, see [Release Pipeline](release-pipeline-plan.md)). A shipped instance already holds everything the Lambda has ever cached | Only genuine **cache-misses** (appids never seen before) reach Steam. On **desktop**, even those can go via Rust (CORS-free direct fetch) without the Lambda |
| Artwork (CDN) | **Not yet addressed** — the next investigation | Currently **all of it** — every box pulls `library_600x900.jpg` etc. from Steam's CDN |

## The baked cache changes the enrichment picture a lot

Because the bake grabs the *entire* S3 cache — not a curated slice — a released instance starts life
knowing every appid the Lambda has already hydrated. Runtime enrichment then hits Steam **only** for
appids that are new to the whole system. As the cache grows across releases, that miss rate trends
toward zero for the popular long tail. That's the strong version of the traffic-safety win, and it
costs us one `aws s3 sync` and a small client-seeding change.

## Verdict by run mode (framed as Steam traffic)

- **Web, anonymous store**: can hit Steam **zero times** — static fixture + baked enrichment + (once
  the CDN thread is done) local artwork. The cleanest immediate win.
- **Web, connected via import**: **zero** ownership traffic; enrichment traffic only on cache-miss
  appids; artwork still pulls from the CDN until that thread lands.
- **Web, connected via online profile**: one ownership call + miss-only enrichment. Still far lighter
  than today, but not zero.
- **Desktop**: can reach **zero Lambda / near-zero Steam** — Rust handles ownership capture,
  enrichment fetch, and (eventually) artwork, all without our backend. Architecturally the safest,
  but depends on Pillar-2 native routes that are **not built yet**.

## Next front: the CDN images

Once the above is in and tested, the same question turns to artwork: today every game box fetches its
image straight from Steam's CDN, which is probably our **highest-volume** Steam dependency. Options to
investigate then (not now): bake common artwork into the release alongside the cache, proxy/cache
artwork through our own CloudFront, or lazy/deprioritized loading. Tee'd up as a follow-on to this
review — do **not** solve it here, but keep the release/bake mechanisms artwork-extensible.

## The two spikes this review wants stood up

Both are prepped as self-contained briefs for a fresh (cheaper-model) context:

- [Bookmarklet Capture Spike](bookmarklet-capture-spike.md) — kills ownership traffic on web.
- [Rust CORS/Lambda Bypass Spike](rust-cors-bypass-spike.md) — kills ownership + enrichment traffic on desktop.

## Related
- [Release Pipeline](release-pipeline-plan.md) — the `aws s3 sync` bake that pre-loads enrichment
- [Manual Library Export](manual-library-export-feasibility.md) — the ownership-traffic replacement
- [Desktop App](../features/desktop-app.md) — the native routes that get desktop to near-zero
- [Steam API Research](../research/steam-api-research.md) — original CORS/Lambda rationale

---
*— A1 / P1*
