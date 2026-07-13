# Plan: Desktop Local Data Pipeline

**Status**: Draft — awaiting sign-off before implementation
**Parent feature**: [Local File Investigation](../features/local-file-investigation.md)
**Umbrella**: [Native Desktop App](../features/desktop-app.md)
**Feeds**: [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md)

## Goal

Wire the findings from
[`desktop-offline-data-mining-findings.md`](../research/local-steam/desktop-offline-data-mining-findings.md)
into the running Tauri desktop app: scan the local Steam install on startup, produce structured
data in the **same cache the web app already uses** (no parallel cache format), and stream a
player's real library in over that data — first silently in the background while an anonymous
demo store is already interactive, then, once cached, fast enough that later launches skip the
demo store entirely.

## Prerequisite check (before this plan's work starts)

Two things needed verifying before depending on anything below.

### 1. Is the baked appdetails cache + F2P artwork bundle actually reaching the desktop build?

**Checked. Architecturally sound, but never exercised end-to-end — treat as unverified, not broken.**

- `scripts/release.sh:19-21` writes the bake output to `client/public/steam-cache/app-details.json.gz`
  and `client/public/artwork-cache/` — both inside `client/public/`.
- `client/vite.config.ts:3` sets `publicDir: 'public'`, so a `yarn build` copies both directories
  verbatim into `client/dist/`.
- `client/src/steam/cache/BakedCacheLoader.ts:25,55` and
  `client/src/steam/utils/BakedArtworkManifest.ts:10-11,28` load them via root-relative
  `fetch('/steam-cache/app-details.json.gz')` / `fetch('/artwork-cache/manifest.json')` — whatever
  is served at `/` needs those paths to exist.
- `desktop/tauri-app/tauri.conf.json:5-8` sets `frontendDist: "../../client/dist"` — the same
  directory Vite writes to. No separate desktop frontend source exists, so there's no divergence
  risk between web and desktop *content* — only a build-order risk.
- **The gap**: `scripts/release.sh:88-93` — `build_web()` and `build_desktop()` are both stubbed
  (`log_step "not yet implemented"`). Nothing currently orchestrates
  "pull S3 cache → repack → bake artwork → `yarn build` → `cargo tauri build`" as one sequence.
  `desktop/tauri-app/README.md:26-29` documents the two build commands as a manual, order-dependent
  sequence a developer has to remember. There is also no CI workflow (`.github/workflows/` doesn't
  exist) that would catch a missed bake step.

