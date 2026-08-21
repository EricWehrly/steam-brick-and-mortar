# Research: Game-Box Store Data (Screenshots, Videos, DLC, Achievements)

**Status**: Research complete; phased implementation plan below not yet started
**Parent feature**: [Game Detail Screen](../features/game-detail-screen.md)
**Related**: [Game Box Open Interaction Plan](game-box-open-interaction-plan.md) (Follow-ups #5)

## Goal

The game-box fold-open detail panel (`client/src/scene/game-box-fold/GameBoxFoldModel.ts` +
`GameBoxFoldCoordinator.ts`) has "coming soon" placeholder rows for four data needs: **Screenshots,
Videos, DLC, Achievements**. ("Friends who own/played this game" is explicitly out of scope here.)

This doc asks, for each: can it come from the **local Steam client's own files** (this project's
established pattern — see below), avoiding the rate-limited/auth-gated Steam Web API? Or does it
realistically require the Store API?

## The established local-read pattern

Every existing local-data command in `desktop/tauri-app/src/steam/` follows the same shape:

1. **Locate the Steam install / active user** — `paths::find_steam_root()` (registry → default
   paths → drive scan → Start Menu shortcut) and `paths::active_userdata_dir()` (resolves
   `userdata/<accountid>` from `loginusers.vdf`'s active identity). Every reader below would reuse
   these unchanged.
2. **Parse the file** with whichever of the two VDF-family parsers already exist:
   - `steam::keyvalues` — hand-rolled **text KeyValues** parser (`"key" "value"` / `"key" { }`,
     comments, escapes). Used by `identity.rs`, `screenshots.rs` (own-screenshot `.vdf`),
     `collections.rs`, `playtime.rs`. Also the format of `appmanifest_<appid>.acf`,
     `libraryfolders.vdf`, `localization.vdf`.
   - `steam::appinfo` — hand-rolled **binary KeyValues** parser for `appcache/appinfo.vdf`
     specifically (magic `0x07564429`, de-duplicated trailing string table). Reverse-engineered
     and byte-exact-validated during an earlier research pass
     (`docs/research/local-steam/desktop-offline-data-mining-findings.md` §6), ported directly
     into `appinfo.rs`. `AppInfoFile::get_local_metadata()` already decodes the `common` and
     `extended` blocks for name/developer/publisher/tags/genres/categories — DLC below is a small
     extension of exactly this, not a new parser.
   - Plain **JSON** via `serde_json` (already a dependency) for anything Steam itself caches as
     JSON — see Achievements below, which turns out to be this case, not VDF at all.
3. **Expose via a `#[tauri::command]`**, returning a typed `#[derive(Serialize)]` struct (small
   payload, dozens of items → default JSON IPC, e.g. `screenshots.rs`) or a raw
   `tauri::ipc::Response` (large/binary payload on a hot path, e.g. `librarycache.rs`'s image
   bytes — explicitly *not* the shape needed for any of these four).
4. **Consume from TypeScript** via a thin static-method reader class that no-ops when
   `!isTauri()` (web build) — `LocalScreenshotReader.ts`, `LocalLibraryArtReader.ts`.

### Existing Cargo.toml crates (no VDF/ACF/binary crate present — by design)

```
tauri, serde, serde_json, hidapi
[windows] parselnk, winreg
[dev] tempfile
```

There is **no third-party VDF/ACF crate** — both VDF flavors needed here (text KeyValues, binary
appinfo) are already hand-rolled in-repo (`keyvalues.rs`, `appinfo.rs`), a deliberate choice
recorded in the original research (`desktop-offline-data-mining-findings.md` §0: text KeyValues is
trivial enough to hand-roll, and the binary appinfo variant needed byte-exact reverse engineering
no off-the-shelf crate handled anyway). **None of the four data needs below requires a new crate.**
Achievements is plain JSON (`serde_json`, already present). DLC extends the existing `appinfo.rs`
reader. Screenshots/videos don't get to the "what crate parses it" question at all — see below.

## 1. DLC list — LOCAL FILE, cheap

**Verdict: feasible locally.** Extends code that already exists.

**Source**: `appcache/appinfo.vdf`, `extended.listofdlc` — a comma-separated list of DLC appids.
Confirmed present during the original research pass (`desktop-offline-data-mining-findings.md`
§6b, "incidental finds inside `extended`... not currently modeled"), sitting in the exact same
`extended` block `AppInfoFile::get_local_metadata()` (`appinfo.rs:276-325`) already decodes for
`developer`/`publisher`.

**Rust-side work**: add one more field read alongside the existing
`extended.and_then(|e| e.get("developer"))...` lines — `extended.get("listofdlc").as_str()`,
split on `,`, parse each to `u32`. No new command file needed in principle (could live as a new
field on `LocalAppMetadata`/`RawLocalAppMetadata`), though a dedicated command may be cleaner if
DLC shouldn't ride along with every `read_local_app_metadata` call. No new crate, no new parser.

**Open questions / risks**:
- `listofdlc` gives **appids only**, not names or prices. To show "DLC: <name>" the UI needs each
  DLC appid's own name — plausibly resolvable by recursively calling `get_local_metadata()` on
  each DLC appid (DLC are themselves Steam apps and may have their own `appinfo.vdf` entry), but
  only if the client has ever cached info for that specific DLC appid — not guaranteed for
  DLC the user has never viewed/owned-but-ignored. Price/ownership-of-DLC is not in `appinfo.vdf`
  at all and would need the Store API or a license check — out of scope here.
- Not yet verified against a real appid that actually *has* DLC (the research pass's 4 sample
  apps — Portal 2, TF2, Portal, Half-Life 2 — weren't specifically checked for a non-empty
  `listofdlc`). Worth a quick real-machine check (extend `appinfo.rs`'s existing `#[ignore]`d
  real-machine test, same idiom as `reads_real_portal_2_local_metadata_on_this_machine`) against
  a game known to have DLC before committing to the shape.
- Secondary, narrower signal: `steamapps/appmanifest_<appid>.acf` (text KeyValues, already
  parseable with `keyvalues.rs`) is per-*installed* app, not per-owned app — useful at most for
  "is this DLC installed," not a general DLC-discovery source. Not the primary path.

## 2. Achievement definitions + unlock status — LOCAL FILE, plain JSON (not VDF at all)

**Verdict: feasible locally**, and structurally the **cheapest of the four** — not a VDF format,
so neither existing parser is even needed.

**Source**: `appcache/librarycache/<appid>.json` (Steam-root-scoped) and a parallel
`userdata/<id>/config/librarycache/<appid>.json` (user-scoped) — both real, both confirmed with
live data during the original research pass (`desktop-offline-data-mining-findings.md` §5). Note
this is a **different file** than the `appcache/librarycache/<appid>/` directory
`librarycache.rs` already reads (that's the image-asset subfolder for header/library art; this is
a sibling flat `.json` file for the same appid, populated by the client's Library UI).

Real shape observed (trimmed):
```json
[["achievements",{"version":2,"data":{
  "vecUnachieved":[{"strID":"ACH_1000_CIVILIANS","strName":"Terror Rising",
    "strDescription":"Kill 1,000 civilians.","strImage":"https://cdn.steamstatic.com/...",
    "bAchieved":false,"flAchieved":72.5,"flCurrentProgress":735,"flMaxProgress":1000}, ...],
  "nTotal":30,"nAchieved":0}}]]
```
Per-achievement name, description, global completion percentage (`flAchieved`), the user's own
progress/unlock state, and a CDN icon URL — no network call needed for any of it except actually
displaying the icon image (a plain CDN GET, same category as the library-art hashes
`librarycache.rs` already turns into CDN URLs without a round trip).

**Rust-side work**: a new module (e.g. `achievements.rs`) — straight `serde_json::from_str` into
`#[derive(Deserialize)]` structs mirroring the shape above, path discovery reusing
`paths::find_steam_root()`/`paths::active_userdata_dir()` exactly like `screenshots.rs` does. No
VDF parsing, no new crate — genuinely less code than either `keyvalues.rs`-based or
`appinfo.rs`-based readers.

**Open questions / risks**:
- The sample captured had `nAchieved: 0` — every achievement in it happened to be locked, so the
  **exact shape for an unlocked achievement is unconfirmed**: does it appear inside the same
  `vecUnachieved` list with `bAchieved: true` (list name notwithstanding), or is there a sibling
  `vecAchieved` array? This needs a real-machine check against a game with at least one unlocked
  achievement before committing to a struct shape — the single highest-value thing to verify
  before implementation starts.
- Two file locations (`appcache/` vs. `userdata/<id>/config/`) exist; which is authoritative,
  more complete, or fresher is unverified — worth comparing both on a real machine rather than
  guessing.
- **Coverage gap, not a format problem**: per the original finding, "this cache is populated by
  the client, not by us" — it's only written once a game has actually been launched (or at least
  had its Library page opened) through this Steam client. Owned-but-never-launched games in the
  library will have no local achievement cache at all. A Store-API fallback
  (`ISteamUserStats/GetSchemaForGame` + `GetPlayerAchievements`) would be the only way to fill
  that gap, and is out of scope for this pass.
- The task prompt's other candidate path, `appcache/stats/UserGameStatsSchema_<appid>.bin`
  (binary, SteamKit2-documented), is a genuinely different local source Valve's client also
  writes — not investigated here because the flat JSON cache above was found first and is
  simpler. Worth keeping as a fallback/cross-check (e.g. if the JSON cache turns out to lack
  per-achievement unlock *timestamps*, which the sample above doesn't show), not a first move —
  it would need its own binary-format reverse-engineering pass, likely reusable against
  `appinfo.rs`'s KV-tree decoder if the inner format turns out to be the same binary KeyValues
  variant (unconfirmed).

## 3. Store-page screenshots — STORE API REQUIRED (no local cache found)

**Verdict: Store API required.** Not the user's own screenshots (already solved by
`LocalScreenshotReader.ts` / `screenshots.rs`, reading `userdata/<id>/760/screenshots.vdf`) —
this is Valve's official promotional screenshots for the store page.

This exact question was already the subject of a dedicated research pass in this repo:
[`docs/research/steam-visual-metadata-pipeline-research.md`](../research/steam-visual-metadata-pipeline-research.md).
Its conclusion: `appdetails` Store API's `screenshots[]` field (thumbnail + full-size URLs) is
"feasible and reliable" — that's the verified path. No local-file alternative for Valve's own
store screenshots was identified there, and none turned up in this pass either.

**General-knowledge caveat (unconfirmed in-repo, do not build against this without verifying
first)**: it's plausible from broader Steam-format reverse-engineering knowledge that
`appinfo.vdf`'s `common` block carries a `screenshots` key (filenames/hashes) in some client
versions, which — if present — could let a CDN URL be constructed client-side the same way
`librarycache.rs` already does for header/library-art hashes, with no Store API call. However,
this repo's own byte-exact research pass over `appinfo.vdf` (`desktop-offline-data-mining-findings.md`
§6b) enumerated the actual fields it found in `common`/`extended` and did **not** list a
`screenshots` key — meaning either the probed client version/appid sample didn't have one, or it
wasn't specifically looked for. Before anyone builds against this, it would need a dedicated
real-machine check (extend `appinfo.rs`'s existing `#[ignore]`d test to dump the full `common` key
set for a couple of sample apps and grep for anything screenshot-shaped). Treat as a "maybe worth
a 10-minute check later," not a recommended path.

