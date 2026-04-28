# Feature: Local File Investigation

**Act**: 2 (Best Effort — invest to try, not required to complete)
**Status**: Paused (research complete for now; implementation deferred to AC4.4)
**Priority**: Medium

> **Ways of working note**: The VDF-first hypothesis is no longer current. Modern Steam collections are not stored in `localconfig.vdf` / `sharedconfig.vdf`; the viable source is the local Steam cloud sync file `cloud-storage-namespace-1.json`. We are pausing this feature and deferring any filesystem API implementation until AC4.4.

## Decision (Act 2 Tie-Off)

- We are stopping local-files implementation work in Act 2.
- The only high-value unique field confirmed is user collections/categories from `cloud-storage-namespace-1.json`.
- Additional local signals (install presence, local playtime/last-played, limited cloud/controller state) are useful but do not justify introducing filesystem API complexity right now.
- Re-entry target: AC4.4 (see `docs/acts/act4-encore-someday-maybe.md`).

## Goal

Investigate what can be read from Steam's local installation files on the user's machine — with user categories as the primary motivator, but a broader interest in what else is available there.

Current priority framing:
- Primary value: user collections/categories as additive metadata
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
- **Feasibility check**: determine what browser APIs can read these files in the current app architecture, and what UX/security constraints come with each approach
- **User categories extraction**: treat VDF parsing as closed for modern Steam collections; collections come from the cloud sync JSON unless new evidence appears
- **Other data audit**: document what additional offline fields look promising (play sessions, install metadata, cloud sync state, UI state, etc.) for future consideration
- **Sort integration**: wire user categories into GameSorter as a first-class sort/filter dimension
- **UI affordance**: expose "sort by my categories" in the sort panel

## Notes / Open Questions

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
