# Spike: Rust CORS / Lambda Bypass (Desktop)

**Act**: 2 (post Tauri-vehicle spike) · **Status**: 🔵 Ready to start · **Model**: a cheaper model is fine, but needs a Windows + Rust + Tauri toolchain

> Standalone brief. Read the references first; you should not need the conversation that produced
> this. **Depends on the Tauri shell existing** (`desktop/tauri-app/`, which already builds —
> `bb4d1023`).

## Purpose (why this matters)

**Traffic safety toward Steam, taken to its limit.** The desktop app should be able to fetch game
details **oblivious to the Lambda** — not "circumventing" it as an obstacle, but simply not needing
it, because Tauri's Rust backend has no browser CORS and can talk to Steam directly. The client-side
code making these calls is structurally similar to what the Lambda does today, just relocated to run
on the user's machine instead of ours. Framing: [Traffic Safety Review](traffic-safety-review.md).

## Scope: SteamSpy calls from the client are in scope — but the real problem is latency, not politeness

**Correction to an earlier version of this doc.** A prior draft excluded SteamSpy from this spike on
the theory that many independent desktop clients each calling SteamSpy would create dangerous
*aggregate* load the way distributed Steam Web API traffic could. That framing is dropped: there's no
strong reason to believe SteamSpy would recognize or throttle against a distributed-client traffic
pattern differently than it already tolerates today, and multiple well-behaved, individually-paced
clients isn't the same failure mode as one client hammering a rate limit. **We do need to call
SteamSpy from the client to get tags and power sort/filter, and that's in scope for this spike.**

**The real problem is UX, and it's a genuine one.** SteamSpy enforces roughly ~1 request/second with
**no bulk endpoint** (`STEAMSPY_DELAY_MS = 1100` in `lambda-hydrator-src/index.js`, confirmed live
with 429 + exponential-backoff handling already in that code). For a library the size of a typical
enthusiast's (several hundred games), that's **several minutes of sequential fetching** before tags
are available — `steam-tag-pipeline.md` already clocked this at "13+ minutes for 800 games." Building
sort/filter functionality that depends on a multi-minute serial fetch on every session is a shaky
foundation regardless of who's making the calls. **This spike still fetches SteamSpy directly via
Rust for cache-misses** (same CORS-free pattern as `appdetails`), but it must not be the *only* answer
to tag availability — see "The SteamSpy latency problem" below for the parallel efforts underway to
make this fast/robust, independent of this spike.

**So: this spike covers both `appdetails` (genres, categories, developers, publishers, name) and
SteamSpy tags/review-score** as two Rust-side fetches, both CORS-free and Lambda-free. The output
must integrate with the progressive/gated availability behavior described below — don't block the
whole enrichment pipeline on SteamSpy finishing.

## The SteamSpy latency problem (parallel tracks, not blocking this spike)

Several complementary angles are being pursued to make tag availability fast/robust, tracked
separately so none of them block this spike:

1. **Serve an already-hydrated bulk snapshot from S3/CloudFront** — the hydrator already accumulates
   tag data into S3; a small Lambda could keep a continuously-current, cheap-to-serve bundle so a
   fresh client starts with everything gathered so far, only calling SteamSpy live for the residual
   gap. Already planned in detail: [`appdetails-bundle-lambda-plan.md`](appdetails-bundle-lambda-plan.md) — 🔮 proposed, not started.
2. **Progressive/graceful fade-in** — sort/filter by tag shouldn't be all-or-nothing gated on 100%
   coverage; e.g. once a majority of the library has tags, the feature can activate. See
   [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md) for the gating
   mechanism this needs to plug into.
3. **Another bulk-alternative search** — re-run the search for a bulk/dump-style tag source (IGDB,
   RAWG.io, a SteamSpy bulk mode not yet found, etc.). See
   [`steamspy-bulk-alternatives-research-prompt.md`](../research/steamspy-bulk-alternatives-research-prompt.md) — ready to resume, no longer gated on local-file investigation reporting back first (see note in that doc).
4. **Check whether Steam's own store pages embed tags client-side** — Steam's store page for a game
   visibly shows community tags; the open question is whether that's server-rendered-only or embedded
   in a hydration payload the way `OwnedGames` was found to be (`steam-profile-ssr-hydration-research.md`).
   This lead is already flagged (not yet executed) in `steamspy-bulk-alternatives-research-prompt.md`'s
   "promising leads" section — worth explicit follow-up given it could be a genuinely free, first-party,
   CORS-free-from-the-store-origin source.
5. **Local Steam-install data mining (desktop, considered the best bet)** — being picked up next in a
   separate context; see [`local-file-investigation.md`](../features/local-file-investigation.md). If
   locally-mined data can approximate or replace SteamSpy tags, it sidesteps this whole problem for
   desktop users entirely.

