# Plan: Desktop Offline-First (Refresh Behavior & Transport)

**Status**: See **"Definitive root cause (sixth pass)"** immediately below — a log with per-appid
success/failure instrumentation finally isolated the real second-load bug, and it is **not** any
of the things the earlier chronological passes chased. The one-line version: **on desktop, every
launch after the first renders the same library twice — once from the persisted snapshot, once
from the fresh local-scan — and the second render's teardown-and-rebuild is what strips the
artwork.** Everything below "Definitive root cause" is preserved as archaeology; read the sixth
pass first.

**Next up (re-prioritised by the sixth pass)**: (1) **kill the desktop double-render** — Tier A
(skip the redundant reload when nothing changed) and Tier B (diff-and-patch when it doesn't) **both
done 2026-07-14**, see [Desktop Startup Load Ordering](desktop-startup-load-ordering-plan.md) for
the full design; (2) Round 1.5 (don't block the first render on the network gap-fill — still valid,
but it is a *first*-load latency issue, not the second-load breakage); (3) Round 3 (Tauri Rust HTTP
client) and wiring Tier B's diff-and-patch mechanism to a remote fetch (Tier 3 in the load-ordering
plan), neither started. CORS/404 log-noise and pre-baking-known-failures are follow-ups.
`lod-tier-reset-race-condition` fix landed 2026-07-14 but the sixth pass shows the reset it guards
is itself a *symptom* of the double-render, not the disease.
**Parent feature**: [Native Desktop App](../features/desktop-app.md)
**Related**: [Desktop Local Data Pipeline Plan](desktop-local-data-pipeline-plan.md), [Taxonomy Data Event Plan](taxonomy-data-event-plan.md), [artwork resolution flow diagram](../diagrams/artwork.md), [Desktop Startup Load Ordering](desktop-startup-load-ordering-plan.md)

## Definitive root cause (sixth pass, 2026-07-14) — the desktop double-render

A log captured with new per-appid `GameArtworkRequest` success/failure instrumentation settled it
with numbers instead of theory. Library size: 1485 games.

**Artwork fetching is not the problem, and the constructed CDN URL is fine on desktop:**
- **1423 unique appids resolved artwork successfully** via the constructed
  `library_600x900.jpg` URL — the same `deriveArtworkFromAppId()` path the web client uses,
  unchanged, working. `deriveArtworkFromAppId` did not regress; this lays that question to rest.
- Only **80 distinct appids failed**, and **65 of them are appids ≥3,000,000** (brand-new / demo /
  unreleased titles) and **126 of the failure lines name a Demo / Server / Playtest / Beta**. These
  are titles that genuinely have no `library_600x900.jpg` on Steam's CDN — a real but ~5% minority
  that would fail identically on web. The "1000+ CORS errors" are overwhelmingly **404s wearing a
  CORS costume** for art that does not exist, not a systemic desktop CORS block. (Chromium throws
  an identical `TypeError` for a true CORS block and a headerless 404 — see
  `GameArtworkRequest.categorizeError`'s own note — so the console's "blocked by CORS policy" text
  is not diagnostic here.)

**The catastrophe is placement, not fetching:**
- `Placement complete: placed=587, artwork=75, labels=512` — of 1485 games, only 587 placed and
  only **75 got artwork**, despite 1423 successful resolutions.
- **1410 `no prefetched texture` warnings** — artwork was prefetched, then the slot mapping was
  gone by the time placement asked for it, so each fell back to a label; the 512 label cap then
  exhausted, leaving ~900 games rendering as nothing.

