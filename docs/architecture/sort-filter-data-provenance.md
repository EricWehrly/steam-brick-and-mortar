# Sort/Filter Data Provenance

**Purpose**: this is meant to become the source-of-truth a **data-driven sort/filter availability
mechanism** reads from — not just a reference for humans. The intended shape: as the app engages
with a data source (a Lambda call lands, a bundle refreshes, a desktop local-file scan runs), the
corresponding row(s) here flip from "not yet available" to "available," and that's what drives
which sort/filter options are actually offered in-app. Update this doc whenever a new sort/filter
dimension is added or an existing one's data source changes — it's the spec, not an afterthought
written after the fact.

## Why this exists

Not every sort/filter dimension costs the same to populate, and — this is the part easy to lose
track of — **not every dimension is even reachable from every channel.** Some fields are free
(already in Steam's ownership payload, no extra fetch ever, any channel). Some are cheap (Steam's
own `appdetails`, one request per new appid, cached forever after). One is expensive with no bulk
alternative today (SteamSpy community tags). And at least one is **channel-exclusive** — reachable
from desktop's local-file access and *nowhere else*, not slower on web, not degraded on web,
genuinely absent. That last category is the one this doc most needs to get right, because it's
where "just disable the option until the data shows up" stops being enough and "this option may
never exist on this channel" becomes the honest answer.

## The table

| Sort/filter dimension | Field(s) | Source | Channel | Cost / availability |
|---|---|---|---|---|
| By name | `name` | Ownership payload (`GetOwnedGames` / bookmarklet `OwnedGames`) | Web + desktop | Free, always present |
| By playtime | `playtime_forever` | Ownership payload | Web + desktop | Free, always present |
| By last played | `rtime_last_played` | Ownership payload | Web + desktop | Free, present if ever played |
| By genre | `genres` | Steam `appdetails` (Lambda-proxied, or bookmarklet-direct per `steam-store-appdetails-cors-research.md`) | Web + desktop | One request per new appid, cached forever (S3 + client `AppDetailsCache`) once fetched |
| By category (Co-op, Controller Support, etc.) | `categories` | Steam `appdetails`, same as genre | Web + desktop | Same as genre |
| By developer/publisher | `developers` / `publishers` | Steam `appdetails` | Web + desktop | Same as genre |
| By community tag | `steamspy_tags` / `steamspy_top_tags` | **SteamSpy** (`steamspy.com/api`), via the hydrator Lambda **or**, as of the [Rust CORS/Lambda Bypass Spike](../plans/rust-cors-bypass-spike.md), a direct desktop fetch | Web (Lambda-only) + desktop (Lambda or direct Rust fetch) | **~1 request/second enforced (`STEAMSPY_DELAY_MS = 1100`), no bulk endpoint, no alternative confirmed yet.** The constraint is latency, not access — see below |
| By review score | `positive`/`negative`/`userscore`/`owners` | SteamSpy, same path as tags | Web + desktop | Same as tags |
| **By user category** | user-defined collection/category buckets | **Local Steam install only** — `cloud-storage-namespace-1.json` (see `docs/features/local-file-investigation.md`) | **Desktop-only, no web path exists** | Paused/deferred (AC4.4 target, but see note below) — not a rate-limit problem, a channel-access problem: the web client cannot reach this file at all, full stop |

## Two different kinds of "we don't have this yet"

These need different UI treatment, which is exactly why collapsing them into one generic "gate if
missing" idea would lose the distinction that matters:

1. **Not-yet-fetched, but reachable** (genres, categories, tags, review score) — the data exists
   somewhere the app can eventually reach; the gate opens once a fetch lands. Transient, resolves
   itself as caches warm.
2. **Channel-exclusive, not reachable at all on this build** (user categories, and likely more once
   desktop local-file mining expands — see below) — no amount of waiting fixes this on web. The
   honest UI treatment isn't "disabled until data arrives," it's closer to "only available in the
   desktop app" — a different message entirely, and worth designing for as its own case rather than
   a slower version of case 1.

**This is expected to grow, not just stay at one row.** `local-file-investigation.md` already
identifies other local signals beyond categories (install state, local playtime/last-played
signals, cloud/controller state) as lower-priority but real — each one that gets productized adds
another Desktop-only row here. The web/desktop line in the Channel column isn't a one-off footnote;
it's the column this table exists to make legible as that list grows.

