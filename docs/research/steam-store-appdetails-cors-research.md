# Steam Store `appdetails` API — CORS Reachability from the Bookmarklet

**Purpose**: answers a specific question raised while wrapping up the manual-import work: is entity
data (categories, genres, description) — today only obtained via our Lambda's `BatchAppDetailsClient`
— *also* reachable directly from the manual-export bookmarklet's execution context, the same way
`OwnedGames` ownership data already is? See
[`../archive/manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md)
for the existing bookmarklet, and [[library-game-appid-metadata-duplication]] in `docs/tech-debt.md`
for the debt entry this bears on.

**Verified**: 2026-07-11, live, via a real browser session (not assumed from documentation).

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

## Finding 2: one appid per request, not batched

`fetch('...api/appdetails?appids=440,620')` (comma-separated, the syntax our own
`BatchAppDetailsClient` fans out server-side) returns **`400`, body `null`** from the browser too.
The endpoint is single-appid only regardless of caller. This matches why our Lambda's own batch
client rate-limits and fans out one-at-a-time server-side rather than trusting a multi-id query.

## Finding 3: rough per-request cost

Five sequential single-appid calls from `steamcommunity.com`: two hit browser HTTP cache (same
appid repeated, 2-3ms), three cold: **68ms, 69ms, 106ms** (avg ~80ms cold). At that rate, 800
sequential requests would take roughly a minute of pure request time if nothing throttles — but
this is **not verified at scale**. A 5-request sample cannot reveal a rate limit that only trips
under sustained load; Steam's Store API is widely believed (community tooling, not verified here)
to throttle aggressive sequential access from one IP. This needs an actual large-N test (running
50-100+ sequential requests and watching for `429`s or slowdown) before trusting it for a real
800-game library.

## What this means for the bookmarklet

The user's instinct was right, and better than "visit a second page" — no second page navigation
needed at all, just additional `fetch()` calls from the *same* execution the ownership capture
already runs in. This would let the bookmarklet capture real categories/genres/description directly
from the user's own session, with **zero Lambda involvement**, closing the gap
[[library-game-appid-metadata-duplication]] describes (where `capsule_filename`/`has_dlc`/etc. are
captured but have nowhere to go because there's no non-Lambda-sourced entity store).

But the shape of the work is materially different from "add a field to the existing capture," which
is why this is a research doc and not a code change:

- **Traffic profile changes.** Today's bookmarklet is one page-load capture, zero extra requests -
  in scope for [[traffic-safety-review]]'s "kills ownership traffic on web" framing. Fetching entity
  data for a full library is potentially hundreds of sequential requests **from the user's own
  logged-in browser session** - a real behavior-pattern-toward-Steam question, not just a technical
  one, and untested at the volume that would matter.
- **UX changes.** An instant download becomes a multi-request, possibly multi-second-to-minute
  operation depending on library size and any throttling encountered. Needs a progress state,
  probably a way to bail out partway (partial entity data is still strictly better than none, given
  the existing `GamesLoader.enrichFromCache` design already tolerates partial/missing entity data
  gracefully), and pacing between requests to not hammer Steam's servers even if nothing throttles
  us first.
- **Where the result goes** is already solved: [[library-game-appid-metadata-duplication]] already
  specifies "capture at the wire layer, build a real appid-keyed store when a concrete feature needs
  it" - this finding is exactly that concrete feature. The store this would feed is *not*
  `AppDetailsCache` as-is (that's fed only by the Lambda's batch endpoint today and conflating the
  two sources adds its own questions - schema differences, which source wins on conflict, etc.) -
  worth its own small design pass, not assumed.

## Recommended next step

Not a code change yet. Worth a proper feasibility pass (mirroring how
[`../archive/manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md)
was scoped originally) that specifically tests the rate-limit question at real scale (50-100+
sequential requests, watching for `429`/slowdown) before committing to a "bookmarklet revision 2"
implementation plan. That test can run standalone in a Steam tab, no app changes required.

## Related
- [`../archive/manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md) — the original capture feasibility study this extends
- [`steam-profile-ssr-hydration-research.md`](steam-profile-ssr-hydration-research.md) — the sibling research for the ownership-data (`OwnedGames`) capture mechanism
- [`../plans/rust-cors-bypass-spike.md`](../plans/rust-cors-bypass-spike.md) — the desktop-side equivalent capability (Rust has no CORS at all, so this constraint doesn't apply there)
- [`steam-api-research.md`](steam-api-research.md) — the original CORS finding for `api.steampowered.com` (the *keyed* Web API — different surface, still fully blocked)
- `docs/tech-debt.md` → [[library-game-appid-metadata-duplication]] — the gap this would close
