# Feature: Local File Investigation

**Act**: 2 (Best Effort — invest to try, not required to complete)
**Status**: Paused (research complete for now; implementation deferred to AC4.4)
**Priority**: Medium

> **Ways of working note**: The VDF-first hypothesis is no longer current. Modern Steam collections are not stored in `localconfig.vdf` / `sharedconfig.vdf`; the viable source is the local Steam cloud sync file `cloud-storage-namespace-1.json`.

## Resumption trigger (supersedes the Act 2 tie-off below)

This feature was tied off for Act 2 with re-entry deferred to AC4.4 (decision below, kept for
history). **That deferral is being revisited now**, on different grounds than originally scoped:
local data mining is considered the **best bet** for solving the SteamSpy tag-latency problem (a
several-hundred-game library takes minutes to tag via SteamSpy's ~1 req/sec API with no bulk mode —
see [Traffic Safety Review](../plans/traffic-safety-review.md) and
[Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md)). If desktop local
files can surface tag-equivalent data (or something usable for sort/filter that doesn't depend on
SteamSpy's pacing), that's a materially better outcome than any of the online-source mitigations
being pursued in parallel. This is a new, Act-2-relevant motivation distinct from the original
user-categories driver below — both apply now. A follow-up session is picking this thread back up
with that framing.

## Decision (Act 2 Tie-Off) — original framing, see resumption trigger above

- We are stopping local-files implementation work in Act 2.
- The only high-value unique field confirmed is user collections/categories from `cloud-storage-namespace-1.json`.
- Additional local signals (install presence, local playtime/last-played, limited cloud/controller state) are useful but do not justify introducing filesystem API complexity right now.
- Re-entry target: AC4.4 (see `docs/acts/act4-encore-someday-maybe.md`) — **superseded by the SteamSpy-latency resumption trigger above**; re-entry is happening sooner than AC4.4 for that reason specifically.
- **On re-entry, also revisit**: `docs/architecture/sort-filter-data-provenance.md` (user categories
  are the only channel-exclusive sort/filter dimension identified so far — this feature is where
  more like it are likely to come from) and `docs/research/steamspy-bulk-alternatives-research-prompt.md`
  (paused specifically pending what this investigation turns up).

## Goal

Investigate what can be read from Steam's local installation files on the user's machine — with user categories as the primary motivator, but a broader interest in what else is available there.

Current priority framing:
- Primary value: user collections/categories as additive metadata, **and** — newly elevated, per the
  resumption trigger above — any local signal that approximates or substitutes for SteamSpy community
  tags, since that would sidestep the SteamSpy latency problem for desktop entirely
- Secondary value: local game-list signals (especially appids) and data health/quality
- Nice-to-have value: other local metadata that may improve UX but is not required

## Context

Steam stores a surprising amount of data locally that is never exposed through the web API. The most immediately useful piece is **user-defined game categories** — the organizational buckets a user has manually assigned to their library over time. There is still no public Steam Web API for them, but the viable source is now the user's local Steam cloud sync JSON rather than the older VDF files.

This matters for the GameSort pipeline: user categories are the most personally meaningful sort dimension we could offer, and they can't be synthesized from SteamSpy tags or genre metadata. Getting them unlocks a genuinely personalized sort experience.

Beyond categories, local Steam data still appears to contain other useful offline signals: play stats, install state, cloud sync state, UI state, and other configuration metadata. This feature now has two explicit tracks: a concrete implementation path for collections import, and a broader audit of what additional offline data is worth productizing later.

This is a non-tentpole feature for Act 2: we want to make a real attempt at it, but it won't block Act 2 completion.

## Design Intent

- Treat local-file data as a metadata overlay, never as authority data
- Preserve remote data contracts as source of truth for canonical game identity/details
- Compose local metadata at read time (sorting/filtering/render-time decisions), not by mutating remote records in place
- Keep provenance for each local field (source file, parser version, confidence)

## Acceptance Criteria

- Documented understanding of which local Steam files are relevant and where they live (cross-platform)
- User categories successfully read and surfaced to the application
- Documented understanding of what local game-list signals we can extract (minimum target: appid sets), including completeness and reliability caveats
- Integration with the GameSort pipeline (user categories available as a sort/filter dimension)
- Graceful fallback when local files are unavailable (no Steam install, wrong path, permission denied)
- No assumptions about file path — user must be able to configure or the app must discover it

## Stories / Tasks

- **Collections import implementation**: read `cloud-storage-namespace-1.json` via browser file access, parse `user-collections.*`, persist the imported mapping locally, and surface it to the app
- **Metadata overlay design**: define additive local metadata schema + composer strategy that does not overwrite remote authority fields
- **Research pass**: inventory relevant offline Steam files (`cloud-storage-namespace-1.json`, `localconfig.vdf`, `sharedconfig.vdf`, app manifests, related metadata) and document their locations on Windows/macOS/Linux
- **AppID discovery pass**: identify and validate candidate local sources for game-list appids, measure completeness, and document data quality conditions
- **Identity-from-disk pass**: read `config/loginusers.vdf` (SteamID64 → `PersonaName` / `AccountName` / `MostRecent`) to supply user identity — display name + steamid — with no network. Desktop-app-gated (`loginusers.vdf` lives in the Steam root under the `Program Files` sandbox block). Groundwork for [Friends](friend-stream-projection.md), not required by it. Tracked as a desktop capability in [`desktop-app.md`](desktop-app.md).
- **Feasibility check**: determine what browser APIs can read these files in the current app architecture, and what UX/security constraints come with each approach
- **User categories extraction**: treat VDF parsing as closed for modern Steam collections; collections come from the cloud sync JSON unless new evidence appears
- **Other data audit**: document what additional offline fields look promising (play sessions, install metadata, cloud sync state, UI state, etc.) for future consideration
- **Sort integration**: wire user categories into GameSorter as a first-class sort/filter dimension
- **UI affordance**: expose "sort by my categories" in the sort panel

## Notes / Open Questions

### Desktop-App Follow-Up Probe (Named Data, Same Machine)

- Re-walks the same install from the desktop app's angle (unrestricted Tauri filesystem access,
  not the browser File System Access API's `Program Files` block). Confirms user categories
  with real named data ("Ze Done", "Meh"), confirms identity + local playtime/last-played,
  and surfaces an achievement cache (`appcache/librarycache/<appid>.json`) not previously
  catalogued.
- **Headline result**: `appcache/appinfo.vdf` (`common.store_tags`, top ~20 ranked tag IDs per
  app) cross-referenced against `appcache/localization.vdf` (a 9.5 KB plain-text tag-name
  table, all ~590 Steam tags) is **Valve's own first-party community-tag system, offline, zero
  rate limit** — the same tag vocabulary SteamSpy scrapes, verified byte-exact and
  name-correct on 4 sample appids. This is the strongest candidate yet for the "local mining
  might sidestep SteamSpy entirely" resumption trigger at the top of this doc. `genres`/
  `category`/`developer`/`publisher` are also present in the same file but are redundant with
  `appdetails` (already solved elsewhere) — only the tag data is genuinely new leverage.
- Also corrects an assumption: **no VDF/KeyValues parser exists yet in this codebase** — the
  props-work "VDF tools" (`desktop/source-extract/scripts/vpk.py`) parse VPK (Source engine
  asset archives), an unrelated format. A dependency-free (Rust) reader still needs to be
  written; the binary appinfo format is now de-risked via a byte-exact research decode.
- Also (re-)confirms the "showcases" naming collision: the `showcases.*` keys in
  `cloud-storage-namespace-1.json` are Steam client Library-panel UI state, not the public
  profile showcase widget the user's own profile displays — that one was not found locally.
- Full writeup: `docs/research/local-steam/desktop-offline-data-mining-findings.md`.
- Implementation plan for wiring this into the Tauri app's startup flow:
  `docs/plans/desktop-local-data-pipeline-plan.md`.

### Latest Single-Machine Probe (Anonymized)

- Coverage and bucket findings are documented in `docs/research/local-steam/local-steam-buckets-findings.md`.
- Raw generated artifacts for this probe are in `docs/research/local-steam/local-steam-coverage-local-steam-spitemonger.{log,json,md}`.
- Deep sample extraction artifacts for API comparison are in `docs/research/local-steam/local-steam-app-signal-samples-local-steam-spitemonger.{json,md}`.
- Sharedconfig deep check artifacts are in `docs/research/local-steam/local-steam-coverage-sharedconfig-check.{json,md}` and `docs/research/local-steam/local-steam-app-signal-samples-sharedconfig-check.{json,md}`.
- This is currently a single-machine result set; multi-machine validation is still pending before any broad assumptions are made.

- The File System Access API still looks like the best browser-native path when available, but a plain file picker fallback is acceptable for the first implementation.
- VDF parsing is still useful for the broader offline-data audit, but not for user collections on modern Steam.
- Collections should be treated as additive labels over existing games, not as a replacement game list.
- Local appid extraction is valuable even if incomplete, as long as we can report confidence/coverage clearly.
- This investigation also ties into the SteamSpy tags pipeline (active in a separate branch) — user categories and SteamSpy tags are complementary data sources for the sort north star.
- Cross-platform paths differ significantly: Windows uses `%LOCALAPPDATA%/Steam/userdata/`, macOS uses `~/Library/Application Support/Steam/userdata/`, Linux uses `~/.local/share/Steam/userdata/`. Discovery needs to handle all three (or ask the user).
- Related plan docs: `docs/plans/steam-user-categories-feasibility.md`, `docs/plans/steam-user-categories-filesystem-plan.md`.
- `steam-user-categories-feasibility.md`: VDF/local-file approach confirmed non-viable for modern Steam; user collections now stored in Steam Cloud, not local VDF. The `cloud-storage-namespace-1.json` file in the Steam cloud sync folder is the viable source.
- `steam-user-categories-filesystem-plan.md`: Concrete plan for reading `cloud-storage-namespace-1.json` via File System Access API (`showOpenFilePicker`); parsing is straightforward JSON (no VDF needed).
- Current implementation branch: `openclaw/feat-local-collections-import` (implementation intentionally paused).