This spike's job is narrower than any of the five: prove the direct Rust SteamSpy fetch works
end-to-end for the cache-miss case. The five items above are what make that fetch fast/robust/rarely
needed in practice — pursue them on their own tracks.

## Read first
- [`desktop-tauri-spike-plan.md`](desktop-tauri-spike-plan.md) — vehicle status, the CORS-via-Rust note, event-driven boundary rules for Tauri commands.
- [`../features/desktop-app.md`](../features/desktop-app.md) — "Library capture without a bookmarklet" section (the injected-webview capture concept).
- `desktop/tauri-app/src/lib.rs` — current shell (bare default builder; you'll add commands here).
- `client/src/steam/SteamApiClient.ts`, `client/src/steam/batch/BatchAppDetailsClient.ts`, `client/src/steam/cache/AppDetailsCache.ts` — the web-side surface Step 2's wiring question is about (see below).
- [`../research/steam-store-appdetails-cors-research.md`](../research/steam-store-appdetails-cors-research.md) — confirms `appdetails` carries no community tags at all; this is why SteamSpy is a genuinely separate fetch, not a field Steam's own endpoint is failing to return.
- `external-tool/infrastructure/lambda-hydrator-src/index.js` — the reference implementation for the SteamSpy fetch shape (`fetchSteamSpyData`), including the 429/backoff handling to mirror on the Rust side.
- [`manual-library-export-feasibility.md`](../archive/manual-library-export-feasibility.md) and `client/public/bookmarklets/export-library.js` — the ownership-capture extraction logic (Task 2, already largely resolved — see below).

## Order of work (do these in sequence — don't skip to wiring)

### Step 1 — Prove both calls, log them, verify end-to-end, *before* touching wiring

Goal: confirm Rust can fetch (a) `store.steampowered.com/api/appdetails?appids=<id>` and (b)
`steamspy.com/api.php?request=appdetails&appid=<id>`, each with no CORS error and no Lambda
involvement, and that the responses are real, fresh data — before any integration work assumes it.
Treat these as two separate proofs; don't conflate them into one command.

1. Add throwaway Rust commands (`fetch_app_details_debug(appid)`, `fetch_steamspy_debug(appid)` or
   similar — naming doesn't matter, this isn't the final shape) using `reqwest` or the Tauri HTTP
   plugin. Call each from a dev button/console in the Tauri window. **Log the raw response** — status,
   headers, body — don't just assert success. For the SteamSpy command, mirror the hydrator's own
   429/backoff handling (`fetchSteamSpyData` in `lambda-hydrator-src/index.js`) rather than assuming
   the happy path.
2. **Prove it's a live fetch, not an artifact of some cache, using a deliberately-uncached appid:**
   - Pick an appid you can confirm is **not** in the baked S3 cache — check
     `client/public/steam-cache/app-details-*.json.gz` (the release bake) for absence, or pick a very
     recently released game unlikely to be hydrated yet.
   - Confirm absence first (grep the bundle, or check `AppDetailsCache`'s IndexedDB store in
     devtools if running against a build that has one).
   - Run both Step-1 fetches against that appid and confirm the returned data is real and
     appid-correct (name/genres for the appdetails call; tags for the SteamSpy call — note the
     SteamSpy call may legitimately return "not enough data" for a very new/obscure appid, which is a
     valid result, not a failure).
   - **Time the SteamSpy call.** Confirm it actually takes ~1s (i.e. the rate limit is real and
     observed, not just documented) — this number is what makes the latency problem concrete rather
     than theoretical, and is worth having measured firsthand.
3. Confirm via network inspection that each request goes to its real destination
   (`store.steampowered.com`, `steamspy.com`) directly — not `steam-api-dev.wehrly.com` (i.e.,
   genuinely no Lambda in the path for either).

**Do not proceed to Step 2 until this is solid.** The point of doing this first is that wiring
changes are much cheaper to get right once the underlying calls are proven, and much more annoying to
debug if either fetch turns out to have some CORS/auth/format wrinkle discovered only after
integration.

### Step 2 — Wiring changes

Once Step 1 is proven, wire it into the real pipeline. **Open question worth resolving explicitly
before writing code, not deciding by default:** does this become a second implementation behind a
shared interface, or a conditional inside the existing client?

- **Recommended shape**: declare an interface (e.g. `AppDetailsProvider` or similar — exact naming is
  an implementation detail) with two implementations — a **web** one that wraps today's
  `BatchAppDetailsClient` (Lambda-backed for both appdetails and tags), and a **desktop** one that
  calls the Step-1 Rust commands directly (both appdetails and SteamSpy). `SteamApiClient` /
  `GamesLoader` depend on the interface, not on `BatchAppDetailsClient` concretely. Desktop's Tauri
  context is detectable at startup (`window.__TAURI__` or equivalent), so the choice of implementation
  is a one-time startup decision, not a per-call branch.
- **Why this fits the project rather than being a new pattern**: this is exactly the "capability-based
  handler selection" rule already in the root `CLAUDE.md` — default (web/Lambda) handler provides
  baseline functionality, a feature-rich (desktop/Rust) handler self-registers when the capability is
  available. It's also consistent with "zero cross-class dependencies" — the interface boundary is
  the contract, not a direct method call into Tauri internals from shared code.
  `AppDetailsCache` (the IndexedDB layer) stays untouched either way — both implementations still
  populate the same cache, they just differ in how a cache-miss gets filled.
- **The SteamSpy leg of the desktop implementation must not block the pipeline.** Given the ~1s/appid
  pacing, a library of any real size cannot wait on SteamSpy before rendering. The desktop provider
  should return appdetails immediately per-appid and let SteamSpy tags arrive asynchronously/lazily —
  same "renderable now, enrich later" shape `GamesLoader` already uses for the Lambda path
  (`emitCachedGames` vs. `fetchAndEmitUncached`). Don't design a new synchronous-wait pattern here;
  reuse that one.
- **What stays the same regardless of the interface question**: `AppDetailsCache` and the baked-bundle
  seeding stay identical across web and desktop — only "how do we fill an appdetails/SteamSpy
  cache-miss" forks between the two implementations.

### Step 3 — Verify

Re-run the Step 1 verification (uncached appid, confirm fresh data for both appdetails and SteamSpy,
confirm no Lambda call) but this time through the real pipeline (`SteamApiClient`/`GamesLoader`), not
the throwaway debug commands. Confirm existing behavior for web is unchanged (same interface,
Lambda-backed implementation, no regressions). Confirm the box/name/genres render immediately while
SteamSpy tags fill in asynchronously — i.e. confirm the non-blocking behavior from Step 2 actually
holds under the real pipeline, not just in isolation.

## Ownership capture (Task 2 — separate thread, mostly already resolved)

This spike originally also covered capturing a user's owned-games list via an injected/navigated
WebView2 window. That work already progressed in a prior context and largely converged: `/my/games/`
must be **navigated**, not `fetch()`ed (Steam gates non-navigation requests to that path — confirmed
`503`/network error on `fetch()`, clean `200` on navigation), and the extraction logic already exists
at `client/public/bookmarklets/export-library.js`. If resuming this thread in the same spike pass:
inject that script's logic into the navigated webview and return the result over Tauri IPC. This is
independent of the `appdetails`/SteamSpy scoping above and can proceed on its own schedule.

## Acceptance
- [ ] Step 1: Rust commands fetch `appdetails` **and** SteamSpy tags for a deliberately-uncached appid, both logged, confirmed live (not cached), confirmed no Lambda call. SteamSpy's ~1s pacing observed firsthand, not just assumed from docs.
- [ ] Step 2: an interface decision is made and documented (even if the decision is "not yet, keep it a direct call for the spike"); desktop's SteamSpy leg is non-blocking, mirroring `GamesLoader`'s renderable-now/enrich-later shape.
- [ ] Step 3: same verification as Step 1, run through the real pipeline; web path unregressed; boxes render before tags arrive.
- [ ] A short written finding on the interface-vs-conditional decision, for whoever picks this up next.

## Verification
- Run `cargo tauri dev`; trigger commands from a dev button/console; inspect returned payloads.
- Confirm via network inspection that `appdetails` and SteamSpy traffic each go to their real destination directly, with no Lambda in the path.

## Handoff notes
- Keep commands small and typed; don't reach into the frontend's event bus from Rust — return data, let the frontend emit.
- This spike does **not** depend on the WebXR/VR question — it's pure native-capability proof.
- This spike proves the direct-fetch mechanism works; it does not by itself solve the multi-minute-library latency problem — that's the five-item list above, pursued separately. Don't treat "the Rust call works" as "the UX problem is solved."
- Local Steam-install data mining (a separate thread — see `local-file-investigation.md`) is being picked up in a different context; nothing here blocks on it, though it may eventually inform the interface's desktop implementation (e.g. install-presence signals, or a tag-equivalent local source that reduces reliance on this fetch entirely).

## Related
- [Traffic Safety Review](traffic-safety-review.md) — why this matters
- [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md) — the field-by-field source table, and the progressive-availability gate this spike's output should feed
- [Appdetails Bundle Lambda Plan](appdetails-bundle-lambda-plan.md) — the bulk-snapshot approach that reduces how often this spike's SteamSpy fetch is even needed
- [SteamSpy Bulk Alternatives Research](../research/steamspy-bulk-alternatives-research-prompt.md) — parallel search for a way to avoid the 1 req/sec fetch entirely
- [Desktop App](../features/desktop-app.md) · [Tauri Spike](desktop-tauri-spike-plan.md)
- [Release Pipeline](release-pipeline-plan.md) — the baked cache both web and desktop seed from before any live fetch happens

---
*— A1 / P1*
