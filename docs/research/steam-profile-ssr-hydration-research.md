# Steam Profile Page SSR Hydration — Structure Research

**Purpose**: lightweight reference for the current shape of `steamcommunity.com`'s games page, so
future work (expanding the bookmarklet, building the desktop injected-webview capture, or pulling
more than just the games list) doesn't need to re-derive this from scratch. Implements/documents the
mechanism used by [`client/public/bookmarklets/export-library.js`](../../client/public/bookmarklets/export-library.js)
and specified in [`../plans/manual-library-export-feasibility.md`](../plans/manual-library-export-feasibility.md).

**Verified**: 2026-07-02, live, against a real Steam account. Machine/account-specific identifiers
(steamid64, private account name, avatar hashes, wallet/location data) are **intentionally redacted**
below — same convention as `docs/research/local-steam/local-steam-buckets-findings.md`. Vanity URL
`SpiteMonger` is left in as-is since it's a public URL slug already visible throughout this
project's docs and screenshots, not a secret.

**Prior finding this supersedes**: earlier research (`../plans/manual-library-export-feasibility.md`,
originally drafted 2026-07-01) proposed the `rgGames` global variable and the `?tab=all&xml=1` feed
as the capture source. **Both are confirmed dead** as of this pass — Steam has since rebuilt profile
pages as server-rendered React. This doc describes the mechanism that replaced them.

---

## 1. The entry point — and why you don't need to know the user's ID

**URL**: `https://steamcommunity.com/my/games/?tab=all`

This is the key practical finding for reducing user friction. `/my/` resolves the *logged-in
session's own profile* — no vanity name or SteamID64 needs to be known in advance by us or supplied
by the user.

- **Via real navigation** (`window.location = ...`, `window.open(...)`, clicking a link): resolves
  cleanly. Network trace shows **a single request, `200 OK`** — not a `301`/`302`. The server
  resolves identity from the session cookie and serves the SSR page directly at `/my/games/?tab=all`;
  the client-side router then rewrites the address bar to the canonical vanity/profile URL
  (`https://steamcommunity.com/id/<vanity>/games?tab=all` in this test) via `history` manipulation,
  not a network redirect.
- **Via `fetch()`** (even with `credentials: 'include'`, same-origin): **fails**. Observed a
  `TypeError: Failed to fetch` on one attempt and repeated `503` responses on another, against the
  exact same URL that a real navigation resolves without issue. This strongly suggests Steam
  distinguishes real top-level navigations from programmatic requests (`fetch`/`XHR`) to this
  specific path — plausibly via `Sec-Fetch-Mode`/`Sec-Fetch-Dest` header inspection, though the exact
  mechanism wasn't isolated.

**Practical implication**: any capture mechanism (bookmarklet, injected webview) must trigger a real
navigation to `/my/games/?tab=all` (or already be running on the resulting page) — it cannot shortcut
via `fetch()`. For the **desktop injected-webview** design in
[`../plans/rust-cors-bypass-spike.md`](../plans/rust-cors-bypass-spike.md), this means: navigate the
webview to `/my/games/?tab=all` directly (don't ask the user for their vanity/steamid first — same
"we don't need to know their ID" benefit applies there too).

---

## 2. Page architecture

The current games page is server-rendered React, not the older plain-template/`rgGames` page:

- One large inline `<script>` (**~3.7MB** on the test account, 862 owned games) contains the fully
  dehydrated React Query client cache — everything the page's components need to hydrate without a
  second round-trip.
- Beyond that, the page loads ~90 chunked JS bundle files (`chunk-*.js`) from
  `cdn.fastly.steamstatic.com/steamcommunity/public/ssr/` — standard code-splitting, not
  interesting for data extraction.
- The visible game list is **virtualized**: only a handful of `<button>` rows exist in the DOM at
  once (confirmed via accessibility tree — 4 rows rendered initially against a combobox reporting
  "All Games (861)"). Scrolling the page triggers **only image fetches** (`header.jpg` for
  newly-visible rows) — no additional data requests. This confirms the full game list data is
  already present client-side from the initial load; DOM scroll-harvesting is unnecessary and would
  in fact be the wrong layer to target (this was verified by watching network traffic across a scroll
  — zero new list-data requests, ~20 new image requests).

---

## 3. The hydration payload — locating and parsing it

### Finding the right `<script>`

Don't assume a fixed script index — search all `document.scripts` for one whose `textContent`
contains a known query name (e.g. `'OwnedGames'`). This is what
`export-library.js`'s `findOwnedGamesScript()` does. Page structure (script ordering, count) is not
a stable contract even if the payload format is.

