# Sort/Filter Data Provenance

**Purpose**: canonical reference for which sort/filter dimensions the app offers, which fields they
actually read, and — critically — where each field originates *outside* the client and its own
cache. Written because the sort/filter surface is exactly where "we have some data but not all of
it, for some games but not others" bites hardest, and that's easy to lose track of once the data
flows through several caching layers. Update this doc whenever a new sort/filter dimension is added
or an existing one's data source changes.

## Why this exists

Not every sort/filter dimension costs the same to populate. Some fields are free (already in
Steam's ownership payload, no extra fetch ever). Some are cheap (Steam's own `appdetails`, one
request per new appid, cached forever after). One is expensive and has **no bulk alternative today**
— SteamSpy community tags. Treating all of them as equally "just data the app has" hides that the
tag/review-score dimension is the one actually worth protecting, and the one most likely to be
silently incomplete for a chunk of any given library.

## The table

| Sort/filter dimension | Field(s) | Source | Cost / availability |
|---|---|---|---|
| By name | `name` | Ownership payload (`GetOwnedGames` / bookmarklet `OwnedGames`) | Free, always present |
| By playtime | `playtime_forever` | Ownership payload | Free, always present |
| By last played | `rtime_last_played` | Ownership payload | Free, present if ever played |
| By genre | `genres` | Steam `appdetails` (Lambda-proxied, or bookmarklet-direct per `steam-store-appdetails-cors-research.md`) | One request per new appid, cached forever (S3 + client `AppDetailsCache`) once fetched |
| By category (Co-op, Controller Support, etc.) | `categories` | Steam `appdetails`, same as genre | Same as genre |
| By developer/publisher | `developers` / `publishers` | Steam `appdetails` | Same as genre |
| By community tag | `steamspy_tags` / `steamspy_top_tags` | **SteamSpy** (`steamspy.com/api`), via the separate hydrator Lambda (`external-tool/infrastructure/lambda-hydrator-src`) | **~1 request/second enforced (`STEAMSPY_DELAY_MS = 1100` in the hydrator), no bulk endpoint, no client-side or bookmarklet-side alternative found — see below |
| By review score | `positive`/`negative`/`userscore`/`owners` | SteamSpy, same path as tags | Same as tags |

## The one real gap: SteamSpy is a single point of dependency

Genre/category/developer/publisher all come from Steam's own `appdetails` — a first-party source,
reachable multiple ways (Lambda, or directly from the bookmarklet's `steamcommunity.com` execution
context per `docs/research/steam-store-appdetails-cors-research.md`), and already fully baked into
every release (`release-pipeline-plan.md`'s S3 bake). Redundant, low-risk, effectively solved.

**Tags and review-score data have exactly one source: SteamSpy, exactly one path to it (the
hydrator Lambda), and no confirmed alternative.** `docs/research/steam-store-appdetails-cors-research.md`
confirmed Steam's own `appdetails` endpoint doesn't carry community tags at all — that's not a gap
in our fetching, it's absent from the data Steam itself serves. SteamSpy's own rate limit
(~1 req/sec, confirmed in both `steam-tag-pipeline.md` and the hydrator's own enforced delay) means
this data arrives slowly and incrementally, batch by batch, not "whenever we want it." A library
containing an appid SteamSpy hasn't hydrated yet — or that the hydrator hasn't reached — has no tag
data, full stop, until the hydrator gets to it.

**This is the field to protect and communicate clearly**, not genres/categories. See
`docs/plans/appdetails-bundle-lambda-plan.md` for the automated-bundle plan that keeps a
SteamSpy-hydrated bundle fresh and cheap to serve, and
`docs/research/steamspy-bulk-alternatives-research-prompt.md` for the open question of whether a
bulk/alternative source for this specific data exists at all.

## Practical implication: gate sort/filter UI on actual data presence

A sort/filter option should not be offered — or should be visibly disabled/hinted — for a dimension
the current library doesn't actually have data for yet. Concretely: if a library's community-tag
coverage is 0% (SteamSpy hasn't hydrated any of these appids), "sort by tag" showing up as a normal,
enabled option is misleading — it'll silently no-op or produce a meaningless order. Tracked as a
someday item in `docs/acts/act4-encore-someday-maybe.md` ("Gate sort/filter UI on data
availability") rather than scoped now — flagging the *need* here since this doc is where "what data
do we actually have, and how reliably" lives, but the UI work itself isn't started.

The natural signal to flip a gate open is exactly the kind of "intake trigger" the app already has
precedent for (e.g. `GameDataReady`, `LibraryManifestReady` events in
`client/src/types/InteractionEvents.ts`) — when a batch of previously-missing tag data lands (via a
fresh Lambda call, or a bundle refresh), that's the moment to re-evaluate whether a previously-gated
option can now be enabled. Not designed here, just noted as the mechanism family to reach for.

## Related
- `docs/research/steam-store-appdetails-cors-research.md` — confirms genres/categories have
  alternate paths; tags do not
- `docs/features/steam-tag-pipeline.md` — the SteamSpy hydration feature itself
- `docs/plans/appdetails-bundle-lambda-plan.md` — automated bundle-freshness plan for the hydrated data
- `docs/research/steamspy-bulk-alternatives-research-prompt.md` — open research: is there a bulk/alternative source for tags at all
- `external-tool/infrastructure/lambda-hydrator-src/index.js` — the only current path to this data
