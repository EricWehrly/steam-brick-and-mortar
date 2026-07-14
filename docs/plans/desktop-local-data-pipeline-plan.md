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

### 1. Is the baked appdetails cache + F2P artwork bundle actually reaching the desktop build?

**De-scoped, not blocking.** Local file mining (identity, playtime, collections — see below)
turns out to cover what this plan actually needs without depending on the baked bundle at all.
Leaving the investigation notes below for reference, but this is no longer gating anything in
this plan — if the bake pipeline gets wired up later that's a bonus, not a dependency.

<details>
<summary>Original investigation (kept for reference, not acted on)</summary>

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

**Action, if this ever becomes relevant again**: run the manual sequence once (`release.sh`'s bake
steps → `cd client && yarn build` → `cd desktop/tauri-app && cargo tauri build`) and confirm
`/steam-cache/app-details.json.gz` and `/artwork-cache/manifest.json` actually load in the built
app. Not tracked as a task in this plan.

</details>

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
  (`[{id, description}]`) needs an id→name table. **Decision** (see task 10 below and
  `taxonomy-data-event-plan.md`): source it from the pre-baked `appdetails` bundle already present
  in `client/public/steam-cache/`, not a live network fetch — this data is redundant with
  `appdetails` per the provenance doc either way, so a missing/incomplete table only means slower
  pre-warm, not missing functionality.
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

Rust-side (new — `desktop/tauri-app/src/steam/`):
1. ✅ **Done.** Text-KeyValues (VDF) reader (`keyvalues.rs`) — hand-rolled, ~200 lines, fixture-tested.
2. Binary-KeyValues (`appinfo.vdf`) reader, string-table variant (magic `0x07564429`). Port of the
   byte-exact-validated research decoder described in the findings doc §6 — the format risk is
   retired, this is a translation task. **Not started** — next up.
3. ✅ **Done, partial.** Tauri commands for identity (`identity.rs`), playtime
   (`playtime.rs`), and user collections (`collections.rs`) — each reads real files, each has a
   real-machine `#[ignore]`d test verified against this dev machine's actual Steam install (see
   commit `c86d5951`). Tag/genre/category data from `appinfo.vdf` still pending task 2.