## The other real gap: SteamSpy is a single point of dependency (within the channels it does reach)

Genre/category/developer/publisher all come from Steam's own `appdetails` — a first-party source,
reachable multiple ways (Lambda, or directly from the bookmarklet's `steamcommunity.com` execution
context per `docs/research/steam-store-appdetails-cors-research.md`), and already fully baked into
every release (`release-pipeline-plan.md`'s S3 bake). Redundant, low-risk, effectively solved.

**Tags and review-score data have exactly one source: SteamSpy, exactly one path to it (the
hydrator Lambda), and no confirmed alternative** — but unlike user categories, this isn't a
channel-exclusivity problem, it's a *rate* problem: reachable from any channel, just slow and
incremental. `docs/research/steam-store-appdetails-cors-research.md` confirmed Steam's own
`appdetails` endpoint doesn't carry community tags at all — that's not a gap in our fetching, it's
absent from the data Steam itself serves. A library containing an appid SteamSpy hasn't hydrated
yet has no tag data, full stop, until the hydrator gets to it.

**Status: active on multiple parallel tracks**, not paused waiting on one thing. The direct desktop
fetch ([Rust CORS/Lambda Bypass Spike](../plans/rust-cors-bypass-spike.md)) proves calling SteamSpy
client-side is viable, but doesn't by itself fix the several-minutes-per-library latency — that's
being pursued via: a bulk-snapshot bundle from the hydrator's accumulated data
(`docs/plans/appdetails-bundle-lambda-plan.md`), the progressive-gate mechanism below, a renewed
bulk-alternative search (`docs/research/steamspy-bulk-alternatives-research-prompt.md`, no longer
blocked on local-file investigation reporting back first), and — considered the best bet —
desktop local-file data mining (`local-file-investigation.md`), which may surface a tag-equivalent
local source and sidestep SteamSpy for desktop users entirely.

## How this table is meant to drive the gate (not designed yet, described here so it isn't lost)

The mechanism itself isn't built. The intended shape: each row's "available" state is derived at
runtime from whatever the app actually knows for the *current* library/session — e.g. simply "is this
a desktop build" for channel-exclusive rows. An existing app "intake" event (e.g. `GameDataReady`,
`LibraryManifestReady` in `client/src/types/InteractionEvents.ts`) is the natural signal to
re-evaluate gates when new data lands — not a new event type, reuse what already marks "something
just arrived." Tracked as a someday item in `docs/acts/act4-encore-someday-maybe.md` ("Gate sort/filter
UI on data availability"); this doc is the spec that work would consume, not a separate concern from it.

**The community-tag row specifically wants a coverage-percentage threshold, not a binary gate** — a
concrete, currently-favored shape: "has the hydrator (or, on desktop, a direct SteamSpy fetch)
successfully tagged ≥N% of this library's appids" (N is a product call, not yet pinned — 50% has been
floated as a reasonable starting point). Below the threshold, the sort/filter option stays hidden or
disabled exactly like any other not-yet-fetched row; once crossed, it activates even though some
appids remain untagged (those just don't participate in a tag-based sort/filter, same as any missing
field elsewhere in this table). This directly addresses the SteamSpy latency problem
(`docs/plans/traffic-safety-review.md` / `docs/plans/rust-cors-bypass-spike.md`) — the feature doesn't
have to wait for a multi-minute serial fetch to finish, just for it to get "far enough."

## Related
- `docs/research/steam-store-appdetails-cors-research.md` — confirms genres/categories have
  alternate paths; tags do not
- `docs/features/steam-tag-pipeline.md` — the SteamSpy hydration feature itself
- `docs/features/local-file-investigation.md` — the only channel-exclusive row today (user
  categories), and where more are likely to come from
- `docs/plans/appdetails-bundle-lambda-plan.md` — automated bundle-freshness plan for the hydrated data
- `docs/research/steamspy-bulk-alternatives-research-prompt.md` — active research: is there a bulk/alternative source for tags at all
- `docs/plans/rust-cors-bypass-spike.md` — the direct desktop-to-SteamSpy fetch path (a second path to this data, alongside the hydrator)
- `docs/plans/traffic-safety-review.md` — why SteamSpy's rate limit is a latency problem, not a traffic-safety one
- `external-tool/infrastructure/lambda-hydrator-src/index.js` — the Lambda-side path to SteamSpy data
