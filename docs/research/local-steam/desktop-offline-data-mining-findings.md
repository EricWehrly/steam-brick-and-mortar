# Desktop Offline Data Mining — Findings (Single-Machine Probe, spitemonger)

## Scope

Follow-up to `local-steam-buckets-findings.md`, refocused on what the **desktop app**
specifically can get: unlike a browser's File System Access API, Tauri has unrestricted
filesystem access, so the `Program Files` sandbox block that shaped the earlier research no
longer applies. This probe re-walks the same install (`SpiteMonger`, steamid64
`76561197984589530`) with four questions from the desktop-app angle:

1. What can be read **silently** (no user file picker) from `C:\Program Files (x86)\Steam` and
   `%LOCALAPPDATA%\Steam`?
2. Do we already have reusable VDF-parsing tooling from the props/source-extract work?
3. Can the bundled appdetails-cache + artwork-CDN "seed" bundle be amended from local files at
   runtime?
4. Can we get user identity, playtime/last-played, user categories, and profile showcase
   configuration offline?

All paths below are Windows; `%LOCALAPPDATA%\Steam` is a second root distinct from the Steam
install directory and easy to miss if you only look in `Program Files`.

## 0. Correction: no reusable VDF (KeyValues) tooling exists yet

The props work in `desktop/source-extract/` (`scripts/vpk.py`, `tools/vpkedit.zip`) parses
**VPK** (Valve PaK — Source engine game asset archives), not **VDF** (Valve Data Format /
KeyValues — Steam's own config file format used by `loginusers.vdf`, `localconfig.vdf`,
`appinfo.vdf`, etc.). They are unrelated formats that happen to share the "Valve archive-ish
file" vibe and a superficially similar name. `vpk.py` never parses KeyValues text — the one
place it touches `libraryfolders.vdf`-like data, it doesn't even parse it (game install paths
are hardcoded in `games.json`).

**There is currently no VDF/KeyValues parser anywhere in this codebase.** One needs to be
written or pulled in. Two flavors are needed:

- **Text KeyValues** (`loginusers.vdf`, `localconfig.vdf`, `libraryfolders.vdf`,
  `appmanifest_*.acf`) — trivial grammar, nested `"key" "value"` / `"key" { ... }`, no arrays,
  no types. A ~50-line hand-rolled parser is entirely reasonable; several small MIT-licensed
  JS/Rust implementations exist too (`vdf-parser`, `keyvalues-parser` crate) if reuse is
  preferred over hand-rolling.
- **Binary KeyValues** (`appinfo.vdf`, `packageinfo.vdf`) — a distinct, versioned binary format
  (magic `0x07564429` for the appinfo variant seen here) with typed fields and, in this Steam
  client version, a de-duplicated trailing string table. This one is worth reusing rather than
  reimplementing: it's the same format SteamKit2 (C#) and ValvePython's `vdf` package (Python,
  `vdf.binary_loads`) already parse, including the string-table variant. If the desktop app
  ends up needing this in Rust, `node-steam`/`steamkit`-derived Rust crates (e.g. `steamworks`
  ecosystem forks) or a small ground-up implementation informed by SteamKit2's `KVBinaryReader`
  are the paths to look at — not worth hand-deriving the format from scratch given prior art
  exists.

## 1. Identity — `config/loginusers.vdf` (confirmed, matches prior research)

`C:\Program Files (x86)\Steam\config\loginusers.vdf`, text KeyValues:

```
"users" { "76561197984589530" { "AccountName" "hornisyco" "PersonaName" "SpiteMonger"
  "MostRecent" "1" "Timestamp" "1783642872" ... } }
```

SteamID64, account name, persona (display) name, and a `MostRecent` flag to pick the active
profile when multiple accounts have logged in on the machine. Zero network calls. Confirms the
finding already recorded in `local-file-investigation.md`'s Identity-from-disk story.

## 2. Playtime / last-played — `userdata/<id>/config/localconfig.vdf`

Nested under `UserLocalConfigStore.Software.Valve.Steam.apps.<appid>`:

```
"92" { "LastPlayed" "1358150400"  "Playtime" "13" }
```