**Action before this plan depends on baked data being present in a desktop build**: run the manual
sequence once (`release.sh`'s bake steps → `cd client && yarn build` → `cd desktop/tauri-app &&
cargo tauri build`) and confirm `/steam-cache/app-details.json.gz` and `/artwork-cache/manifest.json`
actually load in the built app — a 15-minute smoke test, not a code change. Track the real fix
(wiring `build_web`/`build_desktop` into `release.sh`) as a small follow-up task in this plan's
task list below; it's not this plan's core scope but it's now a known gap this plan's work depends on.

### 2. Any other blockers?

None found. The two binary/text VDF formats this plan needs are now understood and validated
(see findings doc §0 and §6) — no open research question blocks starting implementation, only the
smoke test above.

## Architecture decision: one cache, two writers

**Decision, not an open question**: the local scan writes into the exact same `AppDetailsCache`
(IndexedDB, `steam-app-details-cache` / `appdetails` store,
`client/src/steam/cache/AppDetailsCache.ts:27-33`) the web app already uses. This works
unmodified on desktop because Tauri's WebView2 frontend is still a web view — IndexedDB is
available there exactly as it is in a browser tab. No new storage mechanism, no new cache format,
no divergence between web and desktop consumers. This is what makes "produce a cache in the same
spot as the web app" literal, not just a DRY aspiration.

Concretely: `AppDetailsCache` gains a second writer (today, only `GamesLoader.fetchAndEmitUncached`
writes to it, via the Lambda `appdetails` fetch, `client/src/steam/GamesLoader.ts:186-190`). The
local-scan writer produces the same `AppDetailsData` shape and calls the same `setMany()`. Once
that lands, **`GamesLoader` itself needs no changes** — its existing `partitionByCache` /
`isMetadataComplete` logic (`client/src/steam/GamesLoader.ts:206-259`) already treats any
sufficiently-complete cache entry as renderable regardless of who wrote it. Seeding the cache
earlier just means more cache hits, fewer Lambda round-trips, sooner.

Two shapes need a normalization step before they fit `AppDetailsData` (see findings doc §6 for the
raw shapes):
- `genres`/`category_N` (numeric IDs) → `AppDetailsData.genres` / `.categories`
  (`[{id, description}]`) needs a static id→name table. Not present locally; source once (e.g.
  scrape from any single live `appdetails` response, or SteamKit2's published enum) and ship as a
  small static asset. Low priority — this data is redundant with `appdetails` per the provenance
  doc, so a missing/incomplete table only means slower pre-warm, not missing functionality.
- `store_tags` (rank-ordered ids) → `AppDetailsData.steamspy_tags` (`Record<string, number>`,
  vote-count-shaped) needs a rank→weight synthesis (e.g. `weight = 20 - rank_index`) and the
  `appcache/localization.vdf` id→name table (present locally, trivial text-VDF parse). Higher
  priority — this is the tag-latency-reduction win.

## Startup flow

Modeled on the existing `BatchEmitter` / `GamesLoader.loadGamesProgressively` pattern
(`client/src/steam/BatchEmitter.ts`, `client/src/steam/GamesLoader.ts:44-92`) — accumulate,
emit typed events in shelf-sized batches, yield the main thread between batches. The local scan
doesn't replace that pattern, it runs *before* it, seeding the cache the existing pattern already
reads from.

**First run on a machine** (no prior desktop-app session):
1. App launches. Anonymous/demo store renders immediately from the existing baked
   `AppDetailsCache` seed (`GamesLoader.getDemoGames()`, `client/src/steam/GamesLoader.ts:124-143`)
   — this path is unchanged by this plan.
2. In the background: a Rust-side scan (Tauri command) walks the Steam install — identity
   (`loginusers.vdf`), local library signal (`appmanifest_*.acf` / `libraryfolders.vdf` /
   `localconfig.vdf` / `cloud-storage-namespace-1.json`), and metadata pre-warm (`appinfo.vdf` +
   `localization.vdf`) — and streams results back over Tauri IPC.
3. As results arrive, the client-side orchestrator normalizes them into `AppDetailsData` and
   `SteamGame` shapes and writes into `AppDetailsCache`, mirroring the existing
   `LibraryManifestReady` → `GamesBatchReady` → flush event sequence so the rest of the render
   pipeline doesn't need to know the data came from disk instead of the network.
4. Once identity is known and a local appid set exists, the real library starts rendering
   alongside/over the demo store — same transition the web app already does when a Steam login
   completes, not a new UI state.

**Subsequent runs**: identity and a warm cache already exist from step 2/3 above. Skip the
anonymous/demo store entirely — go straight to background scan + stream, same mechanism, just
starting from a populated cache instead of an empty one, so it resolves faster.

**Important scope boundary**: the local file scan gives identity and a *candidate* appid set
(installed + ever-launched + collection-referenced games — see
`local-steam-buckets-findings.md`'s "Confidence: High for installed/local-library footprint, not
full ownership" caveat), not the authoritative full owned-games list. The authoritative list still
comes from the existing "Connect Steam" WebView2 cookie-injection flow described in
[`desktop-app.md`](../features/desktop-app.md#library-capture-without-a-bookmarklet) — **this
plan does not replace that flow**, it runs alongside/ahead of it so there's something on screen
and cached before that flow completes.

## Task breakdown

Rust-side (new — `desktop/tauri-app/`):
1. Text-KeyValues (VDF) reader: `loginusers.vdf`, `localconfig.vdf`, `libraryfolders.vdf`,
   `appmanifest_*.acf`, `localization.vdf`. Trivial grammar, hand-roll or pull a small MIT crate
   (`keyvalues-parser` or similar) — evaluate both, don't over-invest in the decision.
2. Binary-KeyValues (`appinfo.vdf`) reader, string-table variant (magic `0x07564429`). Port of the
   byte-exact-validated research decoder described in the findings doc §6 — the format risk is
   retired, this is a translation task.
3. Local-scan orchestrator (Tauri command): runs the above against the detected Steam root +
   userdata folder, returns identity, candidate appid set with playtime/last-played, user
   collections, and per-appid `store_tags`/genre/category raw data.
4. Steam-root/userdata discovery — reuse/extend the path-detection logic already prototyped in
   `docs/research/local-steam/scan-local-steam-coverage.sh` (bash research script) as the spec for
   what the Rust version needs to handle (Windows-only for v1 is fine — `desktop-app.md`'s current
   scope is Windows/WebView2 first).

Client-side (`client/src/`):
5. Normalization: `store_tags` (+ `localization.vdf` names) → `steamspy_tags`-shaped
   `Record<string, number>`; local playtime/last-played/collections → `SteamGame` fields.
6. New writer path into `AppDetailsCache` (alongside the existing Lambda-fetch writer) — same
   `setMany()`, no schema change unless the normalized shape needs a new optional field.
7. Startup orchestration: call the Tauri command early, stream results through the
   `BatchEmitter`-style event sequence described above.
8. First-run vs. subsequent-run branch: skip the demo-store phase when a prior local-scan result
   already exists in cache.

Housekeeping:
9. Wire `build_web()`/`build_desktop()` in `scripts/release.sh` (currently stubbed,
   `scripts/release.sh:88-93`) so bake → build → package is one sequence instead of a
   developer-remembered manual order — closes the prerequisite gap above for good, not just for
   this smoke test.
10. Source a static genre/category id→name table (low priority, redundant data — see above).

## Explicitly out of scope for this plan

- **Public profile showcase widget** — not found locally (findings doc §4). Would need a
  web-API or CEF-cache investigation first; not blocking this plan.
- **CEF/Chromium htmlcache mining** — deprioritized (findings doc §7); not part of this pipeline.
- **Achievement cache, Steam Deck compatibility, DLC list** — real, confirmed local data
  (findings doc §5, §6b) but not sort/filter dimensions anyone has asked for yet. Land the
  pipeline plumbing this plan describes generically enough that adding these later is a new
  field mapping, not new infrastructure — but don't build them now.
- **Full-library ownership without "Connect Steam"** — see scope boundary above; not attempted.

## Open questions

- Rank→weight synthesis formula for `store_tags` (linear decay? something else?) — small
  decision, can be made during implementation rather than blocking sign-off here.
- Whether the local-scan Tauri command should run fully before first paint or truly
  fire-and-stream from process start — leaning toward the latter (matches the "background" framing
  in the goal) but worth confirming against actual Tauri startup-sequencing behavior once
  implementation starts.

## Related

- [Desktop Offline Data Mining — Findings](../research/local-steam/desktop-offline-data-mining-findings.md) — the research this plan implements
- [Local File Investigation](../features/local-file-investigation.md) — parent feature, acceptance criteria live there
- [Native Desktop App](../features/desktop-app.md) — umbrella; "Connect Steam" flow this plan runs alongside
- [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md) — the spec table this plan's tag work ultimately feeds
- `client/src/steam/GamesLoader.ts`, `client/src/steam/BatchEmitter.ts`, `client/src/steam/cache/AppDetailsCache.ts` — code this plan builds on top of, unmodified in its core logic
- `scripts/release.sh`, `desktop/tauri-app/tauri.conf.json` — the build-pipeline prerequisite check above

---
*— A1 / P1 / O2*
