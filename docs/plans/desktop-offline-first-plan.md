# Plan: Desktop Offline-First (Refresh Behavior & Transport)

**Status**: Round 1 done. Round 1.5 (don't block the first render on the network gap-fill) is now
the top-priority next fix - see Correction below. Rounds 2+ scheduled but not started.
**Parent feature**: [Native Desktop App](../features/desktop-app.md)
**Related**: [Desktop Local Data Pipeline Plan](desktop-local-data-pipeline-plan.md), [Taxonomy Data Event Plan](taxonomy-data-event-plan.md)

## Why this doc exists

First real end-to-end test of the local-scan startup pipeline (see the pipeline plan above)
surfaced three real problems at once, all downstream of one interaction: `SteamIntegration.
applyLibrary()`'s "Fork A" — an automatic background re-fetch that fires whenever a rendered
`Library` carries a `steamId` — fired for the new `local-scan` channel too, exactly as designed
(re-fetchability was deliberately "a property of having a steamId, not of the channel"). That
design was fine for bookmarklet/file imports. For local-scan it was wrong: local-scan's entire
point is fast, offline, filesystem-sourced data, and Fork A silently threw a 40+ second blocking
Lambda round-trip and a full scene reset on top of it, on every single desktop launch.

## Correction (second test session, after Round 1 landed)

The "~300 Lambda calls" observation below was originally attributed entirely to Fork A. A second
test, after the Round 1 fix, still showed the same 208-appid, 3-batch fetch — but Fork A no
longer fires for local-scan, so it couldn't be the cause. The actual source, confirmed via the
log: `LocalSteamLibraryLoader`'s own `resolveRemainingAppidsFromNetwork()` (the collection-appid
network gap-fill built in the same session as Fork A) **awaits the full network resolution of
every missing appid before emitting `ImportLibrary` at all** — so the "fast, offline" local-scan
render doesn't actually happen fast when there's a large gap between what's locally resolvable
and what the user's real collections/playtime reference. In this run: 208/208 missing appids,
~13-14 seconds this time (down from ~40s previously, likely SteamSpy-hydration-warmth variance,
not a fix). Fork A was real and worth fixing (it added a *second*, compounding scene-reset wait,
and is confirmed gone in the second log - zero `Unknown tier: mid` occurrences), but it was never
the *primary* blocking cause the user was pointing at. **This is the actual highest-priority item
for the next round of this plan** - see "Round 1.5" below.

## What was actually observed (one real test session, real library)

- **~300 Lambda calls the user expected to be unnecessary.** Confirmed (see Correction above) to
  be `LocalSteamLibraryLoader`'s own blocking network gap-fill, not Fork A — 208 cache-incomplete
  appids, 3 sequential network batches, blocking `ImportLibrary`'s emission until all of them
  resolve or fail (SteamSpy's known ~1.1s/request rate limit, see
  `sort-filter-data-provenance.md`, contributes to why this can run long).
- **Fork A compounded it further, on top of the above**: when it fired (first test session only —
  fixed in Round 1), `handleLoadLibrary` emits `StorePropsEventTypes.LibraryReloadRequest`
  (tearing the scene down) *before* awaiting its own separate online fetch, so the local-scan
  library that had just finished rendering got wiped a second time and had to wait again.
- **`[LodTextureArrayManager] ERROR Unknown tier: mid` (1404 times)** — the log shows a clean
  first texture-tier init during the initial demo-store load, then a second full re-init
  coinciding almost exactly with Fork A's `LibraryReloadRequest` reset, after which every
  `setSlotPixels(MID, ...)` call failed because the tier map came back empty. Very likely a race
  in `LodArtworkOrchestrator`/`LodTextureArrayManager`'s reset/rebuild sequence — not yet
  root-caused beyond "the reload-driven reset is the trigger." Not currently reachable through
  the primary flow anymore (see Round 1 below), but latent: any other path that legitimately
  fires `LibraryReloadRequest` (a real "Connect Steam" flow, a manual "Refresh Cache Now") could
  still hit it. Tracked as tech debt:
  `docs/tech-debt.md#id-lod-tier-reset-race-condition`.
- **~1240 CORS-blocked `fetch()` calls** to `cdn.akamai.steamstatic.com/steam/apps/<appid>/
  library_600x900.jpg` — a separate, independent problem, not caused by Fork A. Local-scan
  entries have no real capsule/header URL (local scan can't discover the CDN hash the way
  `appdetails` can), so they fall back to `deriveArtworkFromAppId()`'s guessed direct-CDN URL,
  and the browser can't read cross-origin pixel data from it without a CORS-permitting response,
  which Akamai's Steam CDN doesn't send. This path (`ArtworkUrls.ts`) existed before this session,
  built for occasional bookmarklet/file-import fallback use — local-scan is the first caller to
  exercise it at whole-library scale. See "Next up" below.

