# Steam Featured Games And Profile Sections Research

Date: 2026-05-10

## Scope

This research answers:

1. Can we retrieve "featured games" from a Steam profile (Game Collector showcase)?
2. What other profile sections are realistically retrievable along that same path?
3. Which paths are official API vs HTML parsing vs authenticated/private?

## Executive Summary

1. There is no documented public Steam Web API endpoint specifically for profile showcase slots (including Game Collector featured picks).
2. Public profile HTML contains showcase sections and is parseable, so featured games are likely only available through profile-page parsing unless we wire authenticated profile edit APIs (not documented/supported for third-party use).
3. Public profile XML (`?xml=1`) exposes useful profile data (identity, most played games, groups), but does not expose showcase slot configuration.

## Feasibility Status (Current)

1. **Official public API for Game Collector featured slots:** infeasible (not found).
2. **Public profile parse for featured/highlight sections:** feasible, but brittle.
3. **Private profile showcase retrieval without user-auth session:** infeasible.
4. **Stable long-term integration without parser maintenance:** infeasible.

## What We Verified

### A. Public Profile XML (machine-readable, no login)

Endpoint pattern:

`https://steamcommunity.com/profiles/{steamid64}/?xml=1`

Verified output includes:

1. Core profile fields: `steamID64`, `steamID`, privacy/visibility, avatar URLs, custom URL, location, summary.
2. `mostPlayedGames` with game links and logos/icons.
3. Group membership blocks.

Important gap:

1. No explicit showcase configuration payload (no Game Collector slot list).

### B. Public Profile HTML (parseable, no login for public profiles)

Endpoint pattern:

`https://steamcommunity.com/id/{customUrl}/` or `https://steamcommunity.com/profiles/{steamid64}/`

Verified HTML signals:

1. `profile_customization` containers
2. `profile_customization_header` labels (example: Favorite Game, Badge Collector, Achievement Showcase)
3. Showcase slot markup using `showcase_slot`

Implication:

1. Game Collector showcase, if present, should be extractable from this customization markup.
2. This is parse/scrape territory, not a stable API contract.

### C. Official Steam Web API (documented)

Useful endpoints around profile/game context:

1. `IPlayerService/GetOwnedGames/v1`
2. `IPlayerService/GetRecentlyPlayedGames/v1`
3. `ISteamUser/GetPlayerSummaries/v2`
4. `ISteamUser/ResolveVanityURL/v1`

None of these return profile showcase slot configuration.

## External Evidence From Forums/Community (Non-Authoritative)

These are not official guarantees, but they align with what we observed in docs and live responses.

1. Multiple Steam Community and Reddit threads discuss editing/using showcases from profile UI, not retrieving showcase slot data from API.
2. Repeated community pattern for missing media fields in player APIs is to use Store `appdetails` or direct store/CDN image paths instead.
3. Community questions about screenshot/profile-showcase retrieval frequently fall back to page parsing or manual profile workflows rather than a dedicated showcase endpoint.

Interpretation:

1. Community behavior is consistent with "no first-class showcase retrieval API" and "HTML-driven extraction for profile customization views".

## "Featured Games" (Game Collector) Feasibility

### Likely Sources

1. Profile HTML showcase markup (public profile only).
2. Potential internal/edit endpoints used by Steam web client when user edits profile (requires authenticated session and is not a public integration surface).

### What Is Infeasible So Far

1. Calling a public endpoint to directly return Game Collector slot appids (not found).
2. Reliably getting featured slots for non-public profiles without account-auth flow.
3. Treating showcase parsing as stable contract without drift handling.

### Recommended Reliability Tiering

1. Tier 1 (recommended now): parse public profile HTML when available.
2. Tier 2 (future, higher complexity): authenticated session automation for owner profile only, if product direction requires private showcase data.

### Risk Notes

1. HTML structure can change without notice.
2. Private/friends-only profiles can block data.
3. CORS and anti-bot behavior may require server-side fetching/proxy.

## Other Profile Sections Reachable Along The Same Path

Public profile HTML and/or XML can provide at least partial access to:

1. Favorite Game showcase
2. Badge Collector section
3. Achievement showcases (normal/rarest)
4. Recent/most played game sections
5. Groups summary
6. Basic profile presentation data (avatars, headline, summary, location)

Potentially reachable through additional community pages:

1. User screenshots page
2. User artwork page
3. User videos page
4. Workshop item pages

## Practical Integration Plan

### Pass 1: API-first + minimal profile parse

1. Continue using Web API for owned/recently played games.
2. Add a server-side profile fetcher that reads public profile HTML.
3. Parse only section headers and known showcase blocks; do not overfit selectors.
4. Return normalized `profileSections[]` and optional `featuredGames[]`.

### Pass 2: Harden parsing and failure handling

1. Add parser versioning and selector fallback list.
2. Add per-profile parse diagnostics (`missing_section`, `private_profile`, `selector_drift`).
3. Add snapshot tests from representative sample HTML fixtures.

### Pass 3: Optional owner-auth path

1. Evaluate authenticated data pull for user-owned profile edits only.
2. Keep this optional and separate from public-profile pipeline.

## Suggested Normalized Schema

```json
{
  "steamId64": "string",
  "profileSections": [
    {
      "type": "favorite_game|game_collector|badge_collector|achievement|other",
      "title": "string",
      "items": [
        {
          "appid": 0,
          "name": "string",
          "url": "string",
          "image": "string"
        }
      ]
    }
  ]
}
```

## Sources

1. Steamworks Web API docs (`IPlayerService`, `ISteamUser`)
2. Verified public profile XML behavior (`?xml=1`)
3. Verified public profile HTML showcase/customization markup on public profile pages

## Roadmap Linkage

1. Act 2 roadmap: `docs/acts/act2-ready-for-friends.md`
2. Planned feature: `docs/features/user-screenshot-wall.md`
