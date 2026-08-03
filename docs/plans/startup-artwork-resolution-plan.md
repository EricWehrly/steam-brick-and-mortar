# Plan: Startup Artwork Resolution & Caching

**Status**: Partially implemented and field-confirmed (2026-07-28) — the two lowest-risk fixes
(persistent dead-path field on `AppDetailsCache`, network-artwork readiness gate) are in, tested,
and now confirmed working against a real desktop session (see Decisions, below). `PixelDataCache`
was instrumented, measured against a real session, then the instrumentation itself was reverted
(redundant with existing tooling) — the measurement revealed a URL-key timestamp-instability bug,
**fixed 2026-07-29** (`UrlUtils.stripQueryParam`, applied to both `PixelDataCache` keys and
`artwork_dead_paths` matching). **Standing rule going forward**: don't extend `AppDetailsCache`'s
public contract for debug-logging purposes alone — this happened twice in one session
(`PixelDataCache.logStatsSummary`, then `AppDetailsCache.getDeadArtworkPathStats`), both reverted.
Use ephemeral/inline code for one-off diagnostics, or the existing console-command idiom
(`registerConsoleCommands()` in `LodArtworkOrchestratorDebug.ts`) if something needs to be
repeatable; don't grow the cache class's API surface for it. **Local `librarycache` disk read
implemented and field-confirmed 2026-07-31** (Problem 2's actual fix, not a stopgap) — PR #149,
scoped deliberately to just the disk read (`find_local_library_art`/`read_local_library_art_bytes`,
wired into `GameArtworkProvider`/`GameArtworkRequest`, registered from `SteamIntegration.applyLibrary()`
so it runs regardless of which startup-waterfall source supplies the library). Two bugs caught and
fixed against real sessions during that same pass: the registration call originally lived where the
common cache-hit path never reached it (fixed in `91d31d85`), and the bytes command initially
returned `Vec<u8>` over Tauri's default JSON IPC, which measurably dominated startup time once it
ran per placed game box - fixed by switching to a raw `tauri::ipc::Response` (`d7cf5945`). Dead-path
skip separately reconfirmed against the same session: 56/56 failed resolutions fully skipped via
the known-dead cache, zero wasted network attempts. **Concurrency work planned, re-evaluated for
player experience, signed off, and implemented, all 2026-07-31** (Root Cause B — prefetch scheduling
with distance re-sort, worker pool, HIGH-tier correctness fixes, source-bytes reuse across LOD
tiers), on its own branch (`act2/artwork-loading-concurrency`, based on the merged #149).
**Field-tested 2026-08-01, caught and fixed a real regression**: the concurrency cap broke an
implicit timing assumption in MID-texture-atlas compaction, permanently locking the atlas at a tiny
slot count on every real run and dropping ~96% of the library to labels (or nothing, once label
capacity also ran out) — see "Field-caught regression" under the build plan below for the full
mechanism, fix, and the regression test that pins it. Noisy per-occurrence logging surfaced by the
same field test was also aggregated per direction. Full test suite green (1489 passed) after the
fix; ready for another real desktop session to confirm. The original build-plan re-evaluation
corrected three findings from its own first pass — positions *are* available at
prefetch time (via `PlacementIntentReady`, not `BatchReadyForPlacement`), there are *two*
`TextureWorker`s rather than one, and a full distance-priority queue already exists in production
(`SpatialPrewarmingManager`) — and surfaced the defect with the sharpest player impact: local-disk
artwork never reaches the HIGH tier at all, so walking up to a shelf triggers a network fetch for
art already on disk. Iterate on this doc as each piece resolves.
**Related**: [`cors-blocked-local-scan-artwork`](../tech-debt.md#id-cors-blocked-local-scan-artwork)
(the tech-debt entry this plan supersedes/absorbs), [Image/Texture Pipeline](../architecture/image-texture-pipeline.md),
[Desktop Offline-First Plan](desktop-offline-first-plan.md), [Multi-Layer Caching](../features/multi-layer-caching.md)
(AppDetailsCache TTL gap, same root issue as Problem 2's S3 staleness note)

## Why this doc exists

Three observed symptoms in a real desktop relaunch (`desktop/localhost.har` + matching console log,
captured 2026-07-15), all tracing back to overlapping causes in the artwork resolution pipeline:

1. A handful of games render immediately on reload, the rest trickle in over several seconds.
2. Some games with real, current Steam artwork (e.g. BALL x PIT, appId 2062430) fail to resolve
   entirely and fall back to a label, even though the art demonstrably exists.
3. Artwork that Chrome's own network log shows as "200 (from disk cache)" still visibly lags in
   rather than appearing instantly.

Investigated by reading the pipeline end to end (`ArtworkPrefetchCoordinator` →
`LodArtworkOrchestrator` → `GameArtworkProvider`/`GameArtworkRequest` → `TextureWorker` →
`texture-processing.worker.ts`, plus `LocalSteamDataWriter`/`LocalSteamLibraryLoader`/
`AppDetailsCache` on the enrichment side), parsing the HAR file directly, and confirming two
hypotheses against the real Steam CDN/API with `curl` (bypasses browser CORS entirely, so it can
distinguish "genuinely 404" from "CORS-opaque" in a way the app itself cannot).

## Grounding data (from the captured HAR, 1893 CDN requests)

| | count | p50 time | p90 | p99 |
|---|---|---|---|---|
| 200 OK | 1380 | 592ms | 699ms | 723ms |
| Failed (browser reports as status 0) | 513 | 1680ms | 2196ms | 4262ms |

- Peak concurrency: **972 simultaneous in-flight CDN fetches** — no throttling anywhere in the
  pipeline.
- `library_600x900.jpg` guesses: 1442 requests, 389 failed (27%).
- 389 distinct appids hit at least one dead CDN guess in this single session.
- Every failure in the HAR shows as `status: 0, _error: net::ERR_FAILED` — Chrome does not expose
  the real HTTP status for a CORS-opaque or otherwise-blocked fetch, confirming the code's own
  `categorizeError()` comment: CORS and 404 are genuinely indistinguishable from inside the browser.

## Root causes

### A. Artwork requests fire before real hints are known to be missing (Problems 1 & 2) — fixed 2026-07-25

`SteamIntegration.applyLibrary()` ([SteamIntegration.ts:268-278](../../client/src/steam-integration/SteamIntegration.ts))
sets every game's `artwork` to `deriveArtworkFromAppId(appid)` (a guessed legacy CDN path) before
`enrichFromCache()` runs, which is fine *if* enrichFromCache can override it — and it does, when
`AppDetailsCache` has a real entry. The actual gap is upstream, in how that cache gets populated
for locally-scanned games:

`loadLocalSteamLibrary()` ([LocalSteamLibraryLoader.ts:76-77](../../client/src/steam/LocalSteamLibraryLoader.ts)):
```ts
await LocalSteamDataWriter.writeLocalAppMetadata()       // writes name + NO_LOCAL_ARTWORK (all null)
await resolveRemainingAppidsFromNetwork(candidateAppids)  // only fetches AppDetailsCache.findMissing() results
```

`writeLocalAppMetadata()` writes an entry — name, tags, genres, but `artwork: NO_LOCAL_ARTWORK`
([LocalSteamDataWriter.ts:37-43](../../client/src/steam/LocalSteamDataWriter.ts)) — for every appid
Steam's local `appinfo.vdf` can name (essentially every owned/installed/viewed game). `findMissing()`
([AppDetailsCache.ts:65-68](../../client/src/steam/cache/AppDetailsCache.ts)) checks "does any cache
entry exist," which is now true, so the network fetch that would supply real `header_image`/
`capsule_image` **never runs** for these games. This is the default outcome, not an edge case.

Confirmed concretely for appId 2062430 (BALL x PIT):
```
curl (bypasses CORS):
  cdn.akamai.steamstatic.com/steam/apps/2062430/library_600x900.jpg  → 404
  cdn.akamai.steamstatic.com/steam/apps/2062430/header.jpg           → 404
  cdn.akamai.steamstatic.com/steam/apps/2062430/capsule_616x353.jpg  → 404

Real Steam appdetails API for the same appid:
  header_image:  https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2062430/a157aa8de.../header.jpg?t=...
  capsule_image: https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2062430/93669476.../capsule_231x87.jpg?t=...
```

Steam has migrated this app's assets to a hashed CDN path that cannot be guessed — only obtained
from real API data. The legacy `cdn.akamai.steamstatic.com/steam/apps/<appid>/*` guess still works
for older titles (confirmed: `440/capsule_616x353.jpg` is a live 200) but is a guaranteed miss for
anything Steam has re-pointed. There is also no official "library" (300×450 portrait) field in
`appdetails` at all — that URL shape has always been a guess, independent of the CDN-generation
issue.

**Fixed 2026-07-25** (for `header`/`capsule`/`background` — `library` still has no API source at
all, see Root Cause D): added `AppDetailsData.artwork_network_checked?: boolean`
([BatchAppDetailsClient.ts](../../client/src/steam/batch/BatchAppDetailsClient.ts)), stamped `true`
whenever an entry comes from a genuine network source — a live batch fetch
(`GamesLoader.fetchAndNormalizeBatch`) or the baked release bundle
(`BakedCacheLoader.seedIfNeeded`, itself built from the same network-sourced Lambda cache).
`LocalSteamDataWriter`'s local-only writes never set it. New
`AppDetailsCache.findMissingArtwork()` treats "no entry, or entry has no
`artwork_network_checked`" as missing, replacing the old `findMissing()` (plain "no entry at all")
as the gate `LocalSteamLibraryLoader.resolveRemainingAppidsFromNetwork()` uses. Answers Open
Question 1's own follow-up note (the fetchable URL must exist **and** the entry must lack the
"already checked" mark) exactly as scoped.

Fixing this exposed a second, smaller bug in the same neighborhood: `GamesLoader.fetchAndCacheAppDetails`
(the network gap-fill's actual fetch call) wrote results via `AppDetailsCache.setMany()` — a blind
overwrite — under the old assumption that every appid it's called with is genuinely new. Once
`findMissingArtwork` started routing appids that already have a local-only entry (name,
`user_collections`, tags from `LocalSteamDataWriter`) through this same method, `setMany` would
have silently destroyed that local-only data on every gap-fill. Switched to
`AppDetailsCache.mergeMany()` (already field-level-merge-aware, already used elsewhere for exactly
this kind of concurrent-writer safety) — `user_collections` and friends now survive.

### B. No concurrency control anywhere in the prefetch path (Problem 3, partly explains Problem 1) — not yet started

`ArtworkPrefetchCoordinator.prefetchBatch()` ([ArtworkPrefetchCoordinator.ts:77-89](../../client/src/scene/spawning/ArtworkPrefetchCoordinator.ts))
fires every game's `prefetchArtwork()` with no `await`, no queue, no cap. For a 1400+ game library
that's ~1400 concurrent promise chains launched in the same tick, each doing a sequential MID-then-HIGH
`getPixelsAtSize()` ([LodArtworkOrchestrator.ts:433,440](../../client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts)),
each of which checks `PixelDataCache` then, on miss, round-trips through the single shared
`TextureWorker`. The 972-peak-concurrency, 592ms-median-for-successes numbers above are the direct
result — even a disk-cache-eligible fetch is competing in the same unthrottled scrum as everything
else, including guesses that are about to burn a real (if fast) failed round trip.

**Confirmed 2026-07-31, after local-disk read landed (PR #149) and a real session still showed a
~35s stall between placement and completion**: `GameArtworkProvider` holds exactly one
`TextureWorker`, which wraps exactly one `Worker` (`ManagedWorker` has no pooling - checked its
source directly). Every MID prefetch decode - local disk *or* network, doesn't matter which -
funnels through that single worker's serial message queue, processed one at a time. This is the
actual mechanism behind "stall then accelerate," a better match than network concurrency for the
"starved thread pool" symptom this whole investigation started from: hundreds of requests fire at
once (per the no-cap behavior above), but they all queue up behind one thread's `onmessage` loop
regardless of how fast the underlying bytes arrived. Local-disk reads made the *bytes* fast; they
didn't touch the *decode* bottleneck at all. (Refined during the 2026-07-31 re-evaluation: this is
one worker for the *MID prefetch wave* specifically, not for all decoding - `HighTextureCache`
constructs a second, independent `TextureWorker` of its own, so HIGH promotion doesn't contend with
the startup wave. See the build plan's corrected findings.)

Also noted in the same pass, and corrected after reading `LodArtworkOrchestrator.fetchAndCachePixels`
directly: `buildAppSettingsConfig` (the only config production actually instantiates) sets
`lazyHighTextures: true`, so the initial prefetch wave only ever fetches MID (150×225) - HIGH
(300×450) is deferred and requested individually, later, as a game gets promoted (camera proximity
via `LodDistanceManager`, or an explicit `preloadNearestGames()` call). So this isn't "every
prefetch decodes twice" as first suspected - it's narrower: **every game that ever gets promoted to
HIGH pays for a second full decode of the same source image**, because `PixelDataCache` keys
lookups by exact size (`@{width}x{height}`), so the HIGH request can't reuse the MID decode that
already happened. Decoding once at native resolution (or the largest tier actually used) and
resizing down for smaller tiers would be cheaper. Pre-existing pattern (present in the network path
already; the local-disk path just inherited it), not introduced by PR #149, but worth fixing
alongside the worker pool since both live in the same code path.

**New requirement, 2026-07-31**: whatever replaces the no-cap/no-priority behavior above must
prioritize games nearest the player - those should be scheduled first, not just whichever games
happen to iterate first in `prefetchBatch()`'s loop. Distinct axis from the disk-vs-network
priority split already noted in Open Question 4 below; both apply. `BatchReadyForPlacementEvent`
(what triggers prefetch) carries no position data, which initially looked like a blocker - but
`PlacementIntentReady` does carry it, and arrives independently, so the ordering signal is
available. See the build plan immediately below.

## Build plan: prefetch scheduling, worker pool, and HIGH-tier correctness (Root Cause B)

**Status**: Re-evaluated 2026-07-31 through a player-experience lens after a first pass; the three
design forks that pass left open are now decided (see Decisions, at the end of this section). Own
PR/changeset on `act2/artwork-loading-concurrency`, branched from the merged PR #149 - deliberately
not bundled with the local disk read, but now **does** bundle the HIGH-tier correctness fixes below,
per direction.

### What the player actually experiences (the finding that reframes this whole section)

**No game box of any kind exists until that game's artwork resolves or fails.**
`RenderIntentCoordinator` ([RenderIntentCoordinator.ts:100-127](../../client/src/scene/game-box/RenderIntentCoordinator.ts))
holds every `PlacementIntentReady` in `pendingPlacementIntents` until `ArtworkIntentSettled` fires
for the same appid, and only then emits `PlacementResolved` →
`GpuGameBoxRenderer.placeResolvedGame()` → `placeInstance()`. The label path
([GpuGameBoxRenderer.ts:176](../../client/src/scene/game-box/GpuGameBoxRenderer.ts)) is a *failure*
fallback (`placeInstance()` returned -1), not a progressive placeholder.

Consequence: the decode queue gates box **existence**, not texture quality. Perceived startup time
*is* decode-queue latency, and the shelves in front of the player read as empty - not as
placeholder boxes filling in - for as long as arbitrary distant games are ahead in the queue. This
is the "stall then accelerate" symptom, fully explained.

**Decided (2026-07-31): keep this gate.** Progressive placeholders are wanted eventually, but as
real placeholder *artwork* - label boxes are explicitly not the answer, and a label→art swap is not
worth building as an interim. Tracked as a future item, not part of this changeset. The direct
consequence for this plan: **prefetch ordering is the startup fix itself, not a refinement of it.**

### Corrected findings (superseding this section's first pass)

- **Positions ARE available at prefetch time.** `PlacementIntentReadyEvent`
  ([InteractionEvents.ts:247-252](../../client/src/types/InteractionEvents.ts)) carries
  `position: THREE.Vector3` and is emitted independently of prefetch - it is precisely what
  `RenderIntentCoordinator` sits on while waiting for artwork. The earlier claim ("no position data
  at prefetch time," derived from `BatchReadyForPlacementEvent` carrying none) looked at the wrong
  event. This dissolves most of the original three-option fork: option (a) "reorder so prefetch
  waits for placement" is *circular* - placement already waits on prefetch, so that ordering
  deadlocks - and option (b) is far cheaper than estimated, because `(appid, position)` already
  flows through a coordinator whose entire job is rendezvousing these two streams.
- **Two `TextureWorker` instances, not one.** `GameArtworkProvider`
  ([GameArtworkProvider.ts:139](../../client/src/scene/game-box/instancing/GameArtworkProvider.ts))
  and `HighTextureCache`
  ([HighTextureCache.ts:187](../../client/src/scene/game-box/instancing/HighTextureCache.ts)) each
  construct their own. MID prefetch and HIGH promotion do **not** contend for the same thread. The
  startup bottleneck is still exactly one worker serializing ~1400 MID decodes, but a pool sized
  for that wave does not also have to cover HIGH.
- **A full priority queue already exists in production.** `SpatialPrewarmingManager`
  ([SpatialPrewarmingManager.ts](../../client/src/scene/game-box/instancing/SpatialPrewarmingManager.ts))
  implements movement-direction cone scoring, distance ranking, a 2-concurrent throttle, and
  behind-player eviction. It serves only the HIGH tier, only after placement - and it is being fed
  a URL that is wrong for local-disk games (next section). Do not rebuild this; the gap is which
  tier it serves and what URL it gets, not whether the pattern exists.
- **No concurrency cap upstream, unchanged.** `ArtworkPrefetchCoordinator.prefetchBatch()`
  ([ArtworkPrefetchCoordinator.ts:73-90](../../client/src/scene/spawning/ArtworkPrefetchCoordinator.ts))
  still fires every game's `prefetchArtwork()` with no `await`, no queue, no cap.

### HIGH-tier correctness: local-disk art never reaches it at all

The sharpest player-facing defect, and not previously in this plan. It is invisible in startup logs
because it only fires when the player walks up to a shelf - the moment that matters most.

`resolveHighArtworkUrl()`
([LodArtworkOrchestrator.ts:632-642](../../client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts))
returns an `artworkHints.library` URL or the guessed legacy CDN path - **never** a local path. That
value is what `LodGameArtworkRenderer` passes to `HighTextureCache.registerGame()`, and
`loadHighTexture()` looks it up as `pixelCache.get(entry.artworkUrl, 300, 450)`. But MID stored the
local-disk decode under `local://<appid>/<relative_path>@150x225`
([GameArtworkProvider.fetchPixelsFromLocalDisk](../../client/src/scene/game-box/instancing/GameArtworkProvider.ts)).
Different key namespace entirely - a guaranteed miss, every time, for every game resolved from disk.

What the player gets as a result, for a game whose bytes are already on disk: approach the shelf →
HIGH requested → pixel-cache miss → slot released, state set to `CACHING` → **network fetch of a
CDN URL** → and if that URL is one of the ~389 appids' known-dead guesses, it fails, retries up to
`maxLoadAttempts`, and the box stays at MID permanently. `HighTextureCache` consults
`artwork_dead_paths` nowhere, so PR #149's dead-path skip does not protect this path.

Two adjacent gaps in the same class, both bundled here:

- **`?t=` normalization is missing on the HIGH half.** `HighTextureCache` keys the pixel cache on
  raw `entry.artworkUrl` at both
  [:494](../../client/src/scene/game-box/instancing/HighTextureCache.ts) (`put`) and
  [:532](../../client/src/scene/game-box/instancing/HighTextureCache.ts) (`get`) - no
  `UrlUtils.stripQueryParam(url, 't')`. Open Question 2's fix landed on the MID path only; this is
  the unfixed half of the same bug, with the same cross-session cache-orphaning consequence.
- **A cold HIGH costs two LOD cycles.** `loadHighTexture()` on a pixel-cache miss releases the slot,
  sets `CACHING`, and returns `false` - the actual load only happens on a *subsequent*
  `requestHighTexture()`, which arrives via `LodDistanceManager`'s 60-frame `updateFrequency` (~1s)
  or `SpatialPrewarmingManager`'s 15-frame queue pass. Fetch/decode time is on top of that.

### Proposed shape

1. **Prefetch scheduler with distance re-sort** (the startup fix). `prefetchBatch()` enqueues
   instead of fire-and-forget; a scheduler drains the queue under a concurrency cap.
   `PlacementIntentReady` feeds `(appid, position)` in as it arrives, and queued games near the
   camera jump ahead - the same ranking `LodDistanceManager.preloadNearestGames()`
   ([:376-414](../../client/src/scene/game-box/instancing/LodDistanceManager.ts)) already performs
   for HIGH promotion, applied to the initial wave. Games with no intent yet (shelf layout hasn't
   reached them) drain as a background tier so the worker never idles waiting for positions.
   **The priority must reach the network path, not just decode dispatch** - with the placement gate
   kept, a near game that falls through to a slow network candidate leaves a visible hole in the
   shelf directly in front of the player while distant games have already filled in.
2. **Worker pool** for `GameArtworkProvider`'s decode path. Size derived from
   `navigator.hardwareConcurrency`, capped low (exact number TBD during implementation, not a
   documented decision). Ordering is what the player feels; the pool is what keeps a correctly
   ordered queue from being needlessly slow. Deliberately second - a small pool is sufficient once
   the order is right, whereas a large pool on the current arbitrary order still shows the player
   an empty shelf.
3. **HIGH-tier correctness fixes** (bundled per direction): give `HighTextureCache` the same
   local-disk-first path MID has (or register the `local://` key as the artwork URL when a local
   slot exists), apply `stripQueryParam(url, 't')` to its pixel-cache keys, and have it skip
   `artwork_dead_paths` candidates instead of burning `maxLoadAttempts` on them.
4. **`PixelDataCache` dedup fix.** Cache the decode at the largest tier actually requested (or
   native resolution) once; derive smaller tiers via the existing `resizePixels` instead of a fresh
   read + decode per tier. With `lazyHighTextures: true` this is specifically the cost the player
   triggers by walking up to a box, so it belongs with item 3's approach-latency work.

### Decisions (2026-07-31, all three forks resolved)

- **Placement gate stays** - see "What the player actually experiences," above. Placeholder artwork
  is a separate future item; label boxes are not it.
- **Ordering shape: a real queue in the prefetch coordinator, re-sorted by `PlacementIntentReady`
  positions** (the original fork's option (b), now much cheaper given the corrected finding).
  Explicitly *not* extending `SpatialPrewarmingManager` to cover MID as well - it starts after
  placement and is tuned for 2-concurrent HIGH loads, and retuning it for a ~1400-item startup wave
  risks regressing HIGH behavior that currently works. Two schedulers, one per tier, is the
  intended end state here.
- **HIGH-tier fixes ship in this same changeset**, not a separate PR.

### Implemented 2026-07-31 (all four items)

1. **Prefetch scheduler** — `ArtworkPrefetchCoordinator` now queues instead of firing every game
   at once, drains under `MAX_CONCURRENT_PREFETCH` (24 — a real cap independent of the decode pool,
   generous enough that existing small-batch tests didn't need rewriting), and re-prioritizes the
   still-queued portion by distance whenever `PlacementIntentReady` reports a position, falling back
   to FIFO/library order as the background tier. See
   [ArtworkPrefetchCoordinator.ts](../../client/src/scene/spawning/ArtworkPrefetchCoordinator.ts).
2. **Worker pool** — new `TextureWorkerPool`
   ([TextureWorkerPool.ts](../../client/src/scene/game-box/instancing/TextureWorkerPool.ts)), sized
   `navigator.hardwareConcurrency`-derived (clamped 2–6), routing to whichever pooled `TextureWorker`
   currently has the fewest pending messages (`ManagedWorker.pendingCount`, already public).
   `GameArtworkProvider` holds the pool instead of one worker; `HighTextureCache` keeps its own
   separate single worker unchanged (never was the bottleneck, per the corrected findings above).
3. **HIGH-tier correctness** — `HighTextureCache.loadHighTexture()` now tries
   `GameArtworkProvider.fetchPixelsFromLocalDisk()` first (same precedence MID already has),
   threading `appid` through `AddInstanceParams`/`registerGame`/`GameEntry` (it wasn't available on
   the HIGH-tier entry before). The network fallback path now strips `?t=` on both cache-key
   directions and checks `AppDetailsCache.getDeadArtworkPaths()` before firing, skipping known-dead
   candidates instead of burning `maxLoadAttempts`; a genuinely-failed background fetch now also
   calls `markArtworkPathDead()`, so future launches benefit even for games that only ever reach
   HIGH (previously only MID's `fetchFromStrategy` wrote to this cache).
4. **Source-bytes reuse (supersedes the literal "resizePixels" description above)** — decoding once
   at the largest tier and *resizing down* turned out to be the wrong direction for the real
   MID-then-HIGH order: MID's 150×225 decode is smaller than HIGH's 300×450, and upscaling a small
   decode to serve a bigger request would blur the box the player is looking straight at. The actual
   fix implemented in `GameArtworkProvider`: cache the **source bytes** (network response body via
   the worker's already-returned-but-previously-discarded `result.blob`, or the local-disk bytes
   read via Tauri IPC) in a session-only, size-capped `Map` (`sourceBytesCache`, 200-entry cap,
   oldest-evicted), keyed the same way as the persisted pixel cache. A later request for the same
   source at a *different* size decodes from those in-memory bytes via the worker's existing
   `processLocalBytes` message — this eliminates the second network fetch (or second Tauri IPC
   round-trip) entirely, which is the dominant cost per the original HAR data (592ms median fetch
   time vs. worker decode time); the second `createImageBitmap` decode itself still runs, since
   avoiding that too would require keeping a live `ImageBitmap` alive across worker messages, which
   is a materially bigger change than this pass's scope. `resizePixels` remains in place and used
   for its existing purpose (an exact-size pixel-cache miss resizing from a same-URL different-size
   *persisted* hit) — nothing about that path changed.

### Field-caught regression, 2026-08-01: MID atlas compacted before the concurrency-capped queue had dispatched most of the library

**Symptom**: two real desktop sessions (one with existing caches, one after the user deleted all
browser stores for a clean run) both showed the vast majority of the library rendering as labels
or, once label capacity (512) was also exhausted, nothing at all — hundreds of
`placeInstance: no prefetched texture for "X"` warnings firing in a single-digit-millisecond burst,
immediately followed by `Failed to add label box` once labels ran out too. Zero
`GameArtworkRequest`/`GameArtworkProvider` warnings and zero uncaught errors anywhere in either
session's log — the fast, silent, log-free shape was the tell that resolution was failing before
ever reaching a fetch attempt, not because of it.

**Root cause**: `LodTextureArrayManager.compactMidTier()` — a memory optimization that shrinks the
pre-allocated MID texture array down from `maxTextures` (library size + buffer) to the actual
number of slots used — was called unconditionally from `LodArtworkOrchestrator.handleAllBatchesComplete()`,
the instant game *data* finished loading. That was safe under the old fire-everything-immediately
prefetch: by the time all batches' data had streamed in, every game's `prefetchArtwork()` had
already been *called* (and `allocateSlot()` is the first synchronous thing it does), so
"data loaded" and "every slot claimed" happened to coincide. The new concurrency-capped queue (this
same build plan, item 1) broke that coincidence: at `AllBatchesComplete` time, only
`MAX_CONCURRENT_PREFETCH`-ish games have actually been dispatched to `prefetchArtwork()` — the
other ~98% are still sitting in `ArtworkPrefetchCoordinator`'s queue, never having called
`allocateSlot()`. Compaction shrank the array to that tiny in-flight count, permanently — every
later-dispatched game then failed `allocateSlot()` instantly (no network, no decode, hence zero
downstream log lines) for the rest of the session, confirmed directly in the second log via
`[LodTextureArrayManager] WARN MID texture atlas full (64 slots)` immediately followed by
`[LodArtworkOrchestrator] WARN Atlas full (1570 configured)`.

**Fix**: relocate the `compactMidTierAfterLoad()` call from `handleAllBatchesComplete()` into
`settleArtwork()`'s existing `inFlightArtworkCount === 0 && allBatchesComplete` gate
([LodArtworkOrchestrator.ts](../../client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts)) -
no new signal needed. `inFlightArtworkCount` provably never reaches 0 while the coordinator's queue
still has work, because `ArtworkPrefetchCoordinator.dispatchPrefetch()`'s `.finally()` decrements its
own counter and synchronously re-dispatches the next queued item in the same tick, before yielding -
so this gate was already the correct "everything that will ever be dispatched has settled" signal;
it just wasn't being used for compaction. Regression test added directly against this failure mode
(two prefetches in flight when `AllBatchesComplete` fires; a third, dispatched only after the first
settles, must still get a real slot) - confirmed it fails with `'error'` instead of `'prefetched'`
when the old unconditional call is restored, and passes with the fix.

**Logging changes made alongside this fix** (per direction: aggregate repeated lines, make the log
easier to work with): the three per-occurrence log lines that flooded both sessions -
`LodArtworkOrchestrator.placeInstance`/`setInstanceArtwork`'s "no prefetched texture" warnings,
`GpuGameBoxRenderer.placeLabelBox`'s "Failed to add label box", and `InstancedLabelRenderer`'s raw
(un-leveled, always-printed) "No label slots remaining" - are now either downgraded to `.debug()`
(the first two: redundant with the caller's own outcome handling - `GpuGameBoxRenderer`'s label
fallback and its `Placement complete: placed=X, artwork=Y, labels=Z, labelFailures=W` run summary,
or `handlePlacementRepointRequested`'s own warn) or logged once per placement run instead of once
per occurrence (the label-capacity warnings, guarded the same way `atlasFullLogged` already guards
the MID-atlas equivalent, reset on `PlacementRunResetRequested`). The aggregate counts these
replaced were already being computed and logged correctly; only the noisy per-occurrence duplicates
were removed.

**On the "fall back to a browser cache" question raised alongside this bug report**: the layering
already does this - `GameArtworkProvider.fetchPixels`/`fetchPixelsFromLocalDisk` check
`PixelDataCache` (persistent, IndexedDB-backed decoded-pixel cache) before any network/Tauri-IPC
attempt, for every request, at both call sites. The second session's slow "batches" (6-15s each,
two of which hit HTTP 503) were `BatchAppDetailsClient` calls fetching *appdetails metadata* (names,
genres, artwork hint URLs) from the Steam API proxy - a separate pipeline from artwork pixels -
which legitimately has nothing to read from a freshly-emptied `AppDetailsCache`/`PixelDataCache`
after "delete all stores." Not a gap in the fallback chain; expected cost of a genuinely cold start
plus one proxy hiccup, unrelated to the atlas bug above.

### Diagnostic logging added 2026-08-01: verifying the scheduling/source/failure properties directly

After the atlas fix landed, the follow-up question was whether the three properties this build plan
claims actually hold in a real run - nearest-first, disk-first, and fast short-circuiting of known
failures - rather than trusting the code reading alone. Added one aggregate `INFO`-level summary
line per property, each logged once the whole prefetch queue settles (`ArtworkSettled`, now a
reliable "everything that will ever be dispatched has settled" signal per the fix above), plus
matching regression coverage:

- **Scheduling**: `ArtworkPrefetchCoordinator.logSchedulingSummary()` - `"N/T dispatched by
  distance-priority, M/T by FIFO/background"`. If this ratio reads close to 0% distance-priority in
  a real session, it means `PlacementIntentReady` positions are consistently arriving *after* a
  game's own dispatch, and the reorder isn't actually engaging - directly answers "do we have the
  sort by the time we take the priority." Per-dispatch detail (which branch, distance in meters,
  remaining queue depth) is available at `.debug()` for deeper digging.
- **Source mix**: `GameArtworkProvider.logRunSummary()` - `"N local-disk, M persisted-cache, K
  network, J bytes-reused"`. Confirms local-disk-first empirically instead of by code inspection
  alone.
- **Failure short-circuiting**: the same summary's second line (failure counts by reason) already
  existed (`logFailureStats`) but was wired to fire at *construction* time, when nothing has
  happened yet - always logged nothing. Moved to the same `ArtworkSettled` trigger, so it now
  reports something real.

**Revised same day, per direction**: debug-level per-occurrence fallbacks for the two failure lines
were removed entirely rather than kept alongside the aggregate - a specific game's failure reason
and tried/skipped URLs are already retrievable via `GameArtworkProvider.getFailureReason()` (or the
existing `window.inspectGameArtwork()` console tool) without a standing log line at any level.
Removed: `GameArtworkProvider.recordFailure`'s `🚫 Permanent failure...` and
`GameArtworkRequest.fetchFromStrategy`'s `Artwork resolution failed...`. The pre-existing
"Artwork fallback summary: N game(s) will use labels" line's name preview was also trimmed from 25
to 3 examples, matching the "summary plus a couple of examples" shape decided for all of these.
**Bug caught while wiring the source/failure summary**: `GameArtworkProvider`'s constructor
registered the new `ArtworkSettled` listener but `dispose()` never deregistered it - every
constructed/disposed instance (e.g. across tests, or a full library-reload dispose+rebuild) would
have left a stale handler firing forever. Fixed by storing the bound handler and deregistering it
in `dispose()`, matching the pattern every other event-subscribing class in this codebase follows.

**Field-confirmed 2026-08-01** against a real session (1470-game library): `MID compacted:
150×225×1570 → 150×225×1468` (atlas fix holding - no premature truncation), `Artwork sources: 850
local-disk, 7 persisted-cache, 557 network` (disk-first working as designed), `Prefetch scheduling:
774/1470 dispatched by distance-priority, 696/1470 by FIFO/background` (reorder demonstrably
engaging, not degenerating to pure FIFO), `Artwork failures: 54 total, 54 permanent dead-ends
(NO_ARTWORK: 54)`, `Placement complete: placed=826, artwork=802, labels=24, labelFailures=0` (label
capacity no longer exhausted). All five aggregate lines now the whole picture - no per-occurrence
noise alongside them.

**Soft constraint introduced by this scheduler, 2026-07-31**: distance re-sort reads the camera's
*live* position (`DataKey.MainCamera`) at the moment each queue slot frees up, and assumes that
position is already the player's real spawn location - not mid-transition. True today (confirmed:
no startup camera animation exists), so this isn't blocking implementation, but it's a constraint
worth knowing about before adding one. If a startup camera animation/fly-in is ever added, this
scheduler would start ranking games by an in-transit camera position rather than the final spawn
point, silently degrading the "nearest first" guarantee without erroring. A future change here
would need to either delay this scheduler's distance reads until the camera settles, or feed it
the camera's *intended* spawn target instead of `camera.position`. Documented in code at
`ArtworkPrefetchCoordinator`'s class doc comment
([ArtworkPrefetchCoordinator.ts](../../client/src/scene/spawning/ArtworkPrefetchCoordinator.ts)).

### C. `PixelDataCache`'s actual purpose, and real numbers on its startup role (Problem 3) — measured 2026-07-25, root cause identified, not yet fixed

Per [Image/Texture Pipeline §3.1](../architecture/image-texture-pipeline.md): the pixel cache's
stated purpose is avoiding re-decode when swapping MID→HIGH LOD and keeping IndexedDB I/O off the
main thread — cross-session cold-start acceleration is a side effect of IndexedDB's persistence,
not a documented design goal. No version-mismatch or unexpected-clear bug was found by reading the
code (`CACHE_VERSION` is stable; `ImageCacheClear` only fires from an explicit user action).

**Instrumented, measured, then the instrumentation itself was reverted (2026-07-25).** Briefly
added `PixelDataCache.logStatsSummary()` (`.debug()`, once per placement run) plus a
`Logger.ts` default-level override to surface it automatically. Real numbers from that one session:

| | hits | misses | hitRate | entries | estSize |
|---|---|---|---|---|---|
| Web/anonymous store (fresh) | 54 | 1 | 98.2% | 150 | 79.1MB |
| Web/anonymous store (refresh) | 47 | 0 | 100.0% | 150 | 79.1MB |
| Desktop/real library (run 1) | 44 | 1447 | 3.0% | 2106 | 1110.8MB |
| Desktop/real library (run 2, ~2min later) | 44 | 1374 | 3.1% | 2106 | 1110.8MB |

Web/demo works exactly as designed — small, fixed set, stable keys. Desktop is close to
non-functional despite 2106 already-persisted entries (1.1GB) — not a cold cache, real prior
history exists, but this run's lookups mostly don't match it. The tell: `entries` stayed *exactly*
2106 across both runs and `hits` stayed *exactly* 44 both times while `misses`/`stores` shifted —
rules out both "never populated" (entries would be ~0) and "persistence broken across launches"
(entries would reset). Points at a **cache-key stability problem**: `PixelDataCache` keys on the
full URL string (`${url}@{width}x{height}`), and real Steam appdetails hint URLs carry a
`?t=<timestamp>` query parameter that isn't stable long-term (confirmed present on live
`header_image`/`capsule_image` URLs during the Problem 2 investigation). A game resolved via a real
hint gets a cache key that silently changes whenever Steam regenerates that timestamp, orphaning a
perfectly good previously-decoded entry — explaining both the low hit rate and why it barely
improves run to run. The demo store never hits this because its fixed baked-pack entries have no
query string at all. This same instability affects `artwork_dead_paths` (Root Cause below) for the
same reason, for the same class of URL.

**Why the logging got reverted, not just the finding**: `PixelDataCache.diagnose()` already prints
this exact set of numbers to console, and `LodArtworkOrchestratorDebug.registerConsoleCommands()`
already has the established idiom for "let a dev inspect cache state on demand" —
`window.diagnosePixelCache()`, `window.artworkFailureStats()`, etc. — a standing auto-fired log
line was redundant with capability that already existed, not a new one. Nothing needed to ship for
this; the real numbers above are the durable output of this pass.

**Next real step here**: normalize the cache key before storing/looking up — strip the volatile
query string (or at minimum `?t=`) so a timestamp refresh doesn't invalidate a still-valid decoded
image. Not yet implemented. Affects both `PixelDataCache` and `artwork_dead_paths`.

### D. `library` art has no API source at all — but the local Steam client cache has the actual files (2026-07-25) — disk-read part not yet started

Confirmed on a real install (`C:\Program Files (x86)\Steam\appcache\librarycache\`): Steam's own
client caches rendered library art to disk per appid, mirroring both CDN conventions:

```
librarycache/440/library_600x900.jpg                                     legacy: flat, predictable
librarycache/2062430/a157aa8de4bd9070194ddffb27c31636355dca05/library_header.jpg   migrated: hash-named subfolder
librarycache/2062430/b6cabe1940c55119820eee4ed2d0b604bd5b3af4/library_600x900.jpg  BALL x PIT's real library art
```

The hash folder name (`a157aa8de...`) is byte-identical to the hash the live Store API returns for
this app's `header_image` — the local cache structure encodes the same CDN hash the API would give
us, no API call needed. BALL x PIT's actual `library_600x900.jpg` (the file we've been failing to
fetch over the network) is sitting there locally, already validated by Steam's own client.

Coverage on this one install (1846 cached appids): 999 have `library_600x900.jpg` (flat or hashed),
1294 have `header.jpg`, 1138 have `library_hero.jpg`, 1013 have `logo.png`. Not exhaustive
(presumably appids never opened in the Library tab's grid view aren't cached) but resolves the
majority of cases at zero network cost, and unlike a CDN guess, presence here is a guarantee of
validity — Steam already fetched and validated it. Absence is a free, instant "don't bother" signal
instead of a failed fetch.

This is the deterministic answer to "can we identify library image paths without guessing" — we
can, but only from local disk, not from any API (confirmed in Root Cause A: `appdetails` has no
`library` field at all, for any game). Changes the priority order specifically for `library`:
**local disk cache first (free, deterministic) → guess as last resort, recorded in
`AppDetailsData.artwork_dead_paths` on failure** (see Decisions below). Network hydration (Root
Cause A's fix) still matters for `header`/`capsule`/`background`, which *do* have a real API
source — it was never going to solve `library` on its own.

**Follow-up investigation, 2026-07-29 — hash→CDN-URL theory tested against 20 real appids, not
just the single BALL x PIT sample above.** Two separate questions, tested separately:

1. *Does the local hash dir name match the CDN hash the live Steam API reports right now?* Sampled
   20 appids from this install's 389 hash-convention entries, live-fetched each via
   `store.steampowered.com/api/appdetails`, compared hashes:
   - `header_image` hash: matched the local `library_header.jpg` hash-dir in **8/17** cases where
     the API returned a header at all (3/20 had no `header_image` in the response). Mismatches are
     real, not a bug — the local cache is only as fresh as the last time the Steam client rendered
     that app's library/store page, while Valve periodically re-renders header art (sales,
     seasonal banners). **Confirmed the mismatched hash still resolves on the CDN anyway** (tested
     appId 1003590: both the stale local hash and the current live-API hash return `200`) — Akamai
     doesn't appear to garbage-collect superseded asset revisions, so a stale local hash is *never
     observed to 404*, only to potentially serve an older (still real) art revision.
   - `capsule_image` hash: matched **0/20**. Not staleness — local `library_capsule.jpg` is a
     different asset than the Store API's `capsule_image`/`capsule_imagev5` (231×87/184×69 store
     listing thumbnails) entirely; the local file is the Library-grid capsule, which the public API
     has no field for. Don't treat local `library_capsule.jpg` as a stand-in for the API's capsule
     fields — unverified as anything beyond "some capsule-shaped local asset."
2. *Does the CDN actually serve content at `apps/{appid}/{local-hash}/library_600x900.jpg` — the
   field the Steam API has no equivalent for at all, so there's no API hash to compare against in
   the first place?* Constructed that URL from 7 different appids' local hash-dir names (including
   BALL x PIT) and issued a real `curl -I`: **7/7 returned `200`**. Negative control: the same URL
   shape with a bogus all-zero hash returned `404` on 3/3 tries — confirms the CDN actually
   validates the hash rather than ignoring it, so a `200` here is a genuine, specific confirmation,
   not a coincidence of a permissive CDN.

**Conclusion**: for the format we actually care about (`library`), the local hash is not just
"probably right" — every locally-observed hash tested resolved to real content, and even a
provably out-of-date hash for a *different* field (`header`) never came back dead, only
potentially-older. This is strong enough to treat local-hash-derived `library_600x900.jpg` and
`library_header.jpg` CDN URLs as legitimate, submittable candidates (see build plan below) — not
merely a same-session read shortcut.

Not yet designed in detail: the Tauri-side read and the CDN-URL discovery/backfill path — see
**Build plan**, immediately below, written 2026-07-29 for sign-off before implementation.

## Build plan: local librarycache read + CDN URL discovery (Root Cause D)

**Status**: Proposed 2026-07-29, awaiting sign-off. Two distinct deliverables sharing one Rust
read: (1) render from local bytes directly, zero network; (2) turn a locally-observed CDN hash
into a real candidate URL the normal resolution/dead-path pipeline can try and validate, so it can
also flow into `AppDetailsCache` (and from there, the existing bake pipeline) for the benefit of
sessions/builds that have no local disk to read from at all.

### On-disk shape (confirmed across ~25 real appids this session, both conventions)

```
librarycache/<appid>/library_600x900.jpg              legacy: flat, no hash
librarycache/<appid>/header.jpg                        legacy: flat, no hash
librarycache/<appid>/library_hero.jpg (+_blur)         legacy: flat, no hash
librarycache/<appid>/logo.png                          legacy: flat, no hash

librarycache/<appid>/<hash40>/library_600x900.jpg      hash-migrated: our `library` format
librarycache/<appid>/<hash40>/library_header.jpg       hash-migrated: our `header` format
librarycache/<appid>/<hash40>/library_capsule.jpg      hash-migrated: unverified, not our `capsule` field (see above) — skip
librarycache/<appid>/<hash40>/library_hero.jpg (+_blur) hash-migrated: not currently rendered, out of scope
librarycache/<appid>/<hash40>/logo.png                 hash-migrated: not currently rendered, out of scope
librarycache/<appid>/<hash40>.jpg                      small icon, distinct slot again — out of scope
```

One hash-dir per asset "slot" (never mixed). Legacy convention has no capsule file at all and no
hash to construct anything from — bytes-read is the only benefit there (the guessed flat CDN URL
already works for legacy-convention titles, which is presumably *why* they're still legacy).

### Deliverable 1 — read bytes directly (zero network)

New `desktop/tauri-app/src/steam/librarycache.rs`, following `screenshots.rs`'s established
two-command shape (index command returns metadata only; a second, `..`-guarded command returns
bytes lazily):

- `find_local_library_art(appids: Vec<u32>) -> Vec<LocalLibraryArtEntry>` — **batched**, one IPC
  round-trip for the whole candidate set (same batching shape as `read_local_app_metadata`), called
  once during the same local-scan pass as `read_local_app_metadata`/`read_steam_playtimes`. Pure
  directory listing (`librarycache/<appid>/`, no per-user resolution needed — this lives under
  `steam_root` directly, not `userdata/<id>/`, so it's simpler than `screenshots.rs`). For each
  appid, reports whichever of `library`/`header` are available, each with: a relative path (for the
  bytes call) and, for the hash-migrated convention, the hash string itself (needed for Deliverable
  2 without a second disk touch).
- `read_local_library_art_bytes(appid: u32, relative_path: String) -> Vec<u8>` — lazy, one call per
  format actually rendered (not the whole discovered set) — mirrors `read_local_screenshot_bytes`'s
  `..`-traversal guard, re-anchored under `librarycache/<appid>/` specifically (not `steam_root`
  broadly) so an approved appid still can't be used to escape that folder.

TS side: `GameArtworkProvider`/`GameArtworkRequest` gain a local-disk tier ahead of every URL
candidate — if the startup index has a matching slot for this appid+format, fetch bytes via the
lazy command, decode through the same worker pipeline `TextureWorker` already uses for blobs
(skip `fetchImage()`'s network fetch, pass the bytes straight to `createImageBitmap` via a `Blob`),
store into `PixelDataCache` keyed the same as any other resolution, return. Falls through to the
existing URL-strategy behavior unchanged if the local index has nothing for this appid+format, or
if the read fails for any reason.

### Deliverable 2 — turn a local hash into a real candidate URL (and cache entry)

`AppDetailsData['artwork']` gains `library: string | null` (it currently has no `library` slot at
all — matches Root Cause A's finding that the Steam API doesn't either). When
`find_local_library_art` reports a hash-migrated slot, construct
`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/{hash}/{filename}`.

**Updated 2026-07-29** (superseding this section's original "let it fail naturally" design): the
constructed URL is validated with a real check *before* it's merged into `AppDetailsCache` at
all — never written as a trusted `artwork.library`/`artwork.header` value on spec. See
[Release Pipeline Step 2.4](release-pipeline-plan.md#step-24-proposed-2026-07-29-folding-in-desktop-discovered-contributions)
for the validation queue design (rate-limited, skips hashes already validated, writes the merge on
success and a normal `markArtworkPathDead` entry on failure) — that section owns this mechanism
now, since it's shared with the contribution-file write. Triggered manually from a settings-menu
action (present in every desktop build, gated on `isTauri()` so it doesn't render on web) rather
than running automatically as part of the local scan — not something that fires just from normal
app usage. This is also the concrete mechanism for
the earlier "how do we get real artwork paths into the baked/S3 cache" question — a validated
merge into `AppDetailsCache` benefits this session immediately, and the same discovery, written to
`data/contributions/library-art-urls.ndjson`, is what Step 2.4's bake-time fold-in picks up for
every future build. What this plan does **not** cover: getting a desktop client's local discoveries
back to the *shared* Lambda-backed cache for other users/builds to benefit from at runtime (as
opposed to at the next bake) — that needs a new write surface (an endpoint, trust/validation
questions) and stays out of scope, per Release Pipeline Step 2.4's own scope note.

### Explicitly out of scope for this pass

- `library_capsule.jpg` → not wired to anything; unverified against the API's capsule fields.
- `library_hero`/`logo`/icon slots → not currently rendered by anything, no consumer yet.
- Pushing discovered URLs to the *shared* Lambda cache (only the local `AppDetailsCache` write is
  in scope) — separate decision, separate scope.
- Legacy-convention (flat, no hash) appids get the bytes-read benefit only — nothing to backfill to
  the remote cache from a convention that has no hash to begin with.

### Risks / things to confirm before or during implementation

- Coverage is inherently partial (999/1846 appids on this install have `library_600x900.jpg` at
  all) — this sits *ahead of* the existing guess/network fallback, never replaces it.
- Per-format IPC bytes copy (hero images observed up to ~600KB) only fires for formats actually
  rendered, lazily — same cost profile as the network fetch it replaces, not a new cost.
- `capabilities/default.json` currently grants only `core:default`; `screenshots.rs`/`appinfo.rs`
  needed nothing beyond that for their own `std::fs` reads, so the new commands likely need no
  capability changes either — confirm during implementation rather than assuming.

### E. S3/Lambda cache write durability — confirmed safe, out of scope for this plan

[cache.js](../../external-tool/infrastructure/lambda-src/services/cache.js): `getFromCache()`
short-circuits on any hit (memory → S3 hydrated → S3 base) and only fetches from Steam on a genuine
miss; `saveToCache()` is an unconditional `PutObject`, no merge logic. A good write, once made, is
never re-fetched or overwritten. (There's also no TTL/staleness check, but per direction — **not in
scope for this plan** — that's tracked separately under [Multi-Layer Caching](../features/multi-layer-caching.md)'s
existing AppDetailsCache TTL gap, not duplicated here.)

## Decisions so far

- **Dead-path cache doesn't need a failure taxonomy — implemented 2026-07-25, reworked same day.**
  A dead guessed URL is worth persisting regardless of *why* it died (CDN migration, genuinely no
  artwork, CORS-vs-404 ambiguity) — no need to classify "legitimate no-art" (demos, dedicated
  servers) separately from "should have worked." `AppDetailsData.type === 'demo'` is available
  later as a softer signal if we ever want one, but nothing found so far justifies building that
  now.
  **First pass built a standalone `ArtworkDeadPathCache`** (own IndexedDB store, keyed by URL
  string) — reconsidered on review: `AppDetailsData` already carries this appid's other artwork
  metadata, the baked bundle already serializes whatever's in `AppDetailsCache` verbatim, and a
  separate URL-keyed store would need its own bake-time folding mechanism to ever reach that
  bundle. Replaced with `AppDetailsData.artwork_dead_paths?: string[]`
  ([BatchAppDetailsClient.ts](../../client/src/steam/batch/BatchAppDetailsClient.ts)) — same
  entry, same store, appid-keyed like everything else, bundled for free. `mergeAppDetails` gained
  a dedicated **union** merge rule for this one field (every other field is "prefer newer
  meaningful value," which is wrong here — losing a known-dead path is a real regression, not
  staleness). `AppDetailsCache.getDeadArtworkPaths(appid)` / `.markArtworkPathDead(appid, url)` are
  the read/write API. **`GameArtworkRequest` calls these directly**, not through
  `GameArtworkProvider` - an intermediate version routed through two `GameArtworkProvider`
  passthrough methods that added nothing (unlike `recordFailure`/`fetchPixels`/`buildUrlStrategy`,
  where `GameArtworkProvider` genuinely owns logic/state, dead-path data is entirely
  `AppDetailsCache`'s, so the extra hop was pure indirection); removed on review. Reads the whole
  dead-path set once per resolution attempt (not once per candidate) and checks membership
  synchronously in the strategy loop. `markArtworkPathDead` no-ops if the appid has no existing
  entry at all, rather than creating a blank shell record just to hold one dead URL. Per-candidate
  dead-mark writes are queued (not awaited inline, so they don't delay trying the next candidate)
  but always drained via `Promise.allSettled` before `fetchFromStrategy` itself returns or throws
  — a genuinely fire-and-forget write lost a real test run once a later candidate resolved before
  the write landed, which would equally be a risk in production against a fast app-quit.
  `IndexedDbCache<T>`'s key-type generic (added for the first pass's standalone store) was
  reverted - nothing needs a non-number key anymore. A brief second version added
  `AppDetailsCache.getDeadArtworkPathStats()` plus an `AllBatchesComplete`-hooked log line in
  `LodArtworkOrchestratorDebug` to see it working - both reverted (see Status, top of doc): the
  method existed only to feed that one log line, no other caller, and `getAllEntries()` (already
  public, already used elsewhere) is enough to compute the same thing ad hoc from a console if
  ever needed again.

  **Field-confirmed 2026-07-28**, via that now-reverted ephemeral logging, against a real desktop
  session (`desktop/localhost-1785292089974.log`): every one of 62 `Artwork resolution failed`
  lines in that session showed `tried=` empty and every candidate URL under
  `skipped(known-dead)=`, including appId 2062430 (BALL x PIT, the original investigation case) -
  confirming zero network attempts for already-known-dead games. Session total: **513 known-dead
  URLs across 389 appids** - the 389 figure lines up almost exactly with the independent HAR-based
  estimate from the original investigation (also 389 distinct appids), a strong cross-check that
  the mechanism is capturing the real failure population, not an over- or under-count.
- **No per-format outcome tracking needed, single "no artwork" state is correct.** Confirmed
  game-box rendering only ever requests `format: 'library'`
  ([LodArtworkOrchestrator.ts:402,530](../../client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts)),
  and that single request already tries library→capsule→header as fallback candidates within one
  attempt before giving up — there's no scenario where our pipeline persists "header resolved,
  capsule didn't" as two separate outcomes for the same game. (`BinderGameDetailPanel`/
  `GameLibraryBinderUI` build a raw inline `<img>` URL and never touch this system — separate,
  minor, not part of the cache, not a counterexample.) `artwork_dead_paths` still needs to hold
  **individual URLs, not a per-appid boolean** (so a known-dead guess can be skipped without
  refusing a *different* candidate for the same game), but the logged/surfaced outcome collapses
  to one state per game.

  **Revisit at wrap-up/field-test review (raised 2026-07-28, not resolved)**: per-URL is justified
  architecturally because `buildUrlStrategy()`'s candidate list changes as `artworkHints` improve
  over time (Root Cause A landing real hints for games that only had guesses before) - a per-appid
  boolean would need extra invalidation logic to reopen that door, or it'd permanently suppress a
  game the moment it first failed. But there's a simpler event-driven alternative worth weighing
  once we have field data: **compare artwork paths specifically at the moment `artwork_network_checked`
  transitions to `true` for an appid**, rather than carrying a persistent per-URL blacklist forward
  indefinitely - diff old-guessed vs. new-real paths once, right when real data arrives, instead of
  checking membership against an ever-growing list on every attempt. Not implemented, no
  measurement backing either design yet. Also worth recording here: early field observation is that
  a meaningful share of titles either have **no real artwork at all** (not just at the paths we
  guessed) or have it at **paths we didn't predict** - both point toward Root Cause D's local-disk
  read mattering more than the precision of this dead-path mechanism. Revisit this whole decision
  once that's landed and we can see real numbers, not just reason about it.
- **`library` art: local disk cache first, guess last.** No API field exists for `library` at all
  (confirmed, see Root Cause A) — hydrating `AppDetailsCache` earlier was never going to fix this
  format specifically. Steam's own client cache (`appcache/librarycache/<appid>/`, see Root Cause
  D) has the real files, deterministically, for both the legacy and hash-migrated CDN
  conventions, at zero network cost. Priority becomes: local disk read → guess (marked dead in
  `artwork_dead_paths` on failure). `header`/`capsule`/`background` keep the "hydrate
  `AppDetailsCache` earlier" fix from Root Cause A, since those *do* have a real API field.
- **S3 writes are durable once made** — confirmed via the Lambda cache code. TTL/staleness is
  explicitly out of scope for this plan (tracked under [Multi-Layer Caching](../features/multi-layer-caching.md) instead).

## Open questions

~~What exactly gates the network appdetails fetch?~~ **Resolved 2026-07-25** — see Root Cause A.
`findMissingArtwork()` requires both a fetchable URL to exist *and* the entry to lack
`artwork_network_checked`, per the note left here during review.

1. ~~Tauri-side read for the local `librarycache` folder~~ **Resolved 2026-07-31** — implemented,
   field-tested, and confirmed against real sessions (PR #149): 999/1845 cached appids on the test
   machine have a library slot; local reads verifiably engage (native 600×900 decode signature);
   the JSON-IPC transport bug that briefly made things *slower* than before this landed is fixed.
2. ~~URL-key normalization for `PixelDataCache` / `artwork_dead_paths`~~ **Resolved 2026-07-29** —
   `UrlUtils.stripQueryParam(url, 't')`, applied at both `PixelDataCache`'s cache-key construction
   (`GameArtworkProvider.fetchPixels`/`isPixelsCached`) and `artwork_dead_paths`'
   storage/lookup (`AppDetailsCache.markArtworkPathDead`, `GameArtworkRequest.fetchFromStrategy`).
   The actual network fetch still uses the untouched original URL — only cache keys changed.
3. ~~One-time bake-time backfill~~ **Superseded 2026-07-29** — scoped as [Release Pipeline Step
   2.4](release-pipeline-plan.md#step-24-proposed-2026-07-29-folding-in-desktop-discovered-contributions)
   (design decided 2026-07-29, awaiting implementation): desktop-discovered dead-paths and
   validated local-librarycache-derived real URLs get written to two separate NDJSON contribution
   files, folded into `app-details.json.gz` at bake time (before F2P baking, which now prefers a
   folded-in real URL over its own guess) — developer-workflow scope for now (a developer copies
   the files in manually before a release), not a live end-user submission pipeline. Answers this
   session's earlier "how do we get real artwork paths into the baked cache" question concretely.
4. ~~Concurrency cap shape~~ **Scoped, re-evaluated, signed off, and implemented, all 2026-07-31**
   — see "Build plan: prefetch scheduling, worker pool, and HIGH-tier correctness" under Root Cause
   B, above. All three design forks resolved (placement gate stays; queue-and-re-sort in the
   prefetch coordinator; HIGH-tier fixes bundled in). Own PR/changeset, branched from the merged
   #149 as `act2/artwork-loading-concurrency`; not yet field-tested against a real desktop session.
~~`artwork_dead_paths` baked-bundle half~~ **Resolved by the 2026-07-25 rework** — living on
`AppDetailsData` means the bake/repack scripts pick it up automatically, the same way they already
pick up every other field on that type. No separate mechanism needed.

~~Field-test the dead-path mechanism against a real session~~ **Resolved 2026-07-28** — see
Decisions, above: 513 known-dead URLs / 389 appids in one real desktop session, cross-checked
against the original HAR-based estimate.

**Small side-observation, not chased**: the same field-test log showed `[TextureWorker] High-res
CDN image detected: native 460×215...` firing 328 times - not actually rare/high-res, that's just
`ARTWORK_DIMENSIONS.header`'s normal size ([GameArtworkProvider.ts:37](../../client/src/scene/game-box/instancing/GameArtworkProvider.ts)).
The check (`texture-processing.worker.ts:222-226`) assumes most images are the 300×450 library
format and flags anything wider as noteworthy, but doesn't account for the header-format fallback
being routine, especially post-Root-Cause-A where header hints resolve more often. Pure log noise,
not a bug in behavior - not fixed as part of this plan, flagging in case it's worth a one-line fix
later (narrow the check to when a library-format request unexpectedly returns non-library
dimensions, rather than any image over 300px wide).

## Next steps (unscheduled — pick up per-item as each resolves)

- [x] Design the "has real artwork" readiness signal separate from "has any cache entry", for
      `header`/`capsule`/`background` (Root cause A)
- [x] Design + implement the persistent dead-path field on `AppDetailsData` + wire into
      `GameArtworkRequest` directly (not through `GameArtworkProvider`)
- [x] Instrument, measure, and revert `PixelDataCache` stats logging — kept the numbers
      (Root cause C), not the standing log line (redundant with existing `diagnose()`)
- [x] Field-test the dead-path mechanism against a real session — confirmed working, ephemeral
      logging reverted afterward (see Decisions, above)
- [x] Normalize the `PixelDataCache`/`artwork_dead_paths` cache key (strip `?t=`) — Root cause C
- [x] Implement the Tauri local `librarycache` read (Root cause D) — PR #149, field-confirmed
      2026-07-31 (999/1845 appids have a library slot; dead-path skip separately reconfirmed at
      56/56 in the same session). CDN URL discovery/validation (Deliverable 2 of the build plan)
      not included in #149 — still open, not yet scheduled.
- [x] Re-evaluate the concurrency build plan for player experience; resolve its three design forks
      — done 2026-07-31, see the build plan under Root Cause B (corrected three of its own first-pass
      findings and surfaced the HIGH-tier local-disk gap)
- [x] Implement, in order: prefetch scheduler with `PlacementIntentReady` distance re-sort → worker
      pool for `GameArtworkProvider`'s decode path → HIGH-tier correctness fixes (local-disk path,
      `?t=` normalization, dead-path skip) → source-bytes reuse across LOD tiers (the dedup fix,
      shape corrected during implementation — see "Implemented 2026-07-31" under the build plan).
      Done 2026-07-31 on `act2/artwork-loading-concurrency`; full suite green (1488 passed), not yet
      bundled into a PR or field-tested against a real desktop session.
- [ ] Field-test this changeset against a real desktop session before opening the PR — confirm the
      startup fill-in order visibly favors nearest-to-camera, and that walking up to a shelf no
      longer triggers a network fetch for a game whose art is already on disk.
- [ ] Placeholder artwork for games whose art hasn't resolved yet (real placeholder art, not label
      boxes) — the placement gate stays until this exists. Not scheduled; needs its own scope.
- [ ] Scope the one-time bake-time backfill avenue (now simpler — dead paths discovered live
      already land somewhere the bake pipeline can read back); partly overlaps the local
      librarycache plan's out-of-scope shared-cache-push item — scope together

---
*— A1 / P1*