`LastPlayed` is a Unix timestamp, `Playtime` is minutes — same semantics as the
`GetOwnedGames` web API's `rtime_last_played` / `playtime_forever`. This is **not a new
capability** (the provenance table already marks these fields "Free, always present" via the
ownership payload on both channels) but it does confirm the desktop app has a fully offline,
zero-network path to the same numbers if it ever needs to work before/without an ownership
fetch (e.g. showing last-session state at cold start).

## 3. User categories/collections — `userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json`

**Directly confirmed with the user's real data.** Searched for both categories named in this
investigation:

- `user-collections.from-tag-Ze Done` → `{"id":"from-tag-Ze Done","name":"Ze Done","added":[304410,220,240,...]}`
- `user-collections.from-tag-Meh` → `{"id":"from-tag-Meh","name":"Meh","added":[...]}`

Both present, both trivially matched by name (no false-positive risk from the "Meh" search —
it's a distinct top-level `user-collections.from-tag-*` key, not a substring hit inside
something else). Each collection is a JSON string (needs one extra `JSON.parse`, it's
double-encoded) with `id`, `name`, and `added` (a flat array of raw appids). This matches and
directly validates the "High confidence" rating already given to this bucket in
`local-steam-buckets-findings.md` — this probe just confirms it with real, named data instead
of an anonymized coverage count.

This is unambiguously the best local source for the channel-exclusive "by user category" row in
`sort-filter-data-provenance.md`. No format surprises from the earlier research.

## 4. "Showcases" — same file, different concept than what we were looking for

`cloud-storage-namespace-1.json` also has `showcases.*` keys, which looked promising for the
profile showcase widget but turned out to be something else:

```
showcases.0     → {"strCollectionId":"type-games","eSortBy":8,"bExpanded":true,...}
showcases.1572634595633 → {"strCollectionId":"favorite","eSortBy":8,"bExpanded":true,...}
showcases.3     → {"strCollectionId":"play-next","eSortBy":1,"bExpanded":false,...}
```

These are **Steam client Library-tab collection-panel display state** (which built-in dynamic
collections — recent games, by type, favorites, play-next — are pinned/expanded/sorted-how in
the left-hand Library UI), not the public community-profile "Favorite Game(s)" showcase widget.
Same word, unrelated feature. Worth remembering so a future search doesn't stop here thinking
the profile showcase question is answered.

**The actual community-profile showcase was not found locally.** It's profile-customization
data that lives server-side (part of the profile theme/customization system, same family as
featured screenshots, badges, etc.). No local cache of it turned up in `userdata/` or
`config/`. Two remaining avenues, neither confirmed:
- An undocumented `IPlayerService`/profile-customization Web API endpoint (would need
  discovery — not attempted here, out of scope for a local-file probe).
- The CEF browser cache (`%LOCALAPPDATA%\Steam\htmlcache`, see below) *might* have a stale
  rendered copy if the user's own profile was ever opened in Steam's embedded browser, but
  that's opportunistic at best.

**Open item, not resolved by this probe** — flagging rather than pursuing further per the
"don't need to be exhaustive" scoping for this pass.

## 5. New find: per-app achievement cache — `appcache/librarycache/<appid>.json`

Not in the original bucket list. 552 JSON files in this install
(`userdata/<id>/config/librarycache/` — user-scoped — has a parallel set too), one per appid,
e.g. `1016180.json`:

```json
[["achievements",{"version":2,"data":{
  "vecUnachieved":[{"strID":"ACH_1000_CIVILIANS","strName":"Terror Rising",
    "strDescription":"Kill 1,000 civilians.","strImage":"https://cdn.steamstatic.com/...",
    "bAchieved":false,"flAchieved":72.5,"flCurrentProgress":735,"flMaxProgress":1000}, ...],
  "nTotal":30,"nAchieved":0}}]]
```

Per-achievement name, description, global-completion percentage, the user's own
achieved/unlocked state and progress, and the CDN image URL for the achievement icon — fully
cached locally, no network call. Not on this investigation's original target list, but exactly
the kind of "noticed on the way" signal worth recording: achievements/completion percentage
could be a future sort/filter or showcase dimension, and it's *free* once a game has been
launched at least once (this cache is populated by the client, not by us).