**The mechanism — the same library is rendered twice on second launch** (timeline from the log):
```
18:43:58.570  SteamIntegration    Auto-load: persisted library (local-scan, 1485 games)   ← RENDER #1
18:43:58.803  GameBoxSpawner      Placement run sections=6, games=1485                     ← places 1485
18:44:00.556  LocalSteamDataWriter Wrote 1331 locally-sourced AppDetailsCache entries       ← local scan works
18:44:01.910  LocalSteamLibraryLoader Resolved 0/57 collection-only appids via network
18:44:02.139  SteamIntegration    Emitted LibraryReloadRequest before library load          ← RESET
18:44:02.141  LocalSteamLibraryLoader Local scan: emitting ImportLibrary with 1485 games    ← RENDER #2
18:44:02.377  GameBoxSpawner      Placement run sections=6, games=1485                     ← places 1485 AGAIN
```
Two independent things both fire on `GameEventTypes.Start`:
1. `SteamIntegration.handleGameStart()` → `loadPersistedLibrary()` → `applyLibrary()` renders the
   persisted snapshot (fast, ~200ms) — **RENDER #1**.
2. `LocalSteamLibraryLoader.loadLocalSteamLibrary()` runs the fresh scan (~3.5s), then emits
   `ImportLibrary` → `handleImportLibrary()` → `applyLibrary()`, which sees a library already
   loaded and emits `LibraryReloadRequest` (teardown) before re-placing all 1485 — **RENDER #2**.

The persisted snapshot **is** the previous launch's local-scan result (`handleImportLibrary`
persists it; both carry `channel: 'local-scan'`, both 1485 games). So on second launch we render a
library, then ~3.5s later throw it away and render a byte-for-byte-equivalent library, and the
teardown+re-prefetch race in RENDER #2 is what produces the 1410 misses. **First launch has no
persisted snapshot, so RENDER #1 is skipped and only the single local-scan render happens — which
is exactly why first launch works and every launch after it doesn't.**

