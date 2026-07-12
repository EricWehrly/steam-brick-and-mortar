# F2P Artwork Bake

**Plan 2 of 2** in the CDN-artwork-traffic thread — see [Traffic Safety Review](traffic-safety-review.md)
("Next front: the CDN images") for the research this is based on. **Plan 1**,
[Texture Cache Refactor](../archive/texture-cache-refactor-plan-COMPLETED.md), is done (archived
2026-07-11) — there's one clean, cache-first pixel storage layer to seed now, no double-fetch to worry
about feeding.

**Act**: 2 · **Status**: 🟢 Built (2026-07-11) — bake script, release.sh wiring, and client-side
consumption (both MID and HIGH tiers) are all in place and verified live. The `repack-steam-cache.sh`
seed-file switch noted below is the one item still open.

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

The **F2P/anonymous-store set is the one exception**, because it isn't per-user — it's the same fixed
list for every visitor before they connect anything. That set is small: 18 games × ~55 KB average
(`library_600x900.jpg`) ≈ **~1 MB total**. Baking it is cheap and unambiguous. This plan is primarily
scoped to exactly that — it is not a general "bake all artwork" plan, and shouldn't grow into one
without a separate decision. A second, bounded, shared, knowable-in-advance set — the top-N most
popular *paid* games — fits the same justification for the same reason (not per-user, small, fixed);
see "Extension: Top-N Popular (Paid) Games" below. It's explicitly lower priority and deferred, not
part of the primary deliverable.

## The shared seed (the actual design ask)

