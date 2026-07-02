# Manual Library Export — Feasibility Study

**Act**: 2 (Ready for Friends — reduces reliance on hosted Lambda for library ingestion)
**Status**: 🟢 Research spike — findings believable, endpoints verified against current Steam behavior (2026-07-01). No implementation started.
**Primary question**: Can a user hand us their full Steam library *without us calling our Lambda* — ideally via a one-click bookmarklet that writes a JSON file we then import?

---

## TL;DR verdict

**Feasible, and cleaner than expected.** A bookmarklet running in the user's own logged-in Steam tab can read the full owned-games list from data already embedded in the page (`rgGames`) — no API key, no scraping-by-scroll, no CORS fight — and hand it back as a downloadable JSON file. Our app imports that file with the same File System Access path already planned for local collections.

The important nuance: this bypasses the **ownership/identity** Lambda calls (`/resolve/{vanity}` and `/games/{steamid}`), which are the auth-sensitive, per-user part. It does **not** by itself bypass **app-details enrichment** (categories / genres / SteamSpy tags), which still flows through the Lambda's batch client. Minimal store (names + box art) is achievable with **zero** Lambda; rich sort/tag metadata still wants it. See [What this does and doesn't remove](#what-this-does-and-doesnt-remove-from-the-lambda).

---

## Why a bookmarklet works where our web app can't

This is the crux, and it's worth stating plainly because it's what makes the whole idea sound:

- Our app is served from **our** origin (`steam-api-dev.wehrly.com` / localhost). From there, a `fetch()` to `store.steampowered.com` or `steamcommunity.com` is **cross-origin, un-credentialed, and CORS-blocked** — which is the entire reason the Lambda proxy exists in the first place (documented in [`../research/steam-api-research.md`](../research/steam-api-research.md), "CORS" and "Strategy 1").
- A **bookmarklet executes in the origin of whatever tab it's clicked in**. Clicked on a Steam tab, it is *same-origin* with Steam, so it can read that page's DOM and JS globals directly, and any `fetch()` it makes to Steam carries the user's **login cookies** automatically.

So the bookmarklet is a way to borrow the one context that already has both the permission and the credentials — the user's own browser session on Steam — and pass the result back to us as an inert file. We never touch Steam's servers; the user's browser does, as itself.

---

## Which page is "best" — capture the data, not the DOM

The instinct to "scroll and capture rendered content" is aimed at the wrong layer. Every good target embeds the **full list up-front** as structured data, so no scroll/lazy-load harvesting is needed.

| Source | Origin | Payload | Auth | Completeness | Fragility | Verdict |
|---|---|---|---|---|---|---|
| **`rgGames` JS variable** on `/my/games/?tab=all` (or `/profiles/{id}/games/?tab=all`) | `steamcommunity.com` | appid, name, playtime (`hours_forever`), logo | Own profile via `/my/` (logged in) → all owned games regardless of privacy | **High** — full owned set on your own page | Medium — Valve can restructure the page | ⭐ **Primary target** |
| **`?xml=1`** variant of the same games page | `steamcommunity.com` | appID, name, logo, `hoursOnRecord` | Same | High (own profile) | Low — stable XML feed, older & rarely touched | ⭐ Strong fallback / no-JS route |
| **`/dynamicstore/userdata/`** | `store.steampowered.com` | `rgOwnedApps` = array of appids (no names/playtime) | Logged-in cookie | Broad but **explicitly "non-exhaustive"** per community reports; also Steam-cached | Low — plain JSON | Completeness booster only |
| **`/account/licenses/`** | `store.steampowered.com` | HTML table of every license/package | Logged-in | Very high but includes non-game packages & needs package→app mapping | High — messiest to parse | Not recommended |
| Rendered DOM + scroll harvest | either | whatever is painted | — | Fragile, partial | High | ❌ Avoid — the data is already in `rgGames` |

**Recommendation: target `rgGames` on the community games page**, with the `?xml=1` feed as the graceful fallback when the JS variable isn't present. Both are single-origin (`steamcommunity.com`), so one bookmarklet on one tab gets appid + name + playtime — everything our sort pipeline needs as input. `dynamicstore/userdata` is a nice completeness cross-check but lives on the other origin (`store.`), so folding it in means either a second bookmarklet or accepting a second click; not worth it for v1 given `rgGames` on your own profile is already the complete owned set.

> Endpoint shapes above were confirmed against current community documentation on 2026-07-01. They should still be re-verified live as the first spike task — Valve changes these pages without notice, and "confirmed to exist" is not "confirmed to still embed `rgGames` today."

---

## The two halves

### Half 1 — Export bookmarklet (runs on Steam)

```javascript
javascript:(function(){
  // Runs in steamcommunity.com origin, on the logged-in user's own games page.
  var games = (typeof rgGames !== 'undefined')
    ? rgGames
    : (window.g_rgProfileData && window.g_rgGames) || null;
  if(!games){ alert('Open steamcommunity.com/my/games/?tab=all first, then click this.'); return; }
  var payload = {
    schema: 'sbam-library-export/v1',
    exported_at: new Date().toISOString(),
    game_count: games.length,
    games: games.map(function(g){
      return { appid: g.appid, name: g.name, playtime_forever: g.hours_forever || g.playtime_forever || 0 };
    })
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'steam-library.json';
  a.click();
})();
```

- **Export mechanism is trivial and well-worn**: build a `Blob`, `URL.createObjectURL`, click a synthetic `<a download>`. Triggers the browser's own Save dialog. No File System Access API required on the export side (though `showSaveFilePicker` is a Chromium upgrade if we want a real "Save As").
- **No scroll, no timers, no DOM walking** — `rgGames` is the whole library in one variable.
- Distribution: we host the bookmarklet on our own first-run/help page as a draggable link plus copy-paste text, with a screenshot of where to drop it. (Some browsers strip `javascript:` on paste into the address bar — dragging to the bookmarks bar is the reliable install path; document both.)

### Half 1 (desktop) — injected webview, zero install

On the desktop build the bookmarklet install step disappears entirely. Tauri opens a second
WebView2 window pointed at `steamcommunity.com`; the user logs into Steam there (cookies live in
WebView2); we inject the same `rgGames`-reading script and return the parsed list over Tauri IPC
straight into the pipeline — no `javascript:` paste, no Save/Open file round-trip. Same capture
logic, better delivery. A Rust-side variant (CORS-free authenticated fetch of the `?xml=1` feed
after the login window establishes a session) is also possible, but the injected-webview route is
simpler and reuses the exact web capture code. This is the "Connect Steam" button on desktop; the
bookmarklet+file flow remains the web path. See [`../features/desktop-app.md`](../features/desktop-app.md)
("Library capture without a bookmarklet").

### Half 2 — Import (runs in our app)

We already have the plan for this. [`steam-user-categories-filesystem-plan.md`](./steam-user-categories-filesystem-plan.md) §2 specifies `window.showOpenFilePicker()` with a `<input type="file">` fallback for non-Chromium browsers, plus the "persist the parsed result, not the file handle" strategy. **Reuse it verbatim** — this import is the same shape (pick a JSON file, parse, persist locally), just a different schema. One picker, two accepted schemas (library export + collections export) is a natural consolidation.

Parsed `{ appid, name, playtime_forever }[]` maps directly onto the pipeline's entry contract:

```
export JSON  →  SteamUser {
                  steamid: '', vanity_url: '<local import>',
                  game_count, retrieved_at,
                  games: SteamGame[]   // appid + name + playtime_forever; artwork derived from appid
                }
             →  SteamIntegration.gameLibrary.setUserData(user)
             →  loadGamesProgressively(user)   (or direct batch-emit, demo-games style)
```

`SteamGame.artwork` (`library_600x900.jpg`, `header.jpg`) is a pure function of `appid` — no network authority needed (see `demo-games.ts` `lib()`/`header()` helpers and `GamesLoader.buildEnhancedGame`). So names + boxes render with **nothing but the imported file + Steam's public CDN**.

---

## What this does and doesn't remove from the Lambda

Being honest about the "get around the Lambda" goal, because it's a partial win, not a total one:

| Lambda responsibility | Removed by manual export? | Why |
|---|---|---|
| `/resolve/{vanity}` → steamid | ✅ Yes | We never need the steamid; the file *is* the library |
| `/games/{steamid}` → owned list | ✅ Yes | This is exactly what the bookmarklet replaces |
| Box art / header art | ✅ Already Lambda-free | Derived from appid against public CDN |
| App details enrichment (categories, genres, SteamSpy tags, canonical name) via `BatchAppDetailsClient` | ❌ No | Still proxied through Lambda in `GamesLoader.fetchAndEmitUncached` |

The enrichment dependency is **much softer** than the ownership one: it's appid-keyed (not identity-keyed), cacheable, shared across all users, and degrades gracefully — a game with no enrichment still renders its box and name and just lacks tag/genre sort dimensions. So:

- **Zero-Lambda minimal store** (names + box art + playtime sort): achievable today with just this feature.
- **Full-fidelity store** (tag/genre/SteamSpy sorting): still wants the Lambda for enrichment, *but no longer for identity or ownership*. That's the meaningful reduction — the auth-sensitive, per-user, privacy-touching call is gone.

If we later want to cut the enrichment Lambda too, that's a separate question (client-side `store.steampowered.com/api/appdetails` is itself CORS-blocked from our origin — the same wall — so it would need either its own bookmarklet enrichment pass or a static metadata bundle). Out of scope here; noted so we don't pretend one feature kills the Lambda entirely.

---

## Legal / ToS posture

This is materially more defensible than server-side scraping, but not zero-risk — flag it, don't hand-wave it. Cross-reference [`../features/steam-api-compliance.md`](../features/steam-api-compliance.md) and [`../features/legal-privacy-compliance.md`](../features/legal-privacy-compliance.md).

- **User-initiated, client-side, own-data.** The bookmarklet reads data the user is *already authorized to see* in their own browser session and exports it locally. There is no automated crawling, no credential handling by us, no traffic to Steam from our infrastructure. This is closer to "user copies their own list" than "we scrape Steam."
- **We never receive Steam credentials** and never proxy Steam traffic in this path — a privacy win worth stating explicitly.
- **Risks to keep honest about**: (1) Steam's subscriber agreement restricts automated access; a bookmarklet is a grey area even when user-run. (2) Page-structure changes can silently break `rgGames` capture — this is a maintenance tax, not a one-time cost. (3) We must not encourage users to export *other people's* private data (the `/my/` own-profile framing keeps this clean).
- Recommend a short human-readable note in the import UI: what the file contains, that it stays on their machine, and that they can inspect it (it's plain JSON).

---

## Risks & fragility

- **`rgGames` is undocumented and Valve-owned.** It has been stable for years but is not a contract. Mitigation: `?xml=1` fallback (older, even more stable), and fail loud with a clear "the export button needs updating" message rather than silently importing nothing.
- **Bookmarklet install friction.** `javascript:` pasting is increasingly restricted; drag-to-bookmarks-bar is the reliable path. Mobile browsers largely can't run bookmarklets — desktop-only feature, which is fine (this is a setup-time action).
- **Schema drift on our side.** Version the export payload (`schema: 'sbam-library-export/v1'`) so a future format change can be detected on import.
- **This is a strictly better superset of the existing "profile URL" channel** for the common case (own library, logged in) — it works for **private** profiles too, which the profile-URL/Lambda path cannot. Worth positioning as such rather than as a mere Lambda-avoidance hack.

---

## Spike tasks (to move from "believable" to "proven")

1. **Live-verify** `rgGames` still embeds on `steamcommunity.com/my/games/?tab=all` today, and capture its exact current field names (`hours_forever` vs `playtime_forever` etc.). Do the same for `?xml=1`.
2. Build the ~15-line export bookmarklet; confirm the Save dialog + file contents on Chrome and Firefox.
3. Prototype import reusing the collections file-picker; map into `SteamUser` and feed `loadGamesForUser`'s downstream (`setUserData` → `loadGamesProgressively`).
4. Confirm a full store renders with enrichment **disabled** (zero-Lambda path), then with it enabled (soft-dependency path).
5. Decide distribution surface for the bookmarklet (first-run help panel) and write the drag-to-install instructions + screenshot.

---

## Channel landscape (for context)

Where this sits among all five ingestion channels discussed:

| Channel | Status | Lambda-free? | Notes |
|---|---|---|---|
| Default F2P list ("anonymous store") | ✅ Shipped | ✅ Yes | `demo-games.ts`; needs curation tuning (separate task) |
| Steam profile URL | ✅ Shipped | ❌ No | Lambda `/resolve` + `/games`; public profiles only |
| **Manual export (this doc)** | 🟢 Feasible, unbuilt | ✅ Ownership yes / enrichment no | Works for private libraries; primary focus |
| Local Steam files on disk | ⏸️ Researched, deferred to AC4.4 | ✅ Yes | Blocked in-browser by Chromium `Program Files` sandbox; wants desktop app. See below |
| Steam login (OpenID/OAuth) | 🔴 Not pursued | n/a | No dedicated study; noted only as an option. Explicitly out of scope near-term |

---

## Related

- [`traffic-safety-review.md`](./traffic-safety-review.md) — **why** this channel matters: zero Steam ownership traffic
- [`bookmarklet-capture-spike.md`](./bookmarklet-capture-spike.md) — the self-contained brief that implements this
- [`steam-user-categories-filesystem-plan.md`](./steam-user-categories-filesystem-plan.md) — the file-picker import mechanism to reuse
- [`../research/steam-api-research.md`](../research/steam-api-research.md) — the CORS/Lambda rationale this routes around
- [`../features/local-file-investigation.md`](../features/local-file-investigation.md) — the sibling "local files" channel (deferred)
- [`../features/desktop-app.md`](../features/desktop-app.md) — the vehicle that would unblock the local-files channel
- [`../features/first-load-experience.md`](../features/first-load-experience.md) — natural home for the "import your library" affordance

---
*— A1 / P1*