**If Store API is used anyway**: `store.steampowered.com/api/appdetails?appids=<id>` needs no API
key, but is rate-limited and CORS-blocked from a browser — the reason this repo's own
`steam-store-appdetails-cors-research.md` exists. The desktop app's *Rust* backend, unlike the web
client, isn't subject to browser CORS and could make this call itself — worth noting as a
mitigation if this path is ever pursued, but it's still a networked, rate-limited dependency, not
a "local file" win, and out of scope for this research pass's recommendation.

## 4. Trailer/video URLs — STORE API REQUIRED (no local cache found)

**Verdict: Store API required**, same reasoning and same source as screenshots above.

`appdetails.movies[]` (thumbnail + `webm`/`mp4` stream URLs, per
`steam-visual-metadata-pipeline-research.md` §1) is the verified path; no local cache was found in
this pass or the prior one. The same `appinfo.vdf`-might-have-a-`movies`-key caveat from the
screenshots section applies here too, with the same "unconfirmed, check before building" status —
and since it would be the same real-machine check (dump `common`'s full key set once), it makes
sense to verify screenshots and movies together rather than as two separate follow-ups.

## Recommended sequencing

1. **Achievements first.** Structurally the cheapest (plain JSON, no VDF parsing, `serde_json`
   already a dependency) and the highest player-facing value of the four. Gate: one real-machine
   check against a game with an actual unlocked achievement, to confirm the
   `vecAchieved`/`vecUnachieved` shape before writing the Rust struct.
2. **DLC second.** Nearly free — extends `appinfo.rs::get_local_metadata()`'s existing `extended`
   block read with one more field. Main added cost is optional (best-effort DLC-appid → name
   resolution via a recursive lookup), not blocking a minimal "N DLC" display.
3. **Screenshots and videos — do not build against local files.** Both require the Store API
   (`appdetails.screenshots[]` / `.movies[]`), already established as the verified path by
   existing repo research. If/when this is prioritized, treat it as a deliberate decision to take
   on a rate-limited, networked dependency (possibly routed through the desktop Rust backend to
   dodge the browser-CORS problem documented elsewhere in this repo), not as an extension of the
   local-file pattern — and scope it separately from achievements/DLC.

## Implementation Plan (2026-08-13)

Not started - phased per the sequencing above, each phase independently shippable (the store panel
already has a "coming soon" row per section, so either phase can land without the other).

### Phase 1: Achievements

1. **Real-machine verification gate (do this first, before writing any struct).** Extend
   `appinfo.rs`'s existing `#[ignore]`d real-machine test idiom (see
   `reads_real_portal_2_local_metadata_on_this_machine`) with a throwaway script/test that dumps
   `appcache/librarycache/<appid>.json` for a game with at least one *unlocked* achievement.
   Confirms: does an unlocked entry live in `vecUnachieved` with `bAchieved: true` (list name
   notwithstanding), or is there a separate `vecAchieved` array? Also compare the Steam-root-scoped
   copy against the `userdata/<id>/config/librarycache/` copy for the same appid - note which is
   more complete/fresher.
