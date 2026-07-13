# F2P Artwork Bake

**Plan 2 of 2** in the CDN-artwork-traffic thread — see [Traffic Safety Review](traffic-safety-review.md)
("Next front: the CDN images") for the research this is based on. **Plan 1**,
[Texture Cache Refactor](../archive/texture-cache-refactor-plan-COMPLETED.md), is done (archived
2026-07-11) — there's one clean, cache-first pixel storage layer to seed now, no double-fetch to worry
about feeding.

**Act**: 2 · **Status**: 🟢 Built (2026-07-12) — bake script, release.sh wiring, and client-side
consumption (both artwork preference and demo-store filtering) are all in place and verified live.

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
2. Downloads `library_600x900.jpg` per F2P appid into `client/public/artwork-cache/{appid}.jpg`
   (gitignored like `steam-cache/`), and writes `manifest.json` listing only the appids that
   succeeded — skip-and-warn on individual failures, not fatal.
3. **Writes back** `undesirable_for_demo: true` onto any F2P appid's entry in the appdetails bundle
   itself, for every appid whose `library_600x900.jpg` 404'd — a reliable signal the game has no usable
   portrait artwork on Steam's CDN at all (a runtime fetch would hit the same 404), not just that we
   skipped baking it. Non-F2P entries and successfully-baked F2P entries pass through untouched. The
   bundle is then re-gzipped back to the same file.

Wired into `release.sh` as `bake_f2p_artwork`, run after `repack_cache` (it needs Step 2's output to
read). Verified live: 75/93 F2P games baked successfully (18 real 404s — likely tools/soundtracks/demos
incorrectly carrying `is_free == true`, or delisted apps), all 1361 total games preserved in the
re-packed bundle, only the 18 failed F2P entries flagged.

One environment-specific fix worth flagging for anyone touching this script: `jq -r` emits CRLF line
endings in this dev environment, and word-splitting a `\r`-suffixed number in a bash `for` loop silently
breaks every appid except the last (each URL 404s with an invisible trailing `\r`). Fixed by piping
through `tr -d '\r'`.

## Client-side consumption (built) — two separate concerns, don't conflate them

**1. Which URL to fetch artwork from** (`GameArtworkProvider`) — unchanged by the redesign above. The
cache layer fed is `PixelDataCache`, keyed `${url}@${width}x${height}` (see
[Image/Texture Pipeline](../architecture/image-texture-pipeline.md)):

- **MID** goes through `GameArtworkProvider.buildUrlStrategy()`, which already tries an ordered
  candidate list until one succeeds. The baked local URL is prepended as the first candidate (only for
  `format === 'library'`) — a 404 there just falls through to the normal CDN chain.
- **HIGH** doesn't go through that chain — `LodArtworkOrchestrator.resolveHighArtworkUrl()` resolves a
  single URL up front, so it checks the baked-artwork manifest first, ahead of hint/CDN-construction.

`GameArtworkProvider` loads `/artwork-cache/manifest.json` once, fire-and-forget, via the shared
`client/src/steam/utils/BakedArtworkManifest.ts` helper. This is still a runtime fetch, and still open
for discussion (see the tracked follow-up in Related below).

**2. Whether a game should appear in the demo store at all** (`GamesLoader.getDemoGames()`) — this is
the part that changed. It no longer fetches `manifest.json` at runtime; it filters on
`is_free === true && !undesirable_for_demo`, both of which arrive as ordinary fields on the same
`AppDetailsCache` entries already seeded via `BakedCacheLoader`. No separate runtime check, no second
fetch of anything artwork-shaped — the exclusion travels with the appdetails data through the same seed
path everything else already uses.

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

- ~~Exact client-side check mechanism (artwork URL preference)~~ — **resolved: manifest**, via
  `GameArtworkProvider`. See "Client-side consumption" above.
- ~~Exact client-side check mechanism (demo-store inclusion)~~ — **resolved: build-time flag**
  (`undesirable_for_demo`), no runtime fetch. See "Client-side consumption" above.
- ~~Fatal vs. skip-and-warn on bake failure~~ — **resolved: skip-and-warn.**
- Whether `GameArtworkProvider`'s own runtime fetch of `manifest.json` (for artwork URL preference,
  concern #1 above) should also move to a build-time/data-driven mechanism — flagged, not yet discussed
  in depth.
- Gamalytic's Terms of Service and bulk-access mechanism — unread/unconfirmed, needed before building
  Top-N from it.

## Related

- [Traffic Safety Review](traffic-safety-review.md) — the research this is based on
- [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) — Plan 1, done
- [Image/Texture Pipeline](../architecture/image-texture-pipeline.md) — current cache architecture this plan feeds into
- [Release Pipeline](release-pipeline-plan.md) — the appdetails-bake precedent this plan intentionally does *not* fully mirror (per-user artwork ≠ shared appdetails cache)

---
*— A1 / P1*