### The escaping problem

The payload is a JSON string, but **escaped at an inconsistent depth in different parts of the same
script** — observed 1–3 levels of backslash-escaped quotes (`\"` vs `\\\"` vs `\\\\\\"`) depending on
where in the SSR/React-Query pipeline a given fragment was serialized. This appears to be an
artifact of nested `JSON.stringify` calls (React Query's `dehydrate()` producing a plain object tree,
which Steam's SSR layer then re-stringifies at least once more for safe `<script>` embedding, with
some sub-trees picking up extra layers). **Do not assume a fixed escape depth** when writing
extraction code.

The one reliable invariant: **structural JSON characters (`[`, `]`, `{`, `}`, `,`, `:`) are never
escaped**, regardless of nesting depth — only `"` and `\` are. This is what makes backslash-tolerant
regex matching on structure (rather than full recursive parsing) practical.

### Extraction algorithm (as implemented)

1. Locate the target script via the anchor string above.
2. Find the array/object start: search (backslash-tolerant) for the pattern
   `state<backslashes>":{<backslashes>"data<backslashes>":[` immediately preceding the query name's
   `queryKey` occurrence — take the **last** match before the anchor, since earlier unrelated
   `state`/`data` pairs can appear earlier in the file.
3. Find the end: search forward from the array start for a distinctive sibling key that always
   follows a query's data in React Query's dehydrated shape — `dataUpdateCount` — then walk backward
   to the nearest `]`.
4. Slice out that substring and **iteratively** collapse `\"` → `"` and `\\` → `\` (a handful of
   passes, until no `\"` remains) to normalize whatever escape depth was actually present.
5. `JSON.parse()` the normalized substring.

This is escape-depth-agnostic by construction — it doesn't matter whether a given query's data was
escaped once or three times, the loop keeps unwinding until it's flat, valid JSON.

Verified against a real account: 862 games extracted, all fields present, names containing colons
(`"Counter-Strike: Source"`) parsed correctly, no truncation, no duplicate appids.

---

## 4. The React Query cache — full inventory

The payload isn't just the games list. Enumerating every `queryKey` in the blob (test account, one
page load) found **12 distinct query types**:

| Query name | Occurrences | Contents (fields observed) |
|---|---|---|
| `OwnedGames` | 1 | **The full owned-games array.** Per game: `appid`, `name`, `playtime_forever`, `playtime_disconnected`, `rtime_last_played` (present only if ever played), `capsule_filename` (artwork path fragment — see caveat below), `has_dlc`, `has_workshop`, `has_market`, `has_community_visible_stats`, `has_leaderboards`, `content_descriptorids` (array), `img_icon_url`. |
| `AchievementProgress` | 862 (once per owned game) | Per appid: `appid`, `unlocked`, `total`, `percentage`, `all_unlocked`, `cache_time`, `vetted`. |
| `StoreItem` | 1724 (twice per owned game — two `queryKey` variants, e.g. `["StoreItem","app_<id>","include_assets_without_overrides"]`) | Per appid: artwork **asset URL format string** (`asset_url_format`) plus named filenames — `main_capsule`, `small_capsule`, `header`, `header_2x`, `hero_capsule`, `library_capsule`, more. **Not** genre/category/tag/review data — checked explicitly (`genre`, `categor`, `review`, `descriptor` all absent from a sampled entry). This query is an artwork-asset source, not an appdetails-equivalent enrichment source. |
| `PlayerLinkDetails` | 1 | The account's own `public_data` (steamid64, visibility/profile state, avatar hash) and `private_data` (`time_created`, **account_name** — the original account name, distinct from and often more sensitive than the public vanity URL — `last_logoff_time`, `last_seen_online`). **Correction (verified live 2026-07-11 against a vanity-URL profile, superseding this row's `data` claim):** on the account tested, `data.public_data` did not contain a `steamid64` field — but the query's own `queryKey` tuple does: `["PlayerLinkDetails","<steamid64>"]`, repeated in `queryHash`. `export-library.js`'s `extractSteamIdFromPlayerLinkDetails()` reads the steamid from that tuple, not from `data` — narrower and simpler than parsing `public_data`, and it never touches `private_data`. |
| `CurrentUserWalletDetails` | 1 | `has_wallet`, `user_country_code`, `wallet_country_code`, **`wallet_state`** (sub-national, e.g. a US state — approximate real-world location), `balance`, `delayed_balance`. |
| `ProfileItemsEquipped` | 1 | Cosmetic profile customization — equipped background/avatar frame/mini-profile items, each with `communityitemid`, image paths, display name. |
| `CommunityPreferences` | 1 | Nickname/text-filter settings, and **content descriptor preferences** — the account's mature-content-filter exclusion list. |
| `AccountPrivateApps` | 1 | A short array of appids the account has marked **private/hidden** from its public games list. |
| `StorePreferencesQueryKey` | 1 | Store-facing preferences: `primary_language`, `secondary_languages`, per-platform visibility flags (`platform_windows`/`mac`/`linux`), `hide_store_b...` (truncated in sample — likely a "hide broadcasts" or similar flag). |
| `RemoteDownload_OnlineClient` | 1 | Cloud-save/remote-client state; sampled shape was mostly null on this account (`wrappers_: null`). |
| `CookiePreferences` | 1 | Cookie-consent state (`version`, `preference_state`). |
| `AOWarningCookie` | 1 | A small flag/cookie-acknowledgement value (age-gate related, unconfirmed exact purpose). |