4. ✅ **Done, more thoroughly than originally scoped.** Steam-root/userdata discovery
   (`paths.rs`) is a 4-strategy chain, not a single hardcoded path: Windows registry
   (`HKCU\Software\Valve\Steam\SteamPath`, then `HKLM\...\InstallPath`) → per-OS default paths
   (Windows exercised for real; macOS/Linux entries present but untestable on this machine) →
   drive-letter scan (all-letter, not just `C:`) → Start Menu `.lnk` shortcut parsing
   (`parselnk` crate, working-directory field). Verified on this machine, both called directly
   (not just riding along behind the registry strategy in `find_steam_root`'s normal order):
   registry lookup agrees with the overall chain
   (`registry_lookup_matches_overall_discovery_on_this_machine`), and the Start Menu shortcut
   trace independently resolves to the same install too
   (`start_menu_shortcut_matches_overall_discovery_on_this_machine` — compares via
   `canonicalize()` since the `.lnk`'s stored path came back lowercased,
   `c:\program files (x86)\steam`, a harmless Windows case difference, not a wrong path).
   **Still not exercised**: macOS/Linux default paths (no test machine) and the drive-letter
   scan fallback (no non-`C:` install available to test against) — worth knowing those two
   remain unverified rather than assuming the whole chain is proven end-to-end.

Also **✅ Done**, not originally numbered: binary `appinfo.vdf` reader (`appinfo.rs`, magic
`0x07564429`, string-table variant) plus `localization.vdf` tag-name resolution — was task 2/"next
up" as of the last update to this doc; built and byte-exact-verified against real Portal 2 data
in the same session (`get_local_metadata` returns name/developers/publishers/rank-ordered tags;
see commit history for `appinfo.rs`/`localization.rs`).

Client-side (`client/src/`):
5. ✅ **Done, partial.** Tags → `steamspy_tags`-shaped `Record<string, number>` (descending
   rank-derived weight) — `LocalSteamDataWriter.buildWeightedTags`. **Not done**: local
   playtime/last-played → `SteamGame` fields (nothing currently merges local playtime into the
   game list — `LocalSteamDataWriter` only touches `AppDetailsCache`, not any `SteamGame`/
   ownership-shaped structure), and **user collections have no home in the type system at all
   yet** — `read_steam_collections` works and is console-logged, but nothing normalizes or
   writes it anywhere. Both are real gaps, not follow-on polish — see the taxonomy-event plan
   below, which needs collections wired in to do anything useful with them.
6. ✅ **Done.** `LocalSteamDataWriter` writes into `AppDetailsCache` via the existing `setMany()`
   — no `AppDetailsCache`/`GamesLoader` changes needed, confirming the plan's architecture bet.
7. **Partially done — narrower than "finished."** The Tauri commands *are* called early
   (`LocalSteamDataInspector`'s `GameEventTypes.Start` hook) and the write does happen before any
   user interaction, so the spirit of "call it early" is satisfied. But this is currently a
   single one-shot `await` chain living in a **debug tool**, not a first-class startup path, and
   it does **not** stream through a `BatchEmitter`-style batched event sequence — there's exactly
   one `setMany()` call, no progressive batches, no dedicated event marking "local taxonomy data
   landed" (see the new taxonomy-event plan below — that gap is now the more important one, and
   folds this task into it rather than finishing it standalone).
8. Not started. Depends on the taxonomy-event work below reaching a point where "is there useful
   cached data already" is answerable cheaply.

New, not in the original list — **found via this session's identity-display investigation**:
12. **Small, concrete bug, not just a desktop gap**: no UI anywhere — web or desktop — has ever
    displayed a Steam persona name. The in-scene "X's Steam Library" sign
    (`SceneSignManager.ts:104-115`) uses `resolveDisplayName(vanity_url)` (`SteamIntegration.ts:104,143-146`),
    a URL slug, because `SteamUser` (`SteamApiClient.ts:33-39`) has no `personaname` field at all.
    Desktop's `read_steam_identity` result dead-ends at `LocalSteamDataInspector`'s console.log —
    nothing routes it into `storeSteamDataAndEmitEvent`'s displayName path. Fix is two small
    pieces: (a) plumb `persona_name` into that path on desktop, (b) prefer it over `vanity_url`
    wherever both are available (persona name is a real display name; the slug never was).
13. **User collections schema + writer** — `AppDetailsData`/`SteamGame` need a field for "which
    collection(s) does this appid belong to" before "sort by user collections" can exist at all.
    Currently nothing (see task 5). Prerequisite for the taxonomy-event plan's desktop default-sort
    behavior.

Housekeeping / deferred:
9. Wire `build_web()`/`build_desktop()` in `scripts/release.sh` — **de-scoped**, see prerequisite
   check §1 above. Revisit only if the baked-cache path becomes relevant again.
10. **Pulled forward — no longer low priority.** Static genre/category id→name table. Elevated
    because the new taxonomy-event plan (see below) wants to offer genre/category as sort/filter
    dimensions the same way it offers tags, and right now local genre/category data is numeric-id-only
    with nowhere to resolve names. **Decision** (see
    [`taxonomy-data-event-plan.md`](taxonomy-data-event-plan.md)): harvest from the **already-present
    pre-baked `appdetails` bundle** (`client/public/steam-cache/app-details.json.gz`, confirmed on
    disk this session) rather than live network `appdetails` responses — zero Lambda dependency,
    reachable today regardless of the still-unwired `scripts/release.sh` re-bake automation (§1
    above, which is about future re-bakes, not today's existing bundle). Coverage/freshness of that
    bundle at real-library scale is explicitly deferred to a post-friends-testing data-integrity
    audit, not blocking this task.
11. **Act 3, pre-ship**: a manual "browse or paste your Steam install folder" fallback UI for
    when all four `find_steam_root` strategies above come up empty (non-standard install, Steam
    on a network drive, a future OS-version registry change, etc.). Not needed for this plan's
    development/testing phase — every strategy or the dev machine's own install covers that — but
    ship-blocking for real users whose machine doesn't match any of the four strategies. Track in
    the relevant Act 3 doc when this plan reaches implementation of tasks 5-8.
14. **Roadmap note, not scheduled**: revisiting "Connect Steam" priority/framing on desktop,
    achievement-cache data, and a bounded "eager ownership" heuristic — see the new subsection in
    [`desktop-app.md`](../features/desktop-app.md#revisit-connect-steam-priority-ownership-signals-not-yet-scheduled).

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