## Round 1 — done this session

**Fix**: `applyLibrary()`'s Fork A now excludes the `local-scan` channel outright —
`library.owner.steamId && library.provenance.channel !== 'local-scan' && AppSettings.get
('autoLoadProfile')`. Local-scan already has real filesystem-sourced data for this run; the
"Connect Steam" flow remains the explicit, user-initiated path to full online completeness and
is completely unaffected by this change — this only stops local-scan from silently triggering
it automatically. Tested: `client/test/unit/steam-integration/import-library.test.ts`'s new
"Fork A background re-fetch" block (local-scan excluded; bookmarklet/file unaffected; no-steamId
case unaffected either way).

**Not fixed, deliberately**: the underlying `LibraryReloadRequest` reset race (LOD tier loss) and
the CORS-blocked artwork fallback. Round 1 just stops the one trigger that was firing
automatically on every desktop launch; both underlying issues are still real and still
reachable through other paths.

## Round 1.5 — not started, now the actual top priority: don't block the first render on the network gap-fill

Per the Correction above, this — not Fork A — is the real reason local-scan doesn't feel "fast,
offline" on a library with a large local/collections gap. `LocalSteamLibraryLoader.
loadLocalSteamLibrary()` currently does, in order: local resolution → **await full network
resolution of every unresolved appid** → build the final game list → emit `ImportLibrary` once.
That single blocking `await` is the bug.

**Proposed shape**: split into two emissions instead of one.
1. Emit `ImportLibrary` immediately once local resolution finishes, with whatever candidate
   appids already have an entry (local or previously-cached) — this is the fast, no-network path
   and should render in roughly the time local-scan itself takes, regardless of how large the
   local/collections gap is.
2. Kick off `resolveRemainingAppidsFromNetwork()` in the background (not awaited before the first
   emission). When it resolves (fully, or partially - whatever came back before any failures),
   emit a second update for just the newly-resolved appids, rather than re-emitting/replacing the
   whole library.
3. This is a narrower, local-scan-specific version of Round 2's "upgrade, don't replace" idea
   (§below) - worth building this one now rather than waiting on the general mechanism, since the
   fix here is simple (don't await the gap-fill before the first render) and the general Round 2
   design doesn't exist yet. Round 2, once built, may end up subsuming this.

## Round 2 — scheduled, not started: refresh should upgrade, not replace

Currently, *any* re-fetch that does fire (Fork A on other channels, "Connect Steam" once built,
a future manual "Refresh Cache Now") replaces the whole rendered library via
`LibraryReloadRequest` — a full scene teardown and rebuild, no matter how much of the data
actually changed. The user's framing: **most of a re-fetched library's data won't have changed**
(genres/categories/tags/ownership are mostly stable), so a full replace is nearly always more
disruptive than necessary.

**Proposed shape** (not designed in detail yet):
1. When a refresh's fetched data lands, diff it against what's currently rendered per-appid
   (name, playtime, taxonomy fields) rather than assuming everything changed.
2. Only the appids/batches that actually differ get patched/repainted; everything else stays as
   rendered, no `LibraryReloadRequest`, no full-scene disruption.
3. Applies to **both web and desktop** — this isn't a desktop-only fix. The online "Connect
   Steam"/existing web refresh paths get the same benefit once built.
4. Cost note: making the *comparison* still means fetching the data (the Lambda/network calls
   still happen) - the win here is disruption avoidance and eventual "only re-paint what changed"
   smoothness, not fewer network calls. That's Round 3's concern.

## Round 3 — scheduled, not started: route calls through Tauri's Rust HTTP client

Desktop currently issues Lambda/appdetails calls through the embedded WebView2 browser's `fetch()`
— same as web, no advantage taken of being a native app. Rust has no browser CORS restriction and
can hit `store.steampowered.com`/the Lambda directly (this is already the plan for the "Connect
Steam" flow's own enrichment path per `desktop-app.md`). Migrating desktop's existing network
calls (SteamSpy/Lambda `appdetails`, and potentially the CORS-blocked artwork fetch below) to a
Tauri command would:
- Sidestep the CORS-blocked artwork problem structurally, not just for local-scan's fallback case.
- Remove desktop's dependency on the browser's fetch/CORS model entirely for these calls.

Not scoped in detail - a real design pass needed (which calls move, whether the client keeps a
web-compatible code path or branches on `isTauri()`, error handling parity).

## Next up: the CORS-blocked artwork fallback

Flagged as **the next concrete thing to fix** (after this plan's rounds above are scheduled, not
before) - **not fixed in this session**. Two considered fits, neither committed:
- Fold into Round 3 (Rust HTTP client migration) - solves it structurally, but only once that
  broader migration actually lands.
- A narrower, faster interim fix: don't derive a doomed direct-CDN URL for locally-resolved
  entries with no real capsule hash at all - accept placeholder/label artwork (same fallback
  pattern already used for `undesirable_for_demo` entries) until real data is available, rather
  than eating ~1240 failed cross-origin fetches on every desktop launch. Cheaper, but doesn't
  actually get better artwork onto these games' boxes.

## Log noise: CORS and 404 are frequently indistinguishable, and the console shouldn't spam per-request

A second real-library test session (2885 log lines) was made tractable by writing a small
line-dedup script (normalize timestamps/ids, group, count) rather than reading it linearly -
worth reaching for again on any future noisy-log investigation. That pass surfaced something
already anticipated in the code, not a new discovery: `GameArtworkRequest.categorizeError()`
(`client/src/scene/game-box/instancing/GameArtworkRequest.ts`) has a comment block explaining
that `fetch()` with `mode: 'cors'` throws the *same* generic `TypeError` for a true CORS block
and for a 404 served without CORS headers - the browser can't tell the caller which one happened,
and Chrome's console reports both identically as "blocked by CORS policy." The code's own
comment says as much: *"When the CDN returns 404 WITHOUT CORS headers, CORS fires first... treat
any 404 as permanent."* In practice, though, the CORS-pattern check runs first and matches both
cases, so a same-origin-blocked case and a genuinely-missing-image case both currently get
bucketed as `'CORS'`, not `'404'` - the user's hunch on this (many of these are 404s wearing a
CORS costume) matches what the code already suspected about itself.

**Two follow-ups, neither started**:
1. **Reduce console noise**: per-request `console.error`-level CORS-block lines (1200+ of them in
   one session) should not print individually. Swallow them at the point they're caught, count by
   category (`failureReason` - `GameArtworkProvider` already tracks this per-appid in
   `failureCache`, just not aggregated/surfaced), and print one periodic or end-of-batch summary
   line (e.g. `"Artwork: 1240 unresolved (CORS/404-ambiguous), 12 timeout, 3 decode-error"`).
2. **Actually distinguish CORS from 404**: not reliably possible from browser `fetch()` alone
   regardless of logging changes - needs a channel that isn't subject to the browser's CORS
   model, i.e. Round 3's Tauri Rust HTTP client (a Rust-side request can read the real status
   code). Until Round 3 lands, categorization stays best-effort/ambiguous for this specific case.

## Getting ahead of doomed requests: pre-baking known-missing artwork

Related idea, not started: `GameArtworkProvider.failureCache` (`client/src/scene/game-box/
instancing/GameArtworkProvider.ts`) is a plain in-memory `Map` - failures aren't persisted, so
every fresh launch re-attempts every URL from scratch, including ones already known (from a prior
run, or in principle from a shared/baked source) to permanently 404. The user's proposal: once a
failure is confirmed real/permanent (a genuine `404`, not an ambiguous CORS-or-404 case - see
above, this is why distinguishing the two matters beyond just log noise), persist that fact
(IndexedDB, alongside `AppDetailsCache`, or a baked static list shipped similarly to the F2P
artwork bake) so future launches skip the doomed request entirely instead of re-learning the
same failure every time. Not scoped in detail - depends on Round 3 landing first, since reliably
confirming "this really is a 404" needs the non-browser fetch path above.

## Related
- `client/src/steam-integration/SteamIntegration.ts` - Fork A, `applyLibrary()`
- `client/src/steam/LocalSteamLibraryLoader.ts` - the actual blocking gap-fill (Round 1.5)
- `client/src/steam/utils/ArtworkUrls.ts` - `deriveArtworkFromAppId`, the CORS-blocked fallback
- `client/src/scene/game-box/instancing/GameArtworkRequest.ts` - `categorizeError`, the CORS/404 ambiguity
- `client/src/scene/game-box/instancing/GameArtworkProvider.ts` - `failureCache`, currently in-memory only
- `client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts`,
  `LodTextureArrayManager.ts` - the reset-driven tier-loss race
- `docs/tech-debt.md#id-lod-tier-reset-race-condition` - tracked debt for the tier race
- `docs/features/desktop-app.md` - umbrella feature doc

---
*— A1 / P1 / T1*
