# Spike: Bookmarklet Library Capture

**Act**: 2 · **Status**: 🔵 Ready to start (self-contained brief for a fresh context) · **Model**: a cheaper model is fine

> This brief is intentionally standalone so it can be handed to a fresh, cheaper-model context.
> Read the two reference docs below first; you should not need the conversation that produced this.

## Purpose (why this matters)

**Traffic safety toward Steam.** Replacing the online "profile URL → Lambda → Steam `GetOwnedGames`"
path with a user-provided export means our infrastructure asks Steam **zero times** for that user's
library. See [Traffic Safety Review](traffic-safety-review.md). This is the web-side ownership fix;
the desktop equivalent is [Rust CORS/Lambda Bypass Spike](rust-cors-bypass-spike.md).

## Read first
- [`manual-library-export-feasibility.md`](manual-library-export-feasibility.md) — the full design, endpoint table, and CORS insight. **This spike implements it.**
- `client/src/steam-integration/SteamIntegration.ts` — `loadGamesForUser` / `loadDemoGames` show the pipeline entry contract (`SteamUser { games: SteamGame[] }`).
- `client/src/steam/fixtures/demo-games.ts` — how a games array is shaped and batch-emitted with no network.

## Goal
A working two-part flow: (1) a bookmarklet that captures the logged-in user's full library from their
own Steam games page and downloads it as JSON; (2) an app-side import that feeds that JSON into the
store, rendering with **enrichment disabled** (proving the zero-Steam-traffic path).

## Tasks
1. **Live-verify the source.** On `steamcommunity.com/my/games/?tab=all`, confirm the `rgGames` JS
   variable still embeds the full owned list and capture its **current** field names (`appid`, `name`,
   `hours_forever`/`playtime_forever`, logo). Confirm the `?xml=1` fallback shape too.
2. **Build the export bookmarklet** (~15 lines): read `rgGames` → map to
   `{ appid, name, playtime_forever }` → wrap in `{ schema:'sbam-library-export/v1', game_count, games }`
   → `Blob` → synthetic `<a download>` Save dialog. Test on Chrome + Firefox.
3. **Build the importer** in the client: reuse the file-picker approach from
   [`steam-user-categories-filesystem-plan.md`](steam-user-categories-filesystem-plan.md) §2
   (`showOpenFilePicker` + `<input type=file>` fallback). Parse, validate the schema, map to
   `SteamUser`, and feed the existing entry (`gameLibrary.setUserData` → batch-emit, demo-games style).
4. **Prove the offline path**: render the imported store with the Lambda enrichment path **off** —
   boxes + names + playtime-sort must work from the file + CDN artwork alone.

## Acceptance
- [ ] Bookmarklet downloads a valid `steam-library.json` from a real logged-in games page.
- [ ] App imports that file and populates the store.
- [ ] Store renders with enrichment disabled — **no Steam ownership request made by our code**.
- [ ] Graceful failure when `rgGames` is absent (clear message; `?xml=1` fallback documented).

## Verification
- Manual: log into Steam, open own games page, click bookmarklet, inspect the JSON, import it, watch
  the shelves populate with the network tab showing no calls to our Lambda `/games` or `/resolve`.
- Unit: schema parse/validate + `SteamUser` mapping (mock the file read at the boundary).

## Handoff notes
- Keep the import an **additive entry point** — do not disturb the existing profile-URL/demo paths.
- Bookmarklet install friction is real: dragging to the bookmarks bar is the reliable path; document it.
- Do not build the desktop variant here — that's the Rust spike.

## Related
- [Manual Library Export](manual-library-export-feasibility.md) · [Traffic Safety Review](traffic-safety-review.md) · [First Load Experience](../features/first-load-experience.md)

---
*— A1 / P1*
