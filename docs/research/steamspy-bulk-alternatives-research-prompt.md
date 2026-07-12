# Research Brief: Bulk Alternative to SteamSpy Community Tags

> Self-contained brief for a fresh context — you should not need the conversation that produced
> this. Read this whole file before starting; it hands over what's already known so you don't
> re-spend a search round rediscovering it.

## The question

SteamSpy (`steamspy.com/api`) is currently the **only** source this project has for community tags
and review-score data (`steamspy_tags`, `steamspy_top_tags`, `positive`/`negative`/`userscore`,
`owners`). Confirmed (not assumed) elsewhere in this project's docs:

- Steam's own official `appdetails` endpoint does **not** return community tags at all — this isn't
  a fetching gap, the data simply isn't there. See `docs/research/steam-store-appdetails-cors-research.md`.
- SteamSpy's own API enforces roughly **1 request/second** (confirmed via
  `external-tool/infrastructure/lambda-hydrator-src/index.js`'s `STEAMSPY_DELAY_MS = 1100`
  constant and `docs/features/steam-tag-pipeline.md`'s own "~1 req/sec, 13+ minutes for 800 games"
  framing) — no bulk/batch mode found in this project's own prior investigation of the per-appid API.
- A quick round of web search (this session, not exhaustive) found: SteamDB has no official public
  API. Third-party wrappers exist (Anysite, Parse.bot) that bundle SteamDB-sourced tag/genre data,
  but require their own paid API keys/auth — a new third-party dependency and cost, not a free
  drop-in bulk replacement.

**The actual question**: is there *any* way to get Steam community-tag-equivalent data (or
close enough to be useful for sort/filter) in bulk — for many/all appids at once, or as a periodic
downloadable dataset — rather than one rate-limited request per appid forever? This matters because
this is the one dimension in `docs/architecture/sort-filter-data-provenance.md`'s field/source table
with no redundancy and a real, currently-unsolved cold-start cost for any new appid.

## Promising leads worth checking specifically (not yet verified — check these first)

- **SteamSpy's own bulk/"all apps" request types.** SteamSpy has historically offered request types
  beyond the single-appid `appdetails` lookup (e.g. paginated "all owned apps" style endpoints) —
  this project's current hydrator only uses the per-appid form. Check SteamSpy's own API
  documentation (`steamspy.com/api.php`) exhaustively for every documented `request=` value, not
  just the one already in use — a bulk/paginated mode, even if it returns thinner data than the
  per-appid call, might be enough for sort/filter purposes and would sidestep the per-appid rate
  limit entirely for initial coverage.
- **A periodic bulk data dump**, distinct from a live query API — some community game-data sites
  publish a downloadable full dataset (CSV/JSON/SQL dump) specifically to avoid scraping load on
  their live API. Check whether SteamSpy or a similar project (IsThereAnyDeal, IGDB, GiantBomb,
  RAWG.io, Metacritic-adjacent aggregators) offers this, and under what license/rate terms.
- **IGDB** (Twitch/IGDB API) and **RAWG.io** both expose genre/tag-style data with generous free
  tiers and documented bulk/batch query support — worth checking whether their tag taxonomy is
  close enough to Steam's community tags to be useful, and what their actual rate limits are (may
  still beat 1 req/sec by a wide margin even without being "unlimited bulk").
- **Steam's own `ISteamUserStats`/`IPlayerService` or other lesser-known official endpoints** —
  double-check there isn't an official (if obscure) Steamworks endpoint that exposes tags Steam
  shows on its own store pages (Steam *does* display community tags on store pages — the app
  clearly has this data somewhere; the open question is whether any officially-sanctioned endpoint
  surfaces it, versus it only being embedded in the rendered store page HTML/hydration data, which
  would put it in the same category as the `OwnedGames` hydration-blob finding
  `docs/research/steam-profile-ssr-hydration-research.md` already used for ownership data — if tags
  are similarly embedded in a Steam store page's hydration payload, that could be a genuinely new,
  free, first-party path worth its own follow-up).

## Suggested approach (only if using the multi-tier pattern — see note below)

1. **Strategy round**: design a search query set covering the leads above plus general "steam
   community tags bulk API alternative 2026" style queries. Prioritize official/first-party sources
   over third-party scrapers, and bulk/dump-style sources over another per-item rate-limited API
   (which would just relocate the same problem).
2. **Fetch/summarize round**: run the queries, fetch and summarize the most promising results —
   specifically pull out: does it require an API key? What's the actual rate limit or bulk-request
   shape? Is the tag taxonomy close enough to Steam's own community tags to be useful for sort/filter
   (exact match not required, but should be recognizably game-genre/mechanic/theme-flavored, not
   just numeric review scores)? What's the licensing/ToS posture for using it in a hobby project?
3. **Refine round**: based on round 2's findings, narrow to the 1-3 most credible candidates and dig
   deeper — actual API docs, confirmed rate limits (test live if a key-free endpoint exists, the way
   `docs/research/steam-store-appdetails-cors-research.md` verified CORS behavior live rather than
   trusting documentation), and a rough cost/effort estimate for integrating each.
4. **Decision output**: a short verdict — is there a real bulk alternative, and if so which one is
   worth prototyping, or is the honest conclusion "SteamSpy at 1 req/sec via the existing hydrator
   is genuinely the best available option, and the fix is architectural (patience + the bundle-
   freshness plan in `docs/plans/appdetails-bundle-lambda-plan.md`) rather than a new data source"?

**Note on the multi-tier model pattern**: this brief is written to work either as a single-context
research pass (one capable model, several iterative search rounds) or split across model tiers as
originally discussed (a stronger model directs search strategy and synthesizes; a cheaper model
fetches and summarizes individual pages) — pick whichever fits how this context is actually being
run. The multi-tier split earns its overhead most clearly if round 2's results are voluminous enough
that summarizing many individual pages would otherwise burn a lot of the directing model's own
context/reasoning budget on grunt-work reading rather than synthesis.

## What "done" looks like

Not a code change. A short written verdict (append to this file, or a new
`docs/research/steamspy-bulk-alternatives-findings.md`) stating: what was checked, what was found,
and a clear recommendation — pursue a specific alternative, or confirm SteamSpy-via-hydrator is
staying the only path and the real lever is the bundle-freshness plan, not a new source.

## Related
- `docs/architecture/sort-filter-data-provenance.md` — why this specific data matters more than other fields
- `docs/features/steam-tag-pipeline.md` — the existing SteamSpy hydration feature
- `docs/plans/appdetails-bundle-lambda-plan.md` — the freshness/serving plan this research would sit alongside, not replace, if no alternative is found
- `docs/research/steam-store-appdetails-cors-research.md` — the sibling research this one's "verify live, don't trust docs" methodology follows
- `external-tool/infrastructure/lambda-hydrator-src/index.js` — the current (only) implementation