## 6. Store-metadata seed question — `appcache/appinfo.vdf` (parsed and verified this pass)

This is the one relevant to point 3 of the investigation (amending the bundled
appdetails-cache + artwork-CDN seed at runtime from local data). Unlike the first pass at this
doc, this section is now backed by an actual byte-exact parse, not a field-name guess.

`C:\Program Files (x86)\Steam\appcache\appinfo.vdf` — 7.9 MB, binary KeyValues, magic
`0x07564429` (the "string-table" appinfo variant: keys are `uint32` indices into a
de-duplicated string table appended after all 3,022 app entries in this install; string
values remain inline). No off-the-shelf Python library handles this specific variant
(ValvePython's `vdf.binary_loads` doesn't do the string-table indirection, and `pip install
steamfiles` failed to build in this environment) — **a one-off ~150-line Python decoder was
hand-written for this research pass** (header → per-app `{appid, size}` framing → trailing
string table → recursive typed KV tree with key-as-index lookups). Verified byte-exact:
parsing each of 4 known appids (Portal 2/620, TF2/440, Portal/400, Half-Life 2/220) consumed
exactly the declared entry `size`, landing precisely on the next entry's boundary every time —
strong confidence the format is understood correctly, not just plausible-looking.

**This script is throwaway research tooling** (Python, lives in the session scratchpad, never
committed) — it answers "what's really in this file" for this investigation, but it is *not*
what ships in the desktop app. See the VDF-tooling note in §0: the desktop app needs a
dependency-free (i.e. not-Python) reader, most realistically Rust given Tauri's native side.
The format is now de-risked for that follow-up — the byte-exact validation above means a Rust
port is a translation exercise, not a research problem.

Real decoded `common` block for Portal 2 (620), trimmed to the interesting fields:

```json
{
  "name": "Portal 2", "type": "game", "oslist": "windows,macos,linux",
  "controller_support": "full", "primary_genre": 1, "genres": {"0": 1, "1": 25},
  "category": {"category_2": 1, "category_9": 1, "category_22": 1, "...": "36 more flags"},
  "review_score": 9, "review_percentage": 98,
  "store_tags": {"0": 4182, "1": 1625, "2": 1664, "...": "20 ranked tag IDs"},
  "steam_deck_compatibility": {"category": 3, "...": "verified/playable/unsupported + test detail"},
  "metacritic_score": 95, "metacritic_fullurl": "https://www.metacritic.com/game/pc/portal-2?..."
}
```

