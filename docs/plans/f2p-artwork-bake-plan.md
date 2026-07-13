# F2P Artwork Bake

**Plan 2 of 2** in the CDN-artwork-traffic thread — see [Traffic Safety Review](traffic-safety-review.md)
("Next front: the CDN images") for the research this is based on. **Plan 1**,
[Texture Cache Refactor](../archive/texture-cache-refactor-plan-COMPLETED.md), is done (archived
2026-07-11) — there's one clean, cache-first pixel storage layer to seed now, no double-fetch to worry
about feeding.

**Act**: 2 · **Status**: 🟢 Built (2026-07-13) — bake script (grid-pack image), release.sh wiring, and
client-side consumption (pre-seeding PixelDataCache under the real CDN URL, plus demo-store filtering)
are all in place and verified live. Superseded the original per-appid-file + runtime-manifest design
from 2026-07-12 - see "Client-side consumption" below for why.

## Goal (one line)

Ship the anonymous store's artwork inside the release itself, so it never touches Steam's CDN at all.

## Why this is a small, clean problem (unlike the "rest" tier)

The [Traffic Safety Review](traffic-safety-review.md) research drew a sharp line: Steam's CDN
(`library_600x900.jpg` et al.) is public, CORS-open, long-cached (`Cache-Control: public,
max-age=604800`) — a fundamentally different risk than the rate-limited Web API. Blanket-baking
artwork the way we did with the appdetails cache doesn't transfer cleanly here, because appdetails had
a natural shared universal set (the S3 cache already accumulated across every user who ever loaded any
game); artwork doesn't — a real connected user's library is *their* library, unknown in advance, and
potentially hundreds of megabytes.

The **F2P/anonymous-store set is the one exception**, because it isn't per-user — it's the same set for
every visitor before they connect anything. A second, bounded, shared, knowable-in-advance set — the
top-N most popular *paid* games — fits the same justification for the same reason (not per-user, small,
fixed); see "Extension: Top-N Popular (Paid) Games" below. It's explicitly lower priority and deferred,
not part of the primary deliverable.

## What counts as F2P (no curated list — `is_free == true`, full stop)

An earlier version of this plan hand-curated an 18-game seed list (mirrored from
`client/src/steam/fixtures/demo-games.ts`) as "the upstream source of truth" for F2P. That's gone: the
seed file and `demo-games.ts` are both deleted. The F2P set is now simply *whatever the baked appdetails
cache says `is_free == true`* — currently ~93 games, straight out of the S3 cache with zero curation.
Reasoning: a hand-picked list is one more thing to maintain for no real benefit at this scale; sorting,
filtering, or curating on top of the raw `is_free` set can be layered in later without needing a seed
file to exist first. Revisit if/when the build process needs to address it (see Act 3 note below).

### Candidate future source for curation/ranking: Gamalytic

