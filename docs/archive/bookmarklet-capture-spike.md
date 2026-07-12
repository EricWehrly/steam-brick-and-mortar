# Spike: Bookmarklet Library Capture

**Act**: 2 · **Status**: ✅ Fully built — capture (Tasks 1–2) live-verified 2026-07-02; import (Tasks 3–4) landed 2026-07-11 via `library-source-convergence-plan.md`, also live-verified · **Model**: a cheaper model is fine

> This brief is intentionally standalone so it can be handed to a fresh, cheaper-model context.
> Read the reference docs below first; you should not need the conversation that produced this.
> **Note**: the original version of this brief specified `rgGames`/`?xml=1` as the capture source.
> Both are confirmed dead (Steam rebuilt profile pages as SSR React since). The real, working
> mechanism is documented in `manual-library-export-feasibility.md` and already implemented in
> `client/public/bookmarklets/export-library.js` — read that file, don't re-derive the extraction.

## Purpose (why this matters)

**Traffic safety toward Steam.** Replacing the online "profile URL → Lambda → Steam `GetOwnedGames`"
path with a user-provided export means our infrastructure asks Steam **zero times** for that user's
library. See [Traffic Safety Review](../plans/traffic-safety-review.md). This is the web-side ownership fix;
the desktop equivalent is [Rust CORS/Lambda Bypass Spike](../plans/rust-cors-bypass-spike.md).

## Read first
- [`manual-library-export-feasibility.md`](manual-library-export-feasibility.md) — the full design, the verified extraction mechanism, and the CORS insight.
- `client/public/bookmarklets/export-library.js` — **the capture half, already built.** Read this before touching Tasks 1–2; they're done.
- `client/src/steam-integration/SteamIntegration.ts` — `loadGamesForUser` / `loadDemoGames` show the pipeline entry contract (`SteamUser { games: SteamGame[] }`). Relevant to Task 3.
- `client/src/steam/fixtures/demo-games.ts` — how a games array is shaped and batch-emitted with no network. Relevant to Task 3.

## Goal
A working two-part flow: (1) a bookmarklet that captures the logged-in user's full library from their
own Steam games page and downloads it as JSON; (2) an app-side import that feeds that JSON into the
store, rendering with **enrichment disabled** (proving the zero-Steam-traffic path). **Part 1 is done
— this brief's remaining work is Part 2 (Tasks 3–4).**

## Tasks
1. ✅ **Done.** Live-verified against a real Steam account (2026-07-02). Source is *not* `rgGames`
   (confirmed dead) — it's a React Query hydration blob embedded in the current SSR games page,
   keyed by a query named `OwnedGames`. Extraction implemented and tested: 862 games, all fields
   correct. Full writeup in `manual-library-export-feasibility.md` → "The verified mechanism".
2. ✅ **Done.** `client/public/bookmarklets/export-library.js` — finds the right `<script>`, extracts
   the array, maps to `{ appid, name, playtime_forever }`, wraps in
   `{ schema:'sbam-library-export/v1', game_count, games }`, downloads via `Blob` + synthetic
   `<a download>`. Extraction logic tested live in-browser; the file itself has not yet been
   installed as an actual `javascript:` bookmark and click-tested end-to-end, and Firefox is
   unconfirmed — do that first if picking this up.
3. ✅ **Done (2026-07-11).** Importer built via `SteamIntegration.handleImportLibrary`, feeding the
   unified `Library` shape (not the originally-sketched `SteamUser`/`gameLibrary.setUserData` path
   — see `library-source-convergence-plan.md`, Fork B2, for why). File-picker reuse from
   [`steam-user-categories-filesystem-plan.md`](../plans/steam-user-categories-filesystem-plan.md) §2
   landed as designed.
4. ✅ **Done (2026-07-11), verified live in-browser.** Imported store renders with zero Lambda calls
   from boxes + names + playtime-sort alone; separately, when `AppDetailsCache` already has an
   appid (baked bundle or a prior online session), the import also gains categories/genres for
   free with no network call of its own — see `GamesLoader.enrichFromCache`.

## Acceptance
- [x] Bookmarklet downloads a valid `steam-library.json` from a real logged-in games page. (Extraction logic verified live; full click-through-as-installed-bookmark pass still worth doing.)
- [x] App imports that file and populates the store.
- [x] Store renders with enrichment disabled — **no Steam ownership request made by our code**.
- [x] Graceful failure when the data block is absent (implemented: `alert()` with a clear message, no silent empty import).

## Verification
- Manual: log into Steam, open own games page, click bookmarklet, inspect the JSON, import it, watch
  the shelves populate with the network tab showing no calls to our Lambda `/games` or `/resolve`.
- Unit: schema parse/validate + `SteamUser` mapping (mock the file read at the boundary).

## Handoff notes
- Keep the import an **additive entry point** — do not disturb the existing profile-URL/demo paths.
- Bookmarklet install friction is real: dragging to the bookmarks bar is the reliable path; document it.
- Do not build the desktop variant here — that's the Rust spike.

## Related
- [Manual Library Export](manual-library-export-feasibility.md) · [Traffic Safety Review](../plans/traffic-safety-review.md) · [First Load Experience](../features/first-load-experience.md)

---
*— A1 / P1*