`developer`/`publisher` are not flat strings in `common` — they're `associations: [{type:
"developer", name: "Valve"}, {type: "publisher", name: "Valve"}]`, and a parallel flat
`extended.developer` / `extended.publisher` also exists (redundant, both correct in this
sample). `extended` also carries `homepage`, `listofdlc` (comma-separated appids), and
per-platform `languages` strings — none of that is in the current data model at all.

### Genres and categories: same underlying concept as `appdetails`, not new data — but IDs, not names

`genres`/`primary_genre` and `category_N` are **numeric IDs**, not the human-readable strings
`appdetails.genres` / `appdetails.categories` already return (`[{id, description}]`). Steam's
`appdetails` endpoint already gives us these as ready-to-use strings; this local source gives
the *same conceptual data* but needs an extra ID→name lookup table to become useful, and that
table is **not present in `appinfo.vdf` itself** for genres or categories (see below — it does
exist for tags). A genre/category ID→name table is small and stable across the whole catalog
(Steam has ~30 genres, ~90 categories total) but wasn't located locally in this pass; it would
need to be sourced once (e.g. from SteamKit2's published enum, or scraped once from any app's
`appdetails` response and cached as a static asset) rather than re-derived per install.

**Bottom line on genres/categories: redundant with `appdetails`, already "solved" per this
doc's own provenance table** (`sort-filter-data-provenance.md` already calls this row
"Redundant, low-risk, effectively solved" for the web+desktop appdetails path). The value here
isn't new data — it's *zero-fetch* data: population before or without ever calling
`appdetails`, which matters for desktop cold-start/offline behavior, not for filling a gap the
web channel has.

### Community tags: this is the actual find — `store_tags` + `appcache/localization.vdf`

This is different from genres/categories, and it's the headline result of this whole pass.

`common.store_tags` is an **ordered list of the app's top ~20 community tag IDs, ranked by
popularity** — exactly the tag set Steam's own store page displays under "Popular user-defined
tags." Cross-referencing against `appcache/localization.vdf` — a **9.5 KB plain-text
KeyValues file**, trivially parseable with the same text-VDF grammar as `loginusers.vdf`,
containing a single `localization.english.store_tags` block — resolves every ID to its name:

```json
{"1663": "FPS", "3942": "Sci-fi", "4182": "Singleplayer", "3839": "First-Person", "19": "Action", ...}
```

`localization.vdf` isn't a per-app file — it's Steam's **entire global tag vocabulary**, all
~590 tag IDs the client currently knows about, in one small file. Decoded and cross-checked
against all four sample appids: every tag ID in every app's `store_tags` resolved to a
sensible, correct name (Half-Life 2 → FPS/Action/Adventure/Sci-fi/War/Aliens; TF2 →
Multiplayer/Free to Play/Class-Based/Hero Shooter/Team-Based; Portal/Portal 2 →
Puzzle/Singleplayer/Puzzle Platformer/Sci-fi/Comedy/First-Person). No ambiguous or garbage
mappings in the sample.

**Why this matters**: `sort-filter-data-provenance.md` already names community tags as "the
other real gap" — the one field family with a single source (SteamSpy), a hard rate limit
(~1 req/sec, no bulk endpoint), and no confirmed alternative — and `local-file-investigation.md`
already speculated that local-file mining was "considered the best bet" for solving exactly
this, if it could "surface a tag-equivalent local source and sidestep SteamSpy... entirely."
This is that source, empirically confirmed on real data, not a guess. It's worth being precise
about the difference from SteamSpy rather than calling it a strict replacement:

| | SteamSpy `tags` | Local `store_tags` + `localization.vdf` |
|---|---|---|
| Vocabulary | Same underlying Steam tag system | Same underlying Steam tag system (this **is** Valve's own tag catalog) |
| Per-app shape | Tag → vote-count weight, effectively unbounded list | Top ~20 tags, rank-ordered, **no weight/count**, just rank position |
| Coverage | Whatever SteamSpy has scraped and aggregated (community votes over time) | Whatever this Steam client has locally cached info for (see caveats below) |
| Cost | ~1 req/sec, no bulk mode, minutes for a large library | Already on disk, zero network calls, zero rate limit |
| Freshness | As fresh as SteamSpy's last scrape | As fresh as this Steam client's last app-info sync — unmeasured in this pass |

Net: probably not a byte-for-byte SteamSpy replacement (no vote-weight granularity), but very
plausibly good enough for sort/filter-by-tag, cheaper than SteamSpy, first-party, and
zero-latency. This is the strongest single finding of this pass and the clearest candidate for
a fast-follow implementation.

Caveats not yet verified, same as the genres/categories case:
- **Freshness** — client-cache recency, not guaranteed current for an app not recently viewed.
- **Coverage across the full library** — validated on 4 well-known, actively-maintained titles;
  unmeasured for obscure/delisted/rarely-viewed appids, which is exactly where SteamSpy's own
  coverage is also weakest, so this may or may not be strictly better there.
- **Rank-only, no weight** — a design decision is needed for how "tag N of 20, unweighted" maps
  onto `steamspy_tags: Record<string, number>`'s vote-count-shaped field (e.g. synthesize a
  descending weight from rank position) before it can drop into the existing pipeline unchanged.

## 6b. Incidental finds inside `appinfo.vdf` — not targeted, worth a note

Per the "flag it if we happen upon it" scoping — three fields showed up in the `common`/
`extended` blocks that aren't in the current data model at all, i.e. not redundant with
anything `appdetails` or SteamSpy already give us:

- `steam_deck_compatibility` — Valve's own Verified/Playable/Unsupported rating plus
  `steamos_compatibility` and `steam_machine_compatibility` sub-ratings, with test-build
  metadata. A genuinely new sort/filter dimension ("show me Deck-verified games") that doesn't
  exist anywhere else in the pipeline today.
- `metacritic_score` / `metacritic_fullurl` — note `appdetails` already returns a `metacritic`
  object per `AppDetailsCache`'s `AppDetailsData` type, so this is likely redundant, not new —
  flagging only because it wasn't cross-checked against a live `appdetails` response in this
  pass.
- `extended.listofdlc` — comma-separated appid list of an app's DLC. Not currently modeled;
  could matter for library-completeness or bundle-detection use cases later, not sort/filter.

None of these were pursued further — noted per scope, not chased.

## 7. Explored and deprioritized: CEF/Chromium cache

`%LOCALAPPDATA%\Steam\htmlcache` is a full embedded-Chromium (CEF) profile — 710 MB, standard
Chromium `Default/` layout (`History`, `Favicons`, `Cache`, `Login Data`, `Cookies`, etc). This
is Steam's own internal browser (Store pages, Big Picture, embedded community pages), not the
user's personal Chrome/Edge profile, but it still has the same shape as a real browser profile
including account/session-adjacent files.

Explored only far enough to confirm it exists and is large; **not pursued further**:
- Any CDN artwork cached here would be in Chromium's binary "Simple Cache" disk-cache format —
  needs a dedicated cache-format parser, no small reusable library confirmed for this pass.
- Reading `History`/`Login Data`/cookie stores crosses into browsing-data territory that's out
  of proportion to what we're after (game metadata), even though it's Steam's own webview
  rather than the user's actual browser. Recommend treating this path as out of scope unless a
  much more targeted need shows up later (e.g. specifically the profile-showcase HTML from §4,
  and only after confirming there's no server-side API path first).

## Summary table (delta against `sort-filter-data-provenance.md`)

| Signal | Local source | Status this pass |
|---|---|---|
| Identity (steamid, persona name) | `config/loginusers.vdf` | Confirmed, matches prior research |
| Playtime / last-played | `userdata/<id>/config/localconfig.vdf` | Confirmed; already "free" via API too, this is the offline-parity path |
| User categories/collections | `userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json` | Confirmed with real named data ("Ze Done", "Meh") — no change to existing High-confidence rating |
| Library-panel showcase state (not profile showcase) | same file, `showcases.*` | New, minor — client UI state, not product-relevant |
| Public profile showcase widget | — | **Not found locally.** Needs a web-API or CEF-cache path if pursued further |
| Achievement cache (per-app, global % + user state) | `appcache/librarycache/<appid>.json`, `userdata/<id>/config/librarycache/<appid>.json` | New — incidental find, not originally targeted |
| Genres/categories/developer/publisher/review_score/controller_support | `appcache/appinfo.vdf` (binary KeyValues) | Parsed and verified on 4 sample appids — redundant with `appdetails`, valuable only as zero-fetch pre-warm, not new data |
| **Community tags** | `appcache/appinfo.vdf` (`common.store_tags`) + `appcache/localization.vdf` (id→name table) | **Parsed and verified — the strongest lead in this pass.** Same Valve tag vocabulary SteamSpy also draws from, rank-ordered not vote-weighted, zero network cost. Candidate to reduce or remove desktop's SteamSpy dependency |
| Steam Deck compatibility rating | `appcache/appinfo.vdf` (`common.steam_deck_compatibility`) | New, incidental — not modeled anywhere today, no prior art to compare against |
| CDN artwork cache | `%LOCALAPPDATA%\Steam\htmlcache` (Chromium cache) | Explored, deprioritized — wrong tool for the job, disproportionate access for the value |

## Recommended next step

Superseded by an actual implementation plan — see
[`desktop-local-data-pipeline-plan.md`](../../plans/desktop-local-data-pipeline-plan.md).

## Related
- `docs/research/local-steam/local-steam-buckets-findings.md` — the original (anonymized,
  broader-coverage) probe this one follows up on
- `docs/features/local-file-investigation.md` — feature doc this probe reports back into
- `docs/architecture/sort-filter-data-provenance.md` — the spec table this probe's findings feed
- `docs/features/desktop-app.md` — desktop capability umbrella (filesystem access is what makes
  this probe's "silent" framing possible at all, vs. the browser File System Access API ceiling
  the original probe worked under)
