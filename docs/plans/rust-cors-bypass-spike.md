# Spike: Rust CORS / Lambda Bypass (Desktop)

**Act**: 2 (post Tauri-vehicle spike) · **Status**: 🔵 Ready to start (self-contained brief for a fresh context) · **Model**: a cheaper model is fine, but needs a Windows + Rust + Tauri toolchain

> Standalone brief for a fresh context. Read the references first; you should not need the
> conversation that produced this. **Depends on the Tauri shell existing** (`desktop/tauri-app/`,
> which already builds — `bb4d1023`).

## Purpose (why this matters)

**Traffic safety toward Steam, taken to its limit.** The browser can't call Steam directly (CORS),
which is the entire reason our Lambda exists. Tauri's **Rust** backend has **no browser CORS** and
holds the user's WebView2 session — so on desktop we can talk to Steam directly and skip both the
Lambda hop *and* the extra request amplification. This is the desktop counterpart to the web-only
[Bookmarklet Capture Spike](../archive/bookmarklet-capture-spike.md). Framing: [Traffic Safety Review](traffic-safety-review.md).

## Read first
- [`desktop-tauri-spike-plan.md`](desktop-tauri-spike-plan.md) — vehicle status, the CORS-via-Rust note, event-driven boundary rules for Tauri commands.
- [`../features/desktop-app.md`](../features/desktop-app.md) — "Library capture without a bookmarklet" section (the injected-webview capture concept).
- `desktop/tauri-app/src/lib.rs` — current shell (bare default builder; you'll add commands here).
- [`manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md) — the verified extraction mechanism (React Query hydration blob mining — **not** `rgGames`/`?xml=1`, both confirmed dead 2026-07-02) to reuse in the injected webview.
- `client/public/bookmarklets/export-library.js` — the actual extraction code; inject this (or its logic) into the login webview rather than re-deriving it.
- [`../research/steam-profile-ssr-hydration-research.md`](../research/steam-profile-ssr-hydration-research.md) — full structure reference, including the `/my/` navigation-vs-fetch finding below.

## Goal
Prove two Rust-side capabilities, each returning data to the frontend over a typed Tauri command
(IPC), with **no call to our Lambda and no browser CORS**:

1. **Enrichment fetch** — given an appid, Rust fetches `store.steampowered.com/api/appdetails?appids=<id>`
   directly and returns the JSON. (Replaces the Lambda enrichment hop for cache-misses on desktop.)
2. **Ownership capture** — open a second WebView2 window navigated (not `fetch()`ed — see below) to
   `steamcommunity.com/my/games/?tab=all`. **Correction to an earlier version of this task**: `/my/`
   is actually the *better* target, not a worse one — confirmed via real browser navigation (not
   `fetch()`) that it resolves in a single `200` response with no vanity/steamid needed up front; the
   client-side router repaints the address bar afterward. A `fetch()` to the same URL fails
   (`503`/network error) — Steam appears to gate `/my/` against non-navigation requests, so the
   WebView2 window must actually **navigate**, not issue a background request. Full detail:
   [`../research/steam-profile-ssr-hydration-research.md`](../research/steam-profile-ssr-hydration-research.md)
   §1. Once resolved, inject the extraction script from `export-library.js`; return the captured
   library over IPC.

## Tasks
1. Add a Rust `fetch_app_details(appid)` Tauri command (use `reqwest` or the Tauri HTTP plugin);
   return raw JSON to the frontend. Confirm no CORS error and no Lambda involvement.
2. Add a login-window + JS-injection flow for ownership capture; return `{ appid, name, playtime }[]`.
   (The `?xml=1`-feed fallback floated in an earlier draft of this brief is dead — confirmed live,
   see `manual-library-export-feasibility.md`. If injection proves fiddly, the fallback direction
   is a Rust-side authenticated fetch of the games page HTML using the webview's session cookies,
   running the same blob-extraction logic against the fetched markup — untested, note findings if explored.)
3. Expose both as typed commands and wire a minimal frontend call that logs the results — **do not**
   fully integrate into the store pipeline in this spike; just prove the data crosses the boundary.
4. Note the production CORS/origin implications (`tauri.localhost`) already captured in the Tauri spike doc.

## Acceptance
- [ ] `fetch_app_details` returns valid appdetails JSON in the Tauri window with no CORS error, no Lambda call.
- [ ] Ownership capture returns a non-empty library for a logged-in user (injection, or the untested Rust-fetch fallback if pursued).
- [ ] Both are typed Tauri commands (respect the event-driven/typed-IPC boundary rules).
- [ ] A short written finding: which ownership route worked, and any WebView2 gotchas.

## Verification
- Run `cargo tauri dev`; trigger each command from a dev button/console; inspect returned payloads.
- Confirm via network inspection that traffic goes to Steam directly, not to `steam-api-dev.wehrly.com`.

## Handoff notes
- Keep commands small and typed; don't reach into the frontend's event bus from Rust — return data,
  let the frontend emit. Full pipeline integration is a follow-up, not this spike.
- This spike does **not** depend on the WebXR/VR question — it's pure native-capability proof.

## Related
- [Desktop App](../features/desktop-app.md) · [Tauri Spike](desktop-tauri-spike-plan.md) · [Traffic Safety Review](traffic-safety-review.md) · [Bookmarklet Capture Spike](../archive/bookmarklet-capture-spike.md)

---
*— A1 / P1*