The anonymous store's 18-game list already exists, hand-curated, in
`client/src/steam/fixtures/demo-games.ts` (`ANONYMOUS_STORE_USER` — "high-profile titles with good
capsule art and broad recognition"). That list is the **upstream source of truth** for "what counts as
F2P," not the `is_free == true` filter `scripts/repack-steam-cache.sh` currently uses for its F2P
appdetails tier — that filter is an accidental derivation from whatever happens to be in the S3 cache,
not an authored decision.

Extracted into `scripts/f2p-appid-seed.json` (created, in this stage) — a plain JSON array of the same
18 appids, with a comment noting it currently mirrors `demo-games.ts` by hand. This becomes the single
list both bake scripts read from:

```json
{ "appids": [440, 570, 730, ...] }
```

**Why this matters beyond today**: when the F2P list gets properly revisited (more than 18, different
curation criteria, whatever), editing this one file is the whole change — both the appdetails bake and
the artwork bake pick it up on the next release run. Today's list is a placeholder in the sense that
it hasn't had a dedicated curation pass yet, not in the sense that the mechanism is temporary.

**Still open**: `scripts/repack-steam-cache.sh`'s F2P tier still filters by `is_free == true` on the
merged cache rather than reading this seed file — `scripts/bake-f2p-artwork.sh` (the new artwork bake)
reads the seed file, but the appdetails repack wasn't touched. Switching it to read
`f2p-appid-seed.json` (via `jq --slurpfile seed`, selecting only those appids from the merged object)
is a small, contained follow-up, not done in this pass.

**Not addressed here**: keeping `demo-games.ts` and the seed file in sync is manual for now.
`demo-games.ts` carries presentation metadata (fake playtime, hand-picked genre labels for the UI) the
seed doesn't need, so full auto-generation isn't a trivial win — worth a future look once the list
actually changes for the first time, not speculative work now.

### Candidate future seed source: Gamalytic

Checked live (2026-07-09): [gamalytic.com/game-list](https://gamalytic.com/game-list), a Steam sales
analytics site ("Powered by Steam," per its own footer), sorted by `copiesSold` descending. Looks
genuinely usable for regenerating this seed later:

- **Each row links to `/game/{steamAppId}`** — e.g. `/game/730` for Counter-Strike 2, `/game/570` for
  Dota 2, `/game/440` for Team Fortress 2 — so the real Steam appid is directly present, no name-matching
  or resolution step needed.
- **`copiesSold` and `$ Price` are visible on the free tier.** That's all this seed needs — price
  determines F2P (`$0`), copiesSold gives the popularity ranking for the top-N extension below.
  `Revenue` and `Average playtime` are paywalled (an "Upgrade to Starter plan" link in place of the
  value) but neither is needed here.
- The current top of their `copiesSold`-sorted list (CS2, Dota 2, PUBG, TF2, Apex, Left 4 Dead 2, Crab
  Game, Unturned, Warframe, Rainbow Six Siege...) already substantially overlaps our hand-curated
  `demo-games.ts` list — a reasonable sanity check that the ranking is credible.
- **Not yet confirmed**: their Terms of Service (link present in the footer, not read yet) and whether
  bulk access needs their "DOWNLOAD COMPLETE TABLE" feature or a paid tier — a raw automated fetch
  (no browser session) got HTTP 429 from their edge, while a real browser session loaded the page fine,
  so any future automated ingestion likely needs either their export feature or a browser-driven fetch,
  not a plain `curl`. Both are open questions to resolve **when** this seed is actually regenerated —
  not blocking today, since today's seed is still the hand-curated `demo-games.ts` list.

## The bake script (built)

`scripts/bake-f2p-artwork.sh <seed-file> <out-dir>` downloads `library_600x900.jpg` for each seeded
appid into `client/public/artwork-cache/{appid}.jpg` (gitignored like `steam-cache/`), and writes
`manifest.json` listing only the appids that actually succeeded — skip-and-warn on individual failures,
per the lean noted in the open questions below (resolved: skip-and-warn, not fatal). Wired into
`release.sh` as a new `bake_f2p_artwork` step alongside the appdetails repack. Verified: 18/18 baked
successfully in a real run.

One environment-specific fix worth flagging for anyone touching this script: `jq -r '.appids[]'` emits
CRLF line endings in this dev environment, and word-splitting a `\r`-suffixed number in a bash `for`
loop silently breaks every appid except the last (each URL 404s with an invisible trailing `\r`). Fixed
by piping through `tr -d '\r'`.

## Client-side consumption (built)

The cache layer fed is `PixelDataCache`, keyed `${url}@${width}x${height}` (see
[Image/Texture Pipeline](../architecture/image-texture-pipeline.md)). Resolved: **manifest**, not
fetch-and-fall-through — necessary because the two LOD tiers consume artwork URLs differently:

- **MID** goes through `GameArtworkProvider.buildUrlStrategy()`, which already tries an ordered
  candidate list until one succeeds. The baked local URL is prepended as the first candidate (only for
  `format === 'library'`, since that's the only shape baked) — a 404 there just falls through to the
  normal CDN chain exactly like any other candidate failure already does.
- **HIGH** doesn't go through that chain at all — `LodArtworkOrchestrator.resolveHighArtworkUrl()`
  resolves a single URL up front and `HighTextureCache` fetches it directly with no fallback. A
  fetch-and-fall-through check wouldn't have worked here, so `resolveHighArtworkUrl()` checks the same
  baked-artwork manifest first, ahead of the existing hint/CDN-construction logic.

`GameArtworkProvider` loads `/artwork-cache/manifest.json` once, fire-and-forget, in its constructor
(same spirit as `initPixelCache()`) and exposes `getBakedArtworkUrl(appId): string | null`. A request
that lands before the manifest resolves just treats every appid as not-baked and falls through to CDN —
a transient, self-correcting miss, not a bug.

## Deferred, explicitly not solved here: launch-day traffic burst

Flagged and intentionally left for later: baking the F2P set sidesteps Steam-CDN traffic for those 18
games specifically (they ship pre-baked, no CDN hit needed at all). But the "rest" tier — real,
per-user libraries — isn't baked, and a public launch or release announcement could cause a burst of
correlated requests to Steam's CDN for popular overlapping titles across many users' libraries within
a short window. Steam's CDN is Akamai-backed and built for exactly this kind of public fan-out at a
scale far beyond anything we'd generate, so this is very likely a non-issue in absolute terms — but
it's a real question, not yet investigated, and explicitly deferred rather than dismissed. Revisit
if/when a real public launch is actually being planned.

## Extension (lower priority, deferred): Top-N Popular (Paid) Games

Added 2026-07-09, not part of the primary deliverable. The same mechanism this plan builds — a seed
file of appids, a bake script, a client-side local-first check — extends cleanly to a second,
separate seed: the top N best-selling *paid* games, sourced from the same Gamalytic ranking (see
above). This is genuinely a different set from F2P (mutually exclusive by definition — F2P is `$0`,
this is ranked among the rest), so it'd be a second seed file (e.g.
`scripts/top-n-appid-seed.json`) and a second bundle (`app-details-top-n.json.gz` /
`artwork-cache-top-n/`), not a merge into the existing F2P one.

**Explicitly deferred, not decided**:
- **How to determine N** — the user's own words: "we'll decide HOW to determine top n later." No
  default assumed here.
- Whether this needs its own appdetails tier in `repack-steam-cache.sh` (mirroring the F2P tier) or
  just an artwork bake, given these games' appdetails may already be common cache hits regardless.
- Whether "top N by copies sold" is even the right criterion long-term vs. something else (recency,
  genre balance, etc.) — Gamalytic's ranking is a credible starting point, not a locked-in decision.
- Interaction with the anonymous store UI/UX — top-N paid games aren't part of "what you might own
  before buying anything" (the existing F2P framing in `demo-games.ts`'s own docblock), so where/how
  they'd surface to a user is a product question, not just a data-pipeline one.

This section exists so the shared-seed mechanism is designed with this extension in mind (seed file →
bake script → local-first check, generalized rather than F2P-hardcoded) even though building it is not
scheduled yet.

## Open questions

- ~~Exact client-side check mechanism~~ — **resolved: manifest.** See "Client-side consumption" above.
- ~~Fatal vs. skip-and-warn on bake failure~~ — **resolved: skip-and-warn.** A failed appid is simply
  absent from `manifest.json`; the rest of the run continues.
- `scripts/repack-steam-cache.sh` still uses `is_free == true` instead of reading the seed file — see
  "Still open" note above. Small, contained, not done in this pass.
- Whether to keep `demo-games.ts` and the seed file in manual sync indefinitely or eventually generate one from the other.
- Gamalytic's Terms of Service and bulk-access mechanism — unread/unconfirmed, needed before regenerating any seed from it (F2P refinement or top-N).

## Related

- [Traffic Safety Review](traffic-safety-review.md) — the research this is based on
- [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) — Plan 1, done
- [Image/Texture Pipeline](../architecture/image-texture-pipeline.md) — current cache architecture this plan feeds into
- [Release Pipeline](release-pipeline-plan.md) — the appdetails-bake precedent this plan intentionally does *not* fully mirror (per-user artwork ≠ shared appdetails cache)
- `client/src/steam/fixtures/demo-games.ts` — the upstream curated list
- `scripts/f2p-appid-seed.json` — the extracted seed

---
*— A1 / P1*