Plus two API calls made **outside** this blob (regular network requests, not embedded): a
protobuf-encoded `IParentalService/GetParentalSettings` call and an `IStoreBrowseService/GetItems`
call — not investigated further, not needed for the games-list use case.

### Why this matters beyond the games list

Everything above rides along in the **same single page load** that gets the games list — the
marginal cost of capturing more of it, once you're already parsing this structure, is close to zero.
Two concrete opportunities worth flagging for later (not scoped or built now):

- **`AchievementProgress` and `StoreItem`** are legitimate "free" per-game data that could enrich the
  store display (completion %, richer artwork variants) without any additional Steam request beyond
  the one page load we're already making for ownership.
- Everything else (`PlayerLinkDetails`, `CurrentUserWalletDetails`, `CommunityPreferences`,
  `AccountPrivateApps`, etc.) is **account-level data, some of it genuinely sensitive** (wallet
  balance, approximate location, private account name, hidden-games list, mature-content
  preferences). Grabbing "the whole payload" is technically trivial, but it meaningfully raises the
  privacy/handling bar versus today's games-only extraction — see the note below.

### Privacy note (important, not addressed elsewhere yet)

The current bookmarklet only extracts `OwnedGames` and discards the rest of the script text — it
never parses or transmits the wallet/location/private-account-name/hidden-games data, even though
that data is sitting right next to what it does extract, in the same variable, in memory, during
extraction. If a future feature expands capture to any of the other queries above, it should be
treated as a **materially different privacy posture** than the games-only export (see
[`../features/legal-privacy-compliance.md`](../features/legal-privacy-compliance.md)) — wallet
balance and approximate location are a different category of data than "which games do you own."

---

## 5. Known quirks / open notes

- **`capsule_filename` on `OwnedGames` entries is inconsistent**: sometimes a bare filename
  (`"library_600x900.jpg"`), sometimes hash-prefixed (`"ac2f074d.../library_600x900.jpg"`). The
  hash prefix isn't derivable from the appid alone, so this field should be used as-is when present
  rather than reconstructed. (Our existing artwork derivation in `demo-games.ts`/`GamesLoader` uses
  the appid-only CDN URL pattern, which works but may not match what Steam's own UI displays for
  hash-prefixed assets — not yet reconciled, noted for whoever builds the importer.)
- **Game count discrepancy**: the page's own UI reported "All Games (861)" while the `OwnedGames`
  array yielded **862** entries. Not investigated further — plausibly a demo/dedicated-server-tool
  entry the UI counts differently. Doesn't affect extraction correctness (every entry has full,
  valid fields); flagged so it doesn't look like a silent bug later.
- **Fragility is proven, not hypothetical.** The mechanism this doc replaced (`rgGames`) was
  presumed stable "for years" in the original research pass and turned out to already be dead by the
  time of live verification. Whatever's documented here should be re-verified before being trusted
  again after any meaningful gap in time — treat this doc as a snapshot, not a contract.

---

## Related

- [`../plans/manual-library-export-feasibility.md`](../plans/manual-library-export-feasibility.md) — the feature this research supports; has the "why a bookmarklet works" CORS framing
- [`../plans/bookmarklet-capture-spike.md`](../plans/bookmarklet-capture-spike.md) — implementation spike status
- [`../plans/rust-cors-bypass-spike.md`](../plans/rust-cors-bypass-spike.md) — desktop capture; the `/my/` navigation-not-fetch finding applies there directly
- `client/public/bookmarklets/export-library.js` — the implementation
- [`../features/legal-privacy-compliance.md`](../features/legal-privacy-compliance.md) — where the privacy posture of any future expanded capture should be worked out
