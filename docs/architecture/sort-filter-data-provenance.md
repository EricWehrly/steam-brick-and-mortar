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
| By community tag | `steamspy_tags` / `steamspy_top_tags` | **SteamSpy** (`steamspy.com/api`), via the separate hydrator Lambda (`external-tool/infrastructure/lambda-hydrator-src`) | Web + desktop (same Lambda path either way) | **~1 request/second enforced (`STEAMSPY_DELAY_MS = 1100`), no bulk endpoint, no alternative confirmed yet — see below |
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

**Status: paused.** `docs/research/steamspy-bulk-alternatives-research-prompt.md` (the research into
whether a bulk alternative exists) is intentionally on hold until the desktop local-file
investigation (`local-file-investigation.md`) resumes and reports back — it's plausible desktop
data-mining changes this calculus entirely (either by surfacing tag-equivalent data locally, or by
clarifying that it doesn't and the online-source research is worth resuming). See
`docs/plans/appdetails-bundle-lambda-plan.md` for the freshness/serving plan that stays useful
regardless of how that research lands.

## How this table is meant to drive the gate (not designed yet, described here so it isn't lost)

The mechanism itself isn't built. The intended shape: each row's "available" state is derived at
runtime from whatever the app actually knows for the *current* library/session — e.g. "has the
hydrator ever successfully tagged ≥N% of this library's appids" for the community-tag row, or
simply "is this a desktop build" for channel-exclusive rows. An existing app "intake" event (e.g.
`GameDataReady`, `LibraryManifestReady` in `client/src/types/InteractionEvents.ts`) is the natural
signal to re-evaluate gates when new data lands — not a new event type, reuse what already marks
"something just arrived." Tracked as a someday item in `docs/acts/act4-encore-someday-maybe.md`
("Gate sort/filter UI on data availability"); this doc is the spec that work would consume, not a
separate concern from it.

## Related
- `docs/research/steam-store-appdetails-cors-research.md` — confirms genres/categories have
  alternate paths; tags do not
- `docs/features/steam-tag-pipeline.md` — the SteamSpy hydration feature itself
- `docs/features/local-file-investigation.md` — the only channel-exclusive row today (user
  categories), and where more are likely to come from
- `docs/plans/appdetails-bundle-lambda-plan.md` — automated bundle-freshness plan for the hydrated data
- `docs/research/steamspy-bulk-alternatives-research-prompt.md` — paused research: is there a bulk/alternative source for tags at all
- `external-tool/infrastructure/lambda-hydrator-src/index.js` — the only current path to SteamSpy data