### What this means for the earlier fixes (honest reassessment)
- **Artwork preservation** (don't stomp `NO_LOCAL_ARTWORK` over real artwork) and **seed ordering**
  (`waitForAppDetailsCacheSeed`): both real correctness fixes, but the box artwork is fetched from
  the *constructed* CDN URL via `deriveArtworkFromAppId`, **not** from the cache entry's `artwork`
  field (that only feeds the header *fallback*). So neither could have moved the reported symptom.
  Keep them; stop expecting them to fix second-load.
- **`lod-tier-reset-race-condition` generation-guard**: guards the reset — but the reset itself is
  RENDER #2's teardown, which should not be happening at all. Correct guard, wrong layer to solve
  the disease at.
- The new **`GameArtworkRequest` success/failure logging was decisive** — "1423 resolved vs 75
  placed" is invisible without it. Worth keeping (trimmed).

### The fix: reconcile instead of re-rendering an identical library
Two tiers, smaller-first, both building the same "is the incoming library equivalent to what's
already rendered?" primitive:

- **Tier A — skip the redundant reload (near-term, mergeable, fixes the reported bug).** In
  `applyLibrary()` / `handleImportLibrary()`, before emitting `LibraryReloadRequest`, compare the
  incoming library against the currently-rendered one (same owner + same appid set, and arguably
  same names). If equivalent, **skip the teardown and re-render entirely** — RENDER #2 never
  happens. Local-scan's `AppDetailsCache` writes (freshness for *next* launch) already happened
  upstream in `LocalSteamDataWriter`, so nothing is lost by not re-rendering. This kills the
  double-render for the overwhelmingly common "nothing changed since last launch" case.
- **Tier B — Round 2 "upgrade, don't replace" for the genuinely-changed case.** When the incoming
  library differs (bought/removed games, updated names, and — per the user — artwork URLs verified
  reachable before replacing), diff per-appid and patch only what changed: add new boxes, update
  changed ones, leave the rest untouched, no `LibraryReloadRequest`. Applies to web too (Connect
  Steam / manual refresh). Larger; builds directly on Tier A's comparison primitive.

Open design question for implementation: whether Tier A lives in `SteamIntegration` (skip the emit)
or is better expressed as `LocalSteamLibraryLoader` not emitting `ImportLibrary` at all when the
persisted snapshot it would reproduce is already loaded. The former is channel-agnostic (also helps
a bookmarklet re-import of an unchanged library); the latter is desktop-scoped and arguably cleaner
ownership. Decide before implementing.

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
the *primary* blocking cause the user was pointing at - see "Round 1.5" below. (Superseded by the
third test session further down: the LOD tier race turned out to be even higher priority than
this.)

## Third test session: the LOD tier race is not dormant - it's the actual top priority now

Two more logs (a fresh session's first load, then a quit-and-relaunch second load) confirmed the
`lod-tier-reset-race-condition` tech debt item's "not currently reachable, revisit only before
Connect Steam/Round 2" framing was wrong. First load: 2,138 log lines, **zero** tier errors.
Second load (same session, app quit and relaunched, persisted library from the first load found
on startup): 22,413 log lines, **1,328** `Unknown tier: mid` errors (worse than the original
1,404-error observation), plus new fallout not seen before - `No label slots remaining` (956
occurrences) and sharply elevated worker/`postMessage` traffic, both very likely downstream
consequences of the MID tier being unusable for the whole session (labels and other fallback
paths get leaned on harder when the primary texture path is broken).

**Theory considered and rejected**: a "startup-ordering race" — the idea that a fresh session's
demo store happens to give the texture pipeline enough real time to initialize before a
subsequent, faster persisted-library launch races ahead of it. Superseded below.

Net effect either way: **this reproduces on every second-and-later desktop launch with a
persisted library**, which is the normal, expected, intended experience of using this app more
than once - not a rare edge case. This is the single most important item in this plan, ahead of
Round 1.5 - see the updated Status line above and `docs/tech-debt.md
#id-lod-tier-reset-race-condition`.

Analysis tooling note: both new logs were large enough (2K and 22K lines) that reading them
linearly wasn't practical. `scripts/dedupe-log.js` (added to the repo this session) normalizes
timestamps/ids and groups+counts by pattern - reach for it first on any future noisy log rather
than scrolling.

## Fourth pass: actual root cause is a disposal-ordering race, and the fix reshapes the reset itself

Tracing `GameBoxSpawner`'s `LibraryReloadRequest` handler against `LodArtworkOrchestrator`/
`LodTextureArrayManager` found the real mechanism, and it isn't about startup timing at all:
`GameBoxSpawner.fullReset()` **synchronously disposes** the entire GPU artwork pipeline (texture
arrays included) on every `LibraryReloadRequest`, but `ArtworkPrefetchCoordinator`'s in-flight
fetch promises for the *previous* library aren't cancelled - when they resolve afterward, they
write into the now-disposed, cleared `tiers` map, which no longer has a `mid` entry. That explains
both the timing sensitivity (relaunch-with-persisted-library has more in-flight prefetches racing
the reset than a slow first load does) and why it "looked" like a startup race without actually
being one.

It also surfaced a design problem worth fixing at the same time, not just patching around: 
`fullReset()` disposes and rebuilds *unconditionally*, even when the incoming library would fit
the already-allocated texture arrays (e.g. relaunching with the exact same persisted library).
The only real reason a hard dispose+rebuild is ever necessary is that a `THREE.DataArrayTexture`'s
depth is fixed at construction and can't grow - true when going from a small demo-store library to
a large real one, not true for a same-size reload. Full design and reasoning now lives in
`docs/architecture/label-and-placement-reset-architecture-review.md`'s "Library Reload Lifecycle"
section; summary:

- `GameBoxSpawner` will pick between two reset tiers based on whether the incoming library fits
  the currently-allocated capacity, not based on which event fired.
- **Capacity-compatible** reloads (same/similar-size relaunch, future Round 2 upgrade patches) get
  a soft reset - no disposal, slot allocators rewound for reuse (mirroring the
  `PlacementRunResettableInstancedBase` pattern already used for placement-run resets), plus a
  `generation` counter that the two async pixel-write call sites check before writing, so a
  late-resolving fetch from the *previous* library silently no-ops instead of writing into a
  reassigned slot.
- **Capacity-incompatible** reloads (demo store → real library) keep today's `fullReset()`
  behavior unchanged - a bigger array is genuinely required, and this transition is an intentional
  hard cut anyway.

An earlier fix attempt (an `isDisposed` guard checked after every `await` in
`LodArtworkOrchestrator`, built by a background agent in an isolated worktree) correctly stops the
crash but doesn't address the unnecessary dispose+rebuild itself, and adds a guard-check pattern
that would need to be repeated at every future async call site in this class. Superseded by the
design above before merging - not merged into the main tree.

**Implemented (2026-07-14)**: `GameBoxSpawner`, `GpuGameBoxRenderer`, `LodArtworkOrchestrator`,
`LodTextureArrayManager`, and `HighTextureCache` all updated per the design above.
`StorePropsLibraryReloadRequestEvent` gained an optional `incomingGameCount` field, populated by
`SteamIntegration.applyLibrary()` (known upfront) but left undefined by `handleLoadLibrary()`'s
online-reload path (not known until after the fetch — falls back to the existing hard-reset
behavior). `yarn tsc` clean, `yarn test` 1163 passed (9 new tests covering slot reuse, the
mid-flight-reset stale-write race, and the capacity-compatible/incompatible/unknown routing).
**Still open**: manual verification against a real desktop relaunch with a persisted library -
unit tests exercise the mechanism directly but don't replace an actual end-to-end repro of the
originally-reported bug.

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
  `setSlotPixels(MID, ...)` call failed because the tier map came back empty. Originally assessed
  as no longer reachable once Fork A stopped firing - **that assessment was wrong; actual root
  cause is the disposal-ordering race described in "Fourth pass" below.** Tracked as tech debt:
  `docs/tech-debt.md#id-lod-tier-reset-race-condition` (High priority).
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

## Round 1.5 — not started, second priority (after the LOD tier race fix): don't block the first render on the network gap-fill

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

## Fifth pass: second-launch artwork collapse was a real, separate bug - fixed

A second-launch report (596/1539 placed, only 84 with real artwork, 943 with neither artwork nor
a label) traced to a genuine regression in `LocalSteamDataWriter`, unrelated to the LOD tier race
above: it wrote a hardcoded `NO_LOCAL_ARTWORK` unconditionally on every local-scan load via a
full-replace `AppDetailsCache.setMany()`, silently destroying any real artwork a prior baked-seed
or network fetch had already stored for that appid - and since the appid then reads as "not
missing," it was never eligible for the network gap-fill again either. `BakedCacheLoader`'s
fire-and-forget seed races this write on the very first launch (explaining why launch 1 sometimes
looks fine), but seeding skips entirely once the cache is non-empty - true from launch 2 onward -
so every relaunch after the first deterministically wiped real artwork. Full writeup:
`docs/bugs.md` "Local-scan write silently wipes artwork on every relaunch, not just first
launch". Fixed by preserving each appid's existing `artwork` field across the local-scan write;
`yarn tsc`/`yarn test` clean (1166 passed). Manual verification against a real second launch is
still open.

## Related
- `scripts/dedupe-log.js` - normalize/group/count a noisy console log dump; use before reading
  any future large log linearly
- `client/src/steam-integration/SteamIntegration.ts` - Fork A, `applyLibrary()`
- `client/src/steam/LocalSteamLibraryLoader.ts` - the actual blocking gap-fill (Round 1.5)
- `client/src/steam/utils/ArtworkUrls.ts` - `deriveArtworkFromAppId`, the CORS-blocked fallback
- `client/src/scene/game-box/instancing/GameArtworkRequest.ts` - `categorizeError`, the CORS/404 ambiguity
- `client/src/scene/game-box/instancing/GameArtworkProvider.ts` - `failureCache`, currently in-memory only
- `client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts`,
  `LodTextureArrayManager.ts`, `PlacementRunResettableInstancedBase.ts` - the reset-driven
  tier-loss race and the shared soft-reset pattern the planned fix extends
- `client/src/scene/spawning/GameBoxSpawner.ts`,
  `client/src/scene/spawning/ArtworkPrefetchCoordinator.ts` - own the reload trigger and the
  in-flight fetches that race it
- `docs/architecture/label-and-placement-reset-architecture-review.md` - "Library Reload
  Lifecycle" section has the full two-tier reset design
- `docs/tech-debt.md#id-lod-tier-reset-race-condition` - tracked debt for the tier race
- `docs/features/desktop-app.md` - umbrella feature doc

---
*— A1 / P1 / T1*
