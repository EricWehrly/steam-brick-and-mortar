# Manual Library Export — Feasibility Study

**Act**: 2 (Ready for Friends — reduces reliance on hosted Lambda for library ingestion)
**Status**: ✅ **Both halves built.** Export bookmarklet implemented and live-tested against a real Steam account (2026-07-02) — see `client/public/bookmarklets/export-library.js`. Import (Half 2) landed 2026-07-11 via the [library source convergence](library-source-convergence-plan.md): imports render immediately with zero Lambda calls, gain entity enrichment (categories/genres) when the shared cache already has it, and survive a reload.
**Primary question**: Can a user hand us their full Steam library *without us calling our Lambda* — ideally via a one-click bookmarklet that writes a JSON file we then import?

---

## TL;DR verdict

**Feasible, and proven working end-to-end against a live account (862 games extracted cleanly).** A bookmarklet running in the user's own logged-in Steam tab can read the full owned-games list from data embedded in the page — no API key, no scraping-by-scroll, no CORS fight — and hand it back as a downloadable JSON file. Our app imports that file with the same File System Access path already planned for local collections.

**Correction from the original draft of this doc**: the originally-proposed source (`rgGames` global variable, and the `?xml=1` feed as fallback) is **confirmed dead** as of live testing on 2026-07-02 — Steam has since rebuilt profile pages as server-rendered React with client-side hydration. Neither mechanism exists anymore. The real, verified source is different and is documented below. This is exactly the kind of drift the original doc warned about ("Valve changes these pages without notice") — it just happened before we got to build against it, which is a good argument for verifying live before building rather than trusting documentation, however recent.

