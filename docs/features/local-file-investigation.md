# Feature: Local File Investigation

**Act**: 2 (Best Effort — invest to try, not required to complete)
**Status**: Not Started (research done; implementation is the experiment)
**Priority**: Medium

> **Ways of working note**: We've done enough research to have a concrete first thing to try (read `localconfig.vdf` / `sharedconfig.vdf` via File System Access API). The goal is to wire it up, see how smooth it can be made, and report back. We won't hang up on completion if the UX friction is too high.

## Goal

Investigate what can be read from Steam's local installation files on the user's machine — with user categories as the primary motivator, but a broader interest in what else is available there.

## Context

Steam stores a surprising amount of data locally that is never exposed through the web API. The most immediately useful piece is **user-defined game categories** — the organizational buckets a user has manually assigned to their library over time. These are only available in the local filesystem; there is no API equivalent.

This matters for the GameSort pipeline: user categories are the most personally meaningful sort dimension we could offer, and they can't be synthesized from SteamSpy tags or genre metadata. Getting them unlocks a genuinely personalized sort experience.

Beyond categories, the local files likely contain other data worth knowing about — play sessions, install state, custom metadata, configuration. This investigation is scoped to exploration first, implementation second.

This is a non-tentpole feature for Act 2: we want to make a real attempt at it, but it won't block Act 2 completion.

## Acceptance Criteria

- Documented understanding of which local Steam files are relevant and where they live (cross-platform)
- User categories successfully read and surfaced to the application
- Integration with the GameSort pipeline (user categories available as a sort/filter dimension)
- Graceful fallback when local files are unavailable (no Steam install, wrong path, permission denied)
- No assumptions about file path — user must be able to configure or the app must discover it

## Stories / Tasks

- **Research pass**: identify relevant Steam local files (`localconfig.vdf`, `sharedconfig.vdf`, etc.), document their locations on Windows/macOS/Linux, understand the VDF format
- **Feasibility check**: determine what browser APIs (File System Access API, or Electron/Tauri path) can read local files — and whether this is viable in a WebXR context at all
- **User categories extraction**: parse VDF to extract category → appid mapping
- **Other data audit**: document other interesting fields found during research (play sessions, install metadata, etc.) for future consideration
- **Sort integration**: wire user categories into GameSorter as a first-class sort/filter dimension
- **UI affordance**: expose "sort by my categories" in the sort panel

## Notes / Open Questions

- The File System Access API requires explicit user permission per directory — this is probably the right approach for a browser-based app; worth confirming UX implications.
- VDF is a Valve-specific format; a lightweight parser will be needed (existing npm options exist, or write a minimal one).
- This investigation also ties into the SteamSpy tags pipeline (active in a separate branch) — user categories and SteamSpy tags are complementary data sources for the sort north star.
- Cross-platform paths differ significantly: Windows uses `%LOCALAPPDATA%/Steam/userdata/`, macOS uses `~/Library/Application Support/Steam/userdata/`, Linux uses `~/.local/share/Steam/userdata/`. Discovery needs to handle all three (or ask the user).
- Related plan docs: `docs/plans/steam-user-categories-feasibility.md`, `docs/plans/steam-user-categories-filesystem-plan.md`.
- `steam-user-categories-feasibility.md`: VDF/local-file approach confirmed non-viable for modern Steam; user collections now stored in Steam Cloud, not local VDF. The `cloud-storage-namespace-1.json` file in the Steam cloud sync folder is the viable source.
- `steam-user-categories-filesystem-plan.md`: Concrete plan for reading `cloud-storage-namespace-1.json` via File System Access API (`showOpenFilePicker`); parsing is straightforward JSON (no VDF needed).
