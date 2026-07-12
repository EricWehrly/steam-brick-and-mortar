# Steam Store `appdetails` API — CORS Reachability from the Bookmarklet

**Purpose**: answers a specific question raised while wrapping up the manual-import work: is entity
data (categories, genres, description) — today only obtained via our Lambda's `BatchAppDetailsClient`
— *also* reachable directly from the manual-export bookmarklet's execution context, the same way
`OwnedGames` ownership data already is? See
[`../archive/manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md)
for the existing bookmarklet, and [[library-game-appid-metadata-duplication]] in `docs/tech-debt.md`
for the debt entry this bears on.

**Verified**: 2026-07-11, live, via a real browser session and by reading the Lambda's own source
(not assumed from documentation).

**Status**: research only, not commissioned as a build. Current read: a real, working capability,
but a "nice to have" — see [Recommended next step](#recommended-next-step).

---

## The question

`docs/research/steam-api-research.md` documents that `api.steampowered.com` (the keyed Web API) has
no CORS headers and is blocked from any browser origin — confirmed, and the reason our Lambda proxy
exists at all. But that research never tested `store.steampowered.com/api/appdetails` — the
*public*, unauthenticated Store API endpoint that actually returns categories/genres/description,
and the same endpoint `rust-cors-bypass-spike.md` proposes calling from Rust specifically *because*
it assumed no CORS (desktop-only). That assumption was never verified for the browser case.

## Finding 1: CORS depends entirely on the calling origin

Tested `fetch('https://store.steampowered.com/api/appdetails?appids=440')` from two origins:

| Calling origin | Result |
|---|---|
| `http://localhost:5173` (our own app) | **Blocked.** `TypeError: Failed to fetch` — no readable response, standard CORS rejection. |
| `https://steamcommunity.com` (where the bookmarklet runs) | **Succeeds.** `200`, `type: 'cors'`, full JSON body (name, categories, genres, description, etc.) |

So our own app can never call this endpoint directly — that part of the desktop spike's assumption
holds. But a script running **in the bookmarklet's actual execution context** (same-origin with
`steamcommunity.com`, since that's where the user clicks it) can. This is presumably because
Valve's own client-side store-embed widgets on `steamcommunity.com` call this endpoint themselves,
so `store.steampowered.com` allow-lists `steamcommunity.com` (and likely sibling Steam domains)
specifically — not a general CORS-open API.

## Finding 2: multi-appid batching exists but only returns price

`fetch('...api/appdetails?appids=440,620')` with no `filters` param returns **`400`, body `null`**.
But per Steam's own (undocumented, community-known) requirement, adding `filters=price_overview`
makes multi-appid requests succeed — **confirmed live**: `appids=440,620&filters=price_overview`
returns `200` with `price_overview` data for both appids. The catch: **that filter is the only
value accepted for multi-appid requests.** Categories, genres, description, developers,
etc. are unavailable in the batched form — confirmed by Steam's own API behavior, not just
absent from our test. Getting the data we actually want (categories/genres) still requires one
request per appid, exactly like our Lambda's own `BatchAppDetailsClient` already assumes.

## Finding 3: Steam does rate-limit this endpoint — confirmed, not hypothetical

Read the Lambda's own source (`external-tool/infrastructure/lambda-src/services/steam-api.js`)
rather than guessing: `getAppDetails()` has a dedicated `error.response?.status === 429` branch with
exponential backoff (`1000 * 2^retryCount`, capped at 8s, up to 3 retries) — **this code exists
because Steam has actually returned 429s to our Lambda for this exact endpoint.** That settles the
"is this a real risk" question my first pass in this doc left open: yes, confirmed, not just
community lore.

The Lambda paces itself with its own `RateLimiter` (`external-tool/infrastructure/lambda-src/services/RateLimiter.js`):
**max 5 concurrent requests, 200ms enforced delay between each** (`new RateLimiter(5, 200)` in
`steam-api.js`). That's the closest thing we have to a known-safe cadence for this endpoint — not
a guess, the actual number our own infrastructure already uses successfully against it.

## Finding 4: rough per-request cost

Five sequential single-appid calls from `steamcommunity.com`: two hit browser HTTP cache (same
appid repeated, 2-3ms), three cold: **68ms, 69ms, 106ms** (avg ~80ms cold). Combined with the
Lambda's 200ms-between-requests pacing (Finding 3) as a safe reference point, a client-side
sequential fetch loop at a similar cadence would cost roughly **200-300ms per game** — for an
800-game library, that's **~3-4 minutes** of active fetching, not the ~1 minute a naive
no-pacing estimate would suggest. Concurrency (the Lambda's "5 at once") is a materially different
risk profile from a single browser tab doing it serially for one user — safer to stay sequential
and lean on the delay, not the concurrency, if this is ever built.

## Finding 5: no bulk third-party alternative either

Checked whether SteamDB or similar sites expose a free bulk endpoint that sidesteps the one-per-
request limitation. **SteamDB has no official public API.** Third-party wrapper services
(Anysite, Parse.bot) do offer bulk-ish endpoints with categories/genres included, but require their
own API keys/auth — a new third-party dependency and ToS surface, not a "just fetch it" option, and
not in keeping with this channel's zero-third-party-dependency posture. Not a viable shortcut.

## Finding 6: bookmarklet size headroom

Checked actual browser ceilings for `javascript:` bookmarklet length: **Chrome effectively
unlimited** (~10M characters); **Firefox and Safari hard-cap at 65,536 bytes** — Firefox refuses to
save longer ones, Safari saves but silently no-ops when triggered. The current
`export-library.js`, crude-minified (comments/whitespace stripped, roughly matching what
`yarn build:bookmarklets` produces) and percent-encoded as a `javascript:` URI, comes to **~16,000
characters — about a quarter of the Firefox/Safari ceiling.** Real headroom exists today, but it's
finite, not unlimited — worth checking again if a second revision adds a meaningful amount of code
(fetch loop, backoff, tab-switch logic). If it ever gets tight, the standard mitigation is an
external script loader (a short bookmarklet that fetches and `eval`s the real logic from our own
origin) rather than inlining everything — a pattern shift, not just a size optimization.

## Gap analysis: what's missing without the Lambda at all

If the Lambda were entirely unreachable and the bookmarklet never queried `appdetails` (today's
actual state), here's exactly what's lost, sourced from the confirmed field inventory in
[`steam-profile-ssr-hydration-research.md`](steam-profile-ssr-hydration-research.md) (`OwnedGames`)
vs. `AppDetailsData`'s shape (`client/src/steam/batch/BatchAppDetailsClient.ts`):

**Already captured from `OwnedGames` (zero Lambda, already in `ImportedGame`)**: appid, name,
playtime_forever, playtime_disconnected, rtime_last_played, capsule_filename (inconsistent format),
has_dlc/has_workshop/has_market/has_community_visible_stats/has_leaderboards, content_descriptorids,
img_icon_url. Artwork itself doesn't need appdetails either — `deriveArtworkFromAppId` already
derives usable header/library URLs from the appid alone, no network call.

**Only from `appdetails` (Lambda today, or a bookmarklet-side single-appid fetch per this doc)**:
categories, genres, developers, publishers, release_date, metacritic score, short_description,
canonical `type`/`is_free`, and the richer artwork variants (capsule_v5, background). This is the
real, meaningful gap — categories/genres specifically feed the GameSort sorting north star, so
this isn't a cosmetic loss.

**Only from SteamSpy (`steamspy.com/api`), not Steam's `appdetails` at all, and NOT reachable via
this CORS finding**: `steamspy_tags`/`steamspy_top_tags` (community tags), and the
positive/negative/userscore/owners fields when SteamSpy-sourced. Confirmed via
[`../features/steam-tag-pipeline.md`](../features/steam-tag-pipeline.md): SteamSpy's own rate limit
is ~1 request/second — 13+ minutes for an 800-game library, which is *why* that feature already
uses a background Lambda pre-hydration pattern rather than per-client fetching. Nothing in this
doc's findings changes that calculus; SteamSpy tags stay Lambda/background-pipeline-only regardless
of what the bookmarklet can reach.

## A credible shape for this, if ever built (not a commitment)

The tension is real: fast enough that the user doesn't think the bookmarklet hung, slow enough not
to trip Steam's confirmed rate limit (Finding 3). One approach worth recording, discussed while
writing this up: don't make the user sit and watch a loading bar on the Steam tab at all — after
ownership capture completes (today's fast part, unchanged), programmatically switch focus back to
a normal Steam browsing tab (or the app's own tab) while a background loop on the captured-data tab
works through the sequential appdetails fetches at the Lambda-derived cadence (Finding 3), the same
"dynamic and batched" shape `GamesLoader.loadGamesProgressively` already uses for the online path —
partial results usable immediately (`GamesLoader.enrichFromCache` already tolerates incomplete
entity data gracefully), full results whenever the loop finishes. The bookmarklet's tab currently
closes when export completes; that behavior would need to change to closing only once the
background enrichment loop finishes (or the user navigates away), not immediately after ownership
capture. This is a real, buildable design — flagged here so it isn't re-derived from scratch if
picked up later, not proposed as scoped work.

## Revisit after desktop app game-sourcing lands

The desktop app's Rust side has no CORS restriction at all (`rust-cors-bypass-spike.md`) — once
local Steam-files/desktop sourcing is implemented, it may become the natural home for full,
unrestricted entity enrichment (no per-request pacing tightrope, no bookmarklet-size ceiling), which
could make this web-bookmarklet-side effort lower priority than it looks today, or could reframe it
as "good enough for the web path, desktop gets the rich path." `traffic-safety-review.md` frames the
"kills ownership + enrichment traffic on desktop" desktop story already — worth a pass to fold this
web-side finding in once desktop sourcing is real, not before.

## Recommended next step

Not a code change. If this gets picked up: a standalone scale test (50-100+ sequential
`store.steampowered.com/api/appdetails` requests from a real `steamcommunity.com` tab, at roughly
the Lambda's own 200ms cadence, watching for `429`s) would confirm or refute Finding 3's safe-cadence
assumption at real volume before committing to a "bookmarklet revision 2" implementation plan. That
test needs no app changes — it can run standalone in a browser console.

## Related
- [`../archive/manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md) — the original capture feasibility study this extends
- [`steam-profile-ssr-hydration-research.md`](steam-profile-ssr-hydration-research.md) — the sibling research for the ownership-data (`OwnedGames`) capture mechanism
- [`../plans/rust-cors-bypass-spike.md`](../plans/rust-cors-bypass-spike.md) — the desktop-side equivalent capability (Rust has no CORS at all, so this constraint doesn't apply there)
- [`steam-api-research.md`](steam-api-research.md) — the original CORS finding for `api.steampowered.com` (the *keyed* Web API — different surface, still fully blocked)
- [`../features/steam-tag-pipeline.md`](../features/steam-tag-pipeline.md) — why SteamSpy tags stay out of scope for this channel regardless
- `docs/tech-debt.md` → [[library-game-appid-metadata-duplication]] — the gap this would close
- `external-tool/infrastructure/lambda-src/services/steam-api.js` / `RateLimiter.js` — the server-side pacing this doc's cadence recommendation is derived from