2. **`desktop/tauri-app/src/steam/achievements.rs`** - new module, `serde_json::from_str` into
   `#[derive(Deserialize)]` structs matching the shape confirmed in (1). Path discovery reuses
   `paths::find_steam_root()`/`paths::active_userdata_dir()`, same as `screenshots.rs`. New
   `#[tauri::command]`, e.g. `read_local_achievements(appid: u32)`, returning the parsed
   name/description/global-completion-%/unlock-state list (small payload → default JSON IPC, same
   choice `screenshots.rs` made).
3. **`client/src/steam/LocalAchievementsReader.ts`** - thin static-method reader class, no-ops on
   `!isTauri()` (web build), mirroring `LocalScreenshotReader.ts`'s shape exactly.
4. **Wire into the store panel**: `GameBoxFoldCoordinator` fetches on selection (same
   fire-and-forget-with-cache pattern `applyHeaderImage()` already uses), replaces the
   "Achievements … coming soon" row in `GameBoxFoldModel.redrawStorePanel()` with real
   unlocked/total counts (e.g. "12/30 unlocked") once data arrives. Games with no local cache at
   all (never launched through this Steam client - a real coverage gap, not a bug, see the research
   doc's §2) fall back to the existing "coming soon" row rather than showing an error.
5. Unit tests: `achievements.rs` Rust-side parsing (fixture JSON, both list shapes if (1) reveals
   two), `LocalAchievementsReader` no-op-on-web + happy path, coordinator wiring + store-panel
   rendering.

### Phase 2: DLC

1. Extend `AppInfoFile::get_local_metadata()` (`appinfo.rs:276-325`) with one more field read off
   the existing `extended` block: `extended.get("listofdlc")`, split on `,`, parse each token to
   `u32`. Add to whichever struct `developer`/`publisher` already live on
   (`LocalAppMetadata`/`RawLocalAppMetadata`).
2. **Real-machine check**: confirm against a game actually known to have DLC (the original research
   pass's 4 sample apps weren't checked for this) before trusting the shape.
3. Minimal version: show "N DLC" using just the appid count, no name resolution - unblocks landing
   without the recursive-lookup complexity in (4).
4. Optional follow-up, not blocking: best-effort DLC-appid → name resolution via a recursive
   `get_local_metadata()` call per DLC appid (only succeeds if the client has ever cached that
   specific DLC's own `appinfo.vdf` entry - not guaranteed for DLC the user has never viewed).
5. Wire into `GameBoxFoldModel.redrawStorePanel()`'s "DLC … coming soon" row, same
   fetch-on-selection pattern as Phase 1.
6. Unit tests: extended-field parsing (including the "no `listofdlc` key at all" case, which must
   stay silent/empty, not error), coordinator wiring + rendering.

## Related

- [Desktop Offline Data Mining — Findings](../research/local-steam/desktop-offline-data-mining-findings.md) — source of the DLC/achievement local-file findings (§5, §6b)
- [Steam Visual Metadata Pipeline Research](../research/steam-visual-metadata-pipeline-research.md) — source of the screenshots/videos Store-API findings
- [Steam Store Appdetails CORS Research](../research/steam-store-appdetails-cors-research.md) — why `appdetails` isn't called directly from the browser today
- `desktop/tauri-app/src/steam/appinfo.rs`, `desktop/tauri-app/src/steam/keyvalues.rs`, `desktop/tauri-app/src/steam/screenshots.rs`, `desktop/tauri-app/src/steam/librarycache.rs` — the existing local-read pattern this doc builds on
- [Game Detail Screen](../features/game-detail-screen.md) — parent feature, "Data richness" bullet
- [Game Box Open Interaction Plan](game-box-open-interaction-plan.md) — Follow-ups #5 ("Missing data")