The important nuance: this bypasses the **ownership/identity** Lambda calls (`/resolve/{vanity}` and `/games/{steamid}`), which are the auth-sensitive, per-user part. It does **not** by itself bypass **app-details enrichment** (categories / genres / SteamSpy tags), which still flows through the Lambda's batch client. Minimal store (names + box art) is achievable with **zero** Lambda; rich sort/tag metadata still wants it. See [What this does and doesn't remove](#what-this-does-and-doesnt-remove-from-the-lambda).

---

## Why a bookmarklet works where our web app can't

This is the crux, and it's worth stating plainly because it's what makes the whole idea sound:

- Our app is served from **our** origin (`steam-api-dev.wehrly.com` / localhost). From there, a `fetch()` to `store.steampowered.com` or `steamcommunity.com` is **cross-origin, un-credentialed, and CORS-blocked** — which is the entire reason the Lambda proxy exists in the first place (documented in [`../research/steam-api-research.md`](../research/steam-api-research.md), "CORS" and "Strategy 1").
- A **bookmarklet executes in the origin of whatever tab it's clicked in**. Clicked on a Steam tab, it is *same-origin* with Steam, so it can read that page's DOM and JS globals directly, and any `fetch()` it makes to Steam carries the user's **login cookies** automatically.

So the bookmarklet is a way to borrow the one context that already has both the permission and the credentials — the user's own browser session on Steam — and pass the result back to us as an inert file. We never touch Steam's servers; the user's browser does, as itself.

---

## Which page is "best" — capture the data, not the DOM

The instinct to "scroll and capture rendered content" is aimed at the wrong layer, and it's *still* the wrong layer even now that the DOM is virtualized (only ~4 game rows exist in the DOM at once on the current UI — scrolling only fetches more artwork images, not more game data). The full 861-ish game list is already sitting in memory; the trick is getting at it without walking the DOM.

| Source | Origin | Payload | Status (verified 2026-07-02) |
|---|---|---|---|
| ~~`rgGames` JS variable~~ | `steamcommunity.com` | — | ❌ **Dead.** `typeof rgGames === 'undefined'` on the current games page. |
| ~~`?tab=all&xml=1` feed~~ | `steamcommunity.com` | — | ❌ **Dead.** Returns the same HTML SPA shell, 0 `<appID>` tags. The `xml=1` param is ignored now. |
| **React Query hydration blob** ⭐ | `steamcommunity.com` (embedded in the games page's initial HTML) | Full array of `{appid, name, playtime_forever, playtime_disconnected, rtime_last_played, capsule_filename, has_dlc, has_workshop, has_market, content_descriptorids, img_icon_url, ...}` per game | ✅ **Confirmed working.** See mechanism below. |
| `/dynamicstore/userdata/` | `store.steampowered.com` | `rgOwnedApps` = array of appids only (no names/playtime) | Not verified this pass; other origin, lower value now that the primary source works — not needed |
| `/account/licenses/` | `store.steampowered.com` | HTML table of licenses/packages | Not verified; still not recommended — needs package→app mapping |

### The verified mechanism: mine the React Query hydration payload

The current `steamcommunity.com/id/<vanity>/games?tab=all` page is server-rendered React. On load, it embeds one giant inline `<script>` (~3.7MB on the test account) containing the **entire client-side React Query cache**, dehydrated to JSON for hydration. One of the cached queries is literally named `"OwnedGames"`, keyed as `["OwnedGames", "<steamid64>", "english"]`, and its `state.data` is the full owned-games array — richer than the old `rgGames` (adds `has_dlc`, `has_workshop`, `content_descriptorids`, a ready-to-use `capsule_filename` path for artwork).

The catch: this JSON is escaped at an **inconsistent nesting depth** in different parts of the same script (observed 1–3 levels of backslash-escaped quotes depending on where in the payload a value landed), so it isn't one `JSON.parse()` call away. The extraction that worked, live-tested against a real account (862 games, all fields present, no truncation, names with colons like `"Counter-Strike: Source"` parsed correctly):

1. Search every `<script>` on the page for one containing the literal text `OwnedGames` (don't assume a script index — that's fragile to page-structure changes).
2. Find the **last** occurrence, before that anchor, of the pattern `state<backslashes>":{<backslashes>"data<backslashes>":[` — this is the start of the `OwnedGames` query's data array. (Structural characters `[`, `]`, `{`, `}`, `,`, `:` are never escaped by `JSON.stringify` regardless of nesting depth, so backslash-tolerant regex matching on them is reliable even though the escape depth isn't fixed.)
3. Find the array's end by searching forward for the sibling key `dataUpdateCount` (a distinctive marker that appears right after the array closes in React Query's dehydrated shape), then walking back to the nearest `]`.
4. Slice out that substring and repeatedly collapse `\"` → `"` and `\\` → `\` (a handful of passes) until no more escaped quotes remain, turning the arbitrarily-nested blob into parseable JSON.
5. `JSON.parse()` the result.

This is implemented and tested in `client/public/bookmarklets/export-library.js`. Full structural
reference (the complete React Query cache inventory — this payload includes far more than just the
games list — plus the `/my/` navigation finding below) is in
[`../research/steam-profile-ssr-hydration-research.md`](../research/steam-profile-ssr-hydration-research.md).

**Also confirmed**: the user doesn't need to be on their own resolved games page in advance, and we
never need to know their vanity/steamid up front. `steamcommunity.com/my/games/?tab=all` resolves
the logged-in session's own profile in a single navigation (`200`, no redirect chain) — the
client-side router just repaints the address bar afterward. This only works via a **real
navigation**; a `fetch()` to the same URL fails. Relevant to the execution-friction discussion below.

**Fragility, stated plainly**: this is coupled to Valve's current SSR/React-Query implementation, which is clearly less stable ground than a documented API — it already changed once since the original (2026-07-01) draft of this doc, which is evidence the coupling is real, not hypothetical. The mitigation is the same as before: fail loud with a clear "this needs an update" message (implemented), not a silent empty import.

---

## The two halves

### Half 1 — Export bookmarklet (runs on Steam)

Implemented at `client/public/bookmarklets/export-library.js` — the extraction logic from the
verified mechanism above, wrapped as a self-contained IIFE. Load-bearing pieces:

```javascript
function findOwnedGamesScript() {
    var scripts = document.scripts;
    for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].textContent && scripts[i].textContent.indexOf('OwnedGames') !== -1) {
            return scripts[i].textContent;
        }
    }
    return null;
}