No longer relevant to the F2P set itself (see above), but still a candidate input for the deferred
**Top-N Popular (Paid) Games** extension. Checked live (2026-07-09):
[gamalytic.com/game-list](https://gamalytic.com/game-list), a Steam sales analytics site ("Powered by
Steam," per its own footer), sorted by `copiesSold` descending.

- **Each row links to `/game/{steamAppId}`** — e.g. `/game/730` for Counter-Strike 2 — so the real Steam
  appid is directly present, no name-matching or resolution step needed.
- **`copiesSold` and `$ Price` are visible on the free tier** — enough for a popularity ranking.
  `Revenue` and `Average playtime` are paywalled but neither is needed.
- **Not yet confirmed**: their Terms of Service and whether bulk access needs their "DOWNLOAD COMPLETE
  TABLE" feature or a paid tier — a raw automated fetch got HTTP 429, a real browser session loaded fine.
  Open questions to resolve **when** Top-N is actually built, not blocking today.

## The bake script (built)

`scripts/bake-f2p-artwork.sh <app-details-bundle-gz> <out-dir>` is the one place in the release
pipeline with F2P-shaped domain knowledge — `repack-steam-cache.sh` no longer splits F2P out on its
own (see [Release Pipeline](release-pipeline-plan.md)). It:

1. Reads the single combined `app-details.json.gz` bundle and filters `is_free == true` itself.
2. Downloads `library_600x900.jpg` per F2P appid into a scratch directory.
3. **Stitches every successfully-downloaded image into one grid ("pack") JPEG** via ImageMagick's
   `montage` (`client/public/artwork-cache/pack.jpg`), each tile a fixed 300×450 with zero gaps, plus
   `pack-index.json` (`{tileWidth, tileHeight, entries: {appid: {x, y}}}`) recording each appid's pixel
   offset in the grid. Individual per-appid files and the old runtime `manifest.json` are gone — see
   "Client-side consumption" for why this replaced the original per-file design.
4. **Writes back** `undesirable_for_demo: true` onto any F2P appid's entry in the appdetails bundle
   itself, for every appid whose `library_600x900.jpg` 404'd — a reliable signal the game has no usable
   portrait artwork on Steam's CDN at all (a runtime fetch would hit the same 404), not just that we
   skipped baking it. Non-F2P entries and successfully-baked F2P entries pass through untouched. The
   bundle is then re-gzipped back to the same file.

**Why a grid image and not N separate files or a bespoke bundle format**: fewer requests (1 instead of
N), a real size win from unifying JPEG quality across all tiles in one encode pass (measured: 75 images,
4.2 MiB individually vs. 2.6 MiB as one 2700×4050 grid at quality 85 — about 38% smaller), and it's a
plain JPEG — anyone can open `pack.jpg` in any image viewer and see exactly what it is, no bespoke
format or tooling required to inspect it. Tile size (300×450) isn't arbitrary: `LodArtworkOrchestrator`
already treats 300×450 as the effective ceiling for HIGH-tier textures regardless of source resolution
(see its "Steam library image CDN reality check" comment), so normalizing every tile to that size loses
nothing the renderer would have kept anyway.

Wired into `release.sh` as `bake_f2p_artwork`, run after `repack_cache` (it needs Step 2's output to
read). Verified live: 75/93 F2P games baked successfully (18 real 404s — likely tools/soundtracks/demos
incorrectly carrying `is_free == true`, or delisted apps), all 1361 total games preserved in the
re-packed bundle, only the 18 failed F2P entries flagged.

Two environment-specific things worth flagging for anyone touching this script: (1) `jq -r` emits CRLF
line endings in this dev environment, and word-splitting a `\r`-suffixed number in a bash `for` loop
silently breaks every appid except the last (each URL 404s with an invisible trailing `\r`) — fixed by
piping through `tr -d '\r'`; (2) requires ImageMagick (`magick`/`convert` + `montage`) on the machine
running `release.sh` - a new toolchain dependency, but a very standard, widely-packaged one (present on
most CI images by default), consistent with "boring standard tools" over a bespoke image-packing format.

## Client-side consumption (built) — pre-seed the pixel cache, don't teach the pipeline about "baked"

**First attempt (2026-07-12), since superseded**: shipped N individual `{appid}.jpg` files plus a
`manifest.json`, and taught `GameArtworkProvider`/`LodArtworkOrchestrator` to check that manifest and
prefer a local URL over the CDN one. Two problems surfaced on review: it made the artwork pipeline
*aware* of "baked artwork" as a concept (leaking into `buildUrlStrategy()`/`resolveHighArtworkUrl()`),
and it meant serving N individual files from our own host at runtime - not meaningfully different from
running a small CDN ourselves, undercutting the exact request-volume concern this whole thread exists to
solve, just aimed at our own host instead of Steam's.

**Current design**: `ArtworkPackSeeder` (`client/src/scene/game-box/instancing/ArtworkPackSeeder.ts`)
runs once at startup and pre-seeds `PixelDataCache` directly, keyed under the **real** Steam CDN URL
(`deriveArtworkFromAppId(appid).library`) - not a synthetic local path:

1. Fetches `pack-index.json` + `pack.jpg` (two requests total, not one per game).
2. Skip check: if `PixelDataCache` already has an entry for the first indexed appid, assumes the whole
   pack was already seeded this cache's lifetime and does nothing further.
3. Otherwise, decodes the pack **once** in a worker (`TextureWorker.decodeArtworkPack()`, new method) -
   one `createImageBitmap()` call, then crops+resizes each tile to both MID (150×225) and HIGH (300×450)
   pixel arrays, off the main thread.
4. Seeds `PixelDataCache.put(realCdnUrl, pixels, width, height)` for both sizes, per game.

Because the cache key is the real CDN URL, `GameArtworkProvider.fetchPixels()` and
`LodArtworkOrchestrator.resolveHighArtworkUrl()` need **zero** awareness that any of this happened - a
pre-seeded entry is just a cache hit, indistinguishable from a returning visitor's warm cache. The
`getBakedArtworkUrl()`/`bakedArtworkAppIds`/manifest-checking code added in the first attempt was
deleted, not extended, along with the now-unused `BakedArtworkManifest.ts` helper.

Sizes are hardcoded to the *default* LOD tier sizes (`getDefaultLodTierSpecs()` in `LodTypes.ts`), not
read from the user's current `AppSettings` ratio configuration - a user who has customized their LOD
ratios away from default simply won't get pre-seeded entries at their custom size and falls through to
a normal CDN fetch, same as before this existed. Not worth the cross-layer coupling to
`LodArtworkOrchestrator`'s dynamic config for a niche settings tweak.

Awaited (not fire-and-forget) before `SteamIntegration.loadDemoGames()` builds the demo list - see
`SteamApiClient.getDemoGames()`, which awaits `artworkPackReady` alongside `appDetailsCacheReady` for
the same reason. **Tracked fast-follow, not yet built**: a fully loose-coupled version that doesn't
block on this seed at all, relying on the existing "wait to render the game box until its artwork is
ready" machinery already in the placement pipeline instead. Deferred because it wasn't obviously already
sufficient here and the await is assumed inconsequential (~2.6MB image, decoded once, off the main
thread) but unmeasured either way.

Verified live: 2 total requests for all 75 games' artwork (down from 75), zero requests to any
`steamstatic.com` domain, `PixelDataCache` holds entries under the real CDN URL at both MID and HIGH
sizes for every baked appid.

## Deferred, explicitly not solved here: launch-day traffic burst

Flagged and intentionally left for later: baking the F2P set sidesteps Steam-CDN traffic for those
games specifically (they ship pre-baked, no CDN hit needed at all). But the "rest" — real, per-user
libraries — isn't baked, and a public launch or release announcement could cause a burst of correlated
requests to Steam's CDN for popular overlapping titles across many users' libraries within a short
window. Steam's CDN is Akamai-backed and built for exactly this kind of public fan-out at a scale far
beyond anything we'd generate, so this is very likely a non-issue in absolute terms — but it's a real
question, not yet investigated, and explicitly deferred rather than dismissed. Revisit if/when a real
public launch is actually being planned.

## Deferred, tracked in Act 3: baked artwork/appdetails staleness

Once baked, a game's artwork/appdetails never get re-checked against Steam's CDN — an Early Access
title that later ships new box art stays on whatever was baked at release time indefinitely. Before
this plan, staleness wasn't a concern (always fetched live, "clear cache" could force a refetch); now
it's a real tradeoff of the traffic-safety win. Tracked as a TTL-or-manual-purge story rather than
solved here — see [Act 3](../acts/act3-ready-for-everyone.md) ("Baked artwork/appdetails freshness").

## Extension (lower priority, deferred): Top-N Popular (Paid) Games

Added 2026-07-09, not part of the primary deliverable. The same bake-script-owns-the-filter pattern
extends cleanly to a second, separate concern: the top N best-selling *paid* games, sourced from the
same Gamalytic ranking (see above). This is genuinely a different set from F2P (mutually exclusive by
definition — F2P is `$0`, this is ranked among the rest), so it'd be its own bake script and its own
`artwork-cache-top-n/` output, not a merge into the existing F2P one.

**Explicitly deferred, not decided**:
- **How to determine N** — the user's own words: "we'll decide HOW to determine top n later." No
  default assumed here.
- Whether "top N by copies sold" is even the right criterion long-term vs. something else (recency,
  genre balance, etc.) — Gamalytic's ranking is a credible starting point, not a locked-in decision.
- Interaction with the anonymous store UI/UX — top-N paid games aren't part of "what you might own
  before buying anything" (the F2P framing), so where/how they'd surface to a user is a product
  question, not just a data-pipeline one.

## Open questions

- ~~Exact client-side check mechanism (artwork URL preference)~~ — **resolved: pre-seed PixelDataCache
  directly under the real CDN URL**, no manifest-aware branch anywhere in the artwork pipeline. See
  "Client-side consumption" above.
- ~~Exact client-side check mechanism (demo-store inclusion)~~ — **resolved: build-time flag**
  (`undesirable_for_demo`), no runtime fetch. See "Client-side consumption" above.
- ~~Fatal vs. skip-and-warn on bake failure~~ — **resolved: skip-and-warn.**
- ~~Individual files vs. a packed bundle~~ — **resolved: one grid JPEG** (`pack.jpg` + `pack-index.json`).
- **Fast-follow, tracked, not built**: loosen the `getDemoGames()` await on `artworkPackReady` to rely on
  the existing artwork-ready render-gating machinery instead of blocking the demo list on the seed
  finishing first.
- Gamalytic's Terms of Service and bulk-access mechanism — unread/unconfirmed, needed before building
  Top-N from it.

## Related

- [Traffic Safety Review](traffic-safety-review.md) — the research this is based on
- [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) — Plan 1, done
- [Image/Texture Pipeline](../architecture/image-texture-pipeline.md) — current cache architecture this plan feeds into
- [Release Pipeline](release-pipeline-plan.md) — the appdetails-bake precedent this plan intentionally does *not* fully mirror (per-user artwork ≠ shared appdetails cache)

---
*— A1 / P1*
