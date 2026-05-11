# Feature: User Screenshot Wall

**Act**: 2 (Best Effort — planned early in Act 2)
**Status**: Planned
**Priority**: Medium

## Goal

Pull a player's Steam screenshots for selected games and display them in-store as a personalized media lane/wall, with store screenshots as the fallback baseline.

## Context

This feature is a direct response to playtest feedback around making the store feel less sterile and more lived-in. Player screenshots are higher-signal personal media than generic store assets.

Current research indicates:

1. No direct official list endpoint was found for "all user screenshots for app X".
2. Practical path is HTML discovery of `publishedfileid` values plus metadata resolution via `ISteamRemoteStorage/GetPublishedFileDetails`.
3. This is feasible but parser-fragile and should be isolated behind a server-side adapter.

## Acceptance Criteria

- User screenshot media can be requested for a selected game/appid
- In-store UI renders a "Your Screenshots" lane when media exists
- Graceful fallback to store screenshots when user screenshots are unavailable
- No app-managed blob cache is introduced for screenshots (URL-based rendering + browser HTTP cache only)
- Failure states are explicit (`private_profile`, `no_screenshots`, `parser_drift`, `fetch_error`)

## Stories / Tasks

- **Discovery adapter**: server-side fetcher for user screenshot pages (`/screenshots/?appid=...`) that extracts `publishedfileid`
- **Metadata resolution**: resolve IDs via `GetPublishedFileDetails`
- **Normalization layer**: shape into a stable `media[]` contract (`source=user`)
- **UI integration**: add screenshot lane to game detail/store surface with source attribution
- **Fallback path**: auto-switch to store media when user media is missing/blocked
- **Diagnostics**: log parse failures with selector/version tags

## Sequencing

Target this as an **early Act 2** spike after Gate 1 basics are stable enough for friend testing.

Suggested order:

1. Minimal adapter + one-game happy path
2. UI lane in desktop mode
3. Failure handling and telemetry
4. VR layout pass later with Game Detail Screen work

## Notes / Open Questions

- Profiles with private/friends-only visibility may not expose screenshots.
- HTML selector drift is expected; parser maintenance is part of ownership.
- Community/friend screenshot feeds are possible follow-up, but this feature starts with the active user.
- Keep auth-sensitive logic separate from public-profile parsing.

## Related Docs

- Act linkage: `docs/acts/act2-ready-for-friends.md`
- Research: `docs/research/steam-visual-metadata-pipeline-research.md`
- Research: `docs/research/steam-featured-games-and-profile-sections-research.md`
- Adjacent feature: `docs/features/game-detail-screen.md`