function extractOwnedGames(scriptText) {
    var anchor = scriptText.indexOf('OwnedGames');
    var before = scriptText.slice(0, anchor);
    var stateRe = /state\\*":\{\\*"data\\*":\[/g;
    var match, startMatch = null;
    while ((match = stateRe.exec(before)) !== null) startMatch = match;
    var arrayStart = startMatch.index + startMatch[0].lastIndexOf('[');

    var afterStart = scriptText.slice(arrayStart);
    var endMarkerIdx = afterStart.indexOf('dataUpdateCount');
    var beforeEndMarker = afterStart.slice(0, endMarkerIdx);
    var lastBracket = beforeEndMarker.lastIndexOf(']');

    var raw = afterStart.slice(0, lastBracket + 1);
    for (var i = 0; i < 6 && raw.indexOf('\\"') !== -1; i++) {
        raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return JSON.parse(raw);   // full array of game objects
}
```

(Full file also handles the not-found case, builds the `sbam-library-export/v1` payload, and
triggers the download — see the source for the complete, error-handled version.)

- **Export mechanism is trivial and well-worn**: build a `Blob`, `URL.createObjectURL`, click a synthetic `<a download>`. Triggers the browser's own Save dialog. No File System Access API required on the export side (though `showSaveFilePicker` is a Chromium upgrade if we want a real "Save As").
- **No scroll, no timers, no DOM walking** — the whole library arrives in the initial page load; scrolling only lazy-loads artwork images, never more game data.
- Distribution: we host the bookmarklet on our own first-run/help page as a draggable link plus copy-paste text, with a screenshot of where to drop it. (Some browsers strip `javascript:` on paste into the address bar — dragging to the bookmarks bar is the reliable install path; document both.)

### Half 1 (desktop) — injected webview, zero install

On the desktop build the bookmarklet install step disappears entirely. Tauri opens a second
WebView2 window pointed at `steamcommunity.com`; the user logs into Steam there (cookies live in
WebView2); we inject the same extraction script (`export-library.js`'s `findOwnedGamesScript` +
`extractOwnedGames`) and return the parsed list over Tauri IPC straight into the pipeline — no
`javascript:` paste, no Save/Open file round-trip. Same capture logic, better delivery. (The
`?xml=1`-feed Rust-side variant floated in an earlier draft of this doc is **not viable** — that
feed is confirmed dead, see above. Injected-webview extraction is the only proven route on either
platform now.) This is the "Connect Steam" button on desktop; the bookmarklet+file flow remains the
web path. See [`../features/desktop-app.md`](../features/desktop-app.md) ("Library capture without
a bookmarklet").

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
- **Risks to keep honest about**: (1) Steam's subscriber agreement restricts automated access; a bookmarklet is a grey area even when user-run. (2) Page-structure changes can silently break capture — proven not hypothetical, since the *original* mechanism this doc proposed (`rgGames`) died between drafts; this is an ongoing maintenance tax, not a one-time cost. (3) We must not encourage users to export *other people's* private data (the own-profile framing keeps this clean).
- Recommend a short human-readable note in the import UI: what the file contains, that it stays on their machine, and that they can inspect it (it's plain JSON).

---

## Risks & fragility

- **The extraction target is undocumented and Valve-owned.** No contract, no stability guarantee — and unlike the original assumption in this doc, there is no known *more*-stable fallback left to fall back to (both prior candidates are dead). Mitigation: fail loud with a clear "the export button needs updating" message rather than silently importing nothing (implemented in `export-library.js`'s catch block).
- **Bookmarklet install friction.** `javascript:` pasting is increasingly restricted; drag-to-bookmarks-bar is the reliable path. Mobile browsers largely can't run bookmarklets — desktop-only feature, which is fine (this is a setup-time action).
- **Schema drift on our side.** Version the export payload (`schema: 'sbam-library-export/v1'`) so a future format change can be detected on import.
- **This is a strictly better superset of the existing "profile URL" channel** for the common case (own library, logged in) — it works for **private** profiles too, which the profile-URL/Lambda path cannot. Worth positioning as such rather than as a mere Lambda-avoidance hack.

---

## Spike tasks (to move from "believable" to "proven")

1. ✅ **Done (2026-07-02).** Live-verified against a real Steam account. `rgGames` and `?xml=1` are both dead; the working mechanism is the React Query hydration blob mining described above (862 games extracted correctly, including names with special characters).
2. ✅ **Done.** `client/public/bookmarklets/export-library.js` — extraction logic tested live in-browser before being committed to the file; download-trigger mechanics (`Blob` + synthetic `<a download>`) are standard and not separately at risk. Cross-browser (Firefox) confirmation still open.
3. ✅ **Done (2026-07-11).** Import lands via `SteamIntegration.handleImportLibrary` → the unified `Library` shape, not the originally-sketched `SteamUser`/`loadGamesProgressively` path — see `library-source-convergence-plan.md` for why (ownership/entity split, Fork B2).
4. ✅ **Done (2026-07-11), verified live in-browser.** A cold-cache import renders immediately with zero Lambda calls (ownership + captured name only); when `AppDetailsCache` already has an appid (baked bundle or a prior online session), the import also picks up categories/genres/canonical name for free, with no network call from the import itself.
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

- [`../research/steam-profile-ssr-hydration-research.md`](../research/steam-profile-ssr-hydration-research.md) — the full structural reference this feature is built on
- [`traffic-safety-review.md`](./traffic-safety-review.md) — **why** this channel matters: zero Steam ownership traffic
- [`bookmarklet-capture-spike.md`](./bookmarklet-capture-spike.md) — the self-contained brief that implements this
- [`steam-user-categories-filesystem-plan.md`](./steam-user-categories-filesystem-plan.md) — the file-picker import mechanism to reuse
- [`../research/steam-api-research.md`](../research/steam-api-research.md) — the CORS/Lambda rationale this routes around
- [`../features/local-file-investigation.md`](../features/local-file-investigation.md) — the sibling "local files" channel (deferred)
- [`../features/desktop-app.md`](../features/desktop-app.md) — the vehicle that would unblock the local-files channel
- [`../features/first-load-experience.md`](../features/first-load-experience.md) — natural home for the "import your library" affordance

---
*— A1 / P1*
