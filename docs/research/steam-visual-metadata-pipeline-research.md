# Steam Visual Metadata Pipeline Research

Date: 2026-05-10

## Scope

This document maps where to get visual metadata for a given game:

1. Store screenshots and videos
2. User screenshots
3. Friend/community screenshots and image content
4. Community content references and image URLs

## Executive Summary

1. Store visuals are the most stable source and should be the default baseline.
2. User/community screenshots are available through Steam Community pages and `publishedfileid` metadata resolution.
3. The strongest bridge for user/community media is:
   1. Discover `publishedfileid` from Community HTML.
   2. Resolve details via `ISteamRemoteStorage/GetPublishedFileDetails/v1`.
4. A mixed pipeline is best: Store-first for reliability, Community enrichment for personalization.

## Feasibility Status (Current)

1. **Store screenshots/videos for a game:** feasible and reliable.
2. **User/community screenshots via official list endpoint:** infeasible (no direct list endpoint found).
3. **User/community screenshots via HTML discovery + published file details:** feasible, medium fragility.
4. **Zero app-managed screenshot cache (use browser cache only):** feasible, but opportunistic.

## Source Matrix

## 1. Steam Store Metadata (stable baseline)

Endpoint:

`https://store.steampowered.com/api/appdetails?appids={appid}`

Useful fields verified:

1. `header_image`, `capsule_image`
2. `screenshots[]` with thumbnail/full paths
3. `movies[]` with thumbnail and stream manifests (`hls_h264`, `dash_h264`, `dash_av1`)
4. `background`, `background_raw`

Use cases:

1. Game details panel media carousel
2. Trailer playback
3. Fallback visuals when no user/community media is available

Observed cache headers (live):

1. Store image assets (`header.jpg` etc.) return long-lived cache directives (`Cache-Control: public, max-age=315360000` observed).
2. `appdetails` JSON is cacheable at shorter horizon (`Cache-Control: public,max-age=3600` observed).

## 2. User Screenshots (owner profile page)

Endpoint pattern:

`https://steamcommunity.com/profiles/{steamid64}/screenshots/?appid={appid}&browsefilter=myfiles&view=grid`

(`/id/{customUrl}/...` works identically for vanity URLs.)

**Re-verified live 2026-07-14** against a real public profile (Portal 2, appid 620) — precise element
shape, not just "signals present":

```html
<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3762514840"
   onclick="return OnScreenshotClicked( 3762514840 );"
   class="profile_media_item modalContentLink ugc"
   data-desired-aspect="1.7777777777778"
   data-appid="620" data-publishedfileid="3762514840">
  <div style="background-image: url('https://images.steamusercontent.com/ugc/.../...');"
       class="imgWallItem" id="imgWallItem_3762514840">
```

Practical implication: `data-appid` + `data-publishedfileid` + the inline `background-image` URL are
all present in the **initial static HTML** — no JS execution needed to discover them, and the preview
CDN URL is usable directly with **zero extra network call** (skip `GetPublishedFileDetails` entirely
if preview-quality is good enough; only resolve for full-res `file_url`).

Verified HTML signals (updated):

1. `data-publishedfileid="..."` and `data-appid="..."` — both on the same `<a class="profile_media_item">` element
2. Inline `background-image: url(...)` on the following `.imgWallItem` div — usable as a preview URL with no resolution call
3. `sharedfiles/filedetails/?id=...` in the same element's `href` (redundant with the data attribute, but a simpler regex target if not parsing attributes)

Pagination:

1. Page query parameter `p={n}` is present and works on user screenshot pages.

Use cases:

1. Pull this user's own screenshots for a selected game.

### Full pipeline re-verified live 2026-07-14 (no auth, no API key)

1. `GET steamcommunity.com/app/620/screenshots/` (community hub, no privacy gate) → extracted
   `sharedfiles/filedetails/?id=3762514840` via plain regex on raw HTML.
2. `POST api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/` with
   `publishedfileids[0]=3762514840` → returned `file_url`, `preview_url`, `consumer_app_id: 620`,
   `time_created: 1783776965` (2026-07-11) — a current, non-legacy screenshot, not a stale test fixture.
3. Both calls are plain unauthenticated HTTP (curl), no session cookie, no API key required for either
   step. Confirms this pipeline is live today, independent of the personal-profile-page shape above.

## 3. Community/Game Hub Content (friends and public users)

Endpoint patterns:

1. `https://steamcommunity.com/app/{appid}/screenshots/`
2. `https://steamcommunity.com/app/{appid}/homecontent/...` (AJAX-style content pagination endpoint used by the page)

Verified HTML signals:

1. `apphub_Card` entries with `data-modal-content-url`
2. `sharedfiles/filedetails/?id=...`
3. Card type labels (Screenshot, Artwork, Workshop Item, etc.)

Use cases:

1. Community screenshot feed by game
2. Artwork/video/workshop cross-content surface for "lived-in" room content

## 4. Published File Details API (key bridge)

Endpoint:

`POST https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/`

Request form example:

`itemcount=1&publishedfileids[0]=145304994`

Verified response fields include:

1. `consumer_app_id` (game appid)
2. `file_url` (full image URL)
3. `preview_url`
4. `title`, `description`
5. timestamps and visibility fields

Why this matters:

1. Once a `publishedfileid` is discovered from HTML, this endpoint gives clean metadata without brittle DOM traversal for every detail.

## Browser Cache Strategy (No App Screenshot Storage)

Goal: avoid storing screenshot/media blobs in IndexedDB/localStorage while still benefiting from previously fetched browser resources.

Recommended pattern:

1. Render remote media directly via `<img src="...">` and `<video src="...">` URLs.
2. Let browser HTTP cache manage byte storage using origin response headers.
3. Store only lightweight metadata in app state (URL, type, source, timestamps).
4. Prefer stable Steam CDN/store URLs where possible.

Important caveats:

1. Cache hit is not guaranteed even if user has visited store pages before (eviction, cache partitioning, private mode, policy changes).
2. Reuse is best-effort; design UX as if cache miss is common.
3. You should not assume cross-site cache sharing behavior stays constant across browser versions.

Practical implication:

1. Yes, loading via standard media elements can opportunistically reuse browser cache, but this should be treated as a performance bonus, not as a data source contract.

## Implementation Passes

### Pass 1: Store-first baseline

1. Use `appdetails` screenshots and movies for every game in library.
2. Do not store media blobs in app storage; rely on browser HTTP cache and URL re-use.
3. Deliver deterministic media for all games.

### Pass 2: User screenshot enrichment

1. For chosen game/appid, fetch user screenshot page HTML.
2. Extract `publishedfileid` values.
3. Resolve each via `GetPublishedFileDetails`.
4. Merge as `source=user` media entries.

### Pass 3: Community/friends enrichment

1. Pull game-hub screenshots and/or app `homecontent` pages.
2. Extract community `publishedfileid` values.
3. Resolve with `GetPublishedFileDetails`.
4. Rank by recency/popularity/safety heuristics.

## Normalized Media Contract (suggested)

```json
{
  "appid": 570,
  "media": [
    {
      "type": "screenshot|video|artwork",
      "source": "store|user|community",
      "publishedFileId": "string|null",
      "thumbnailUrl": "string",
      "fullUrl": "string",
      "streamUrl": "string|null",
      "title": "string|null",
      "description": "string|null",
      "createdAt": 0,
      "authorSteamId": "string|null"
    }
  ]
}
```

## Reliability And Policy Notes

1. Store API and CDN URLs are the most stable for production baseline.
2. Community HTML selectors can drift; keep parser logic isolated and test-driven.
3. Private/friends-only content may not be accessible without auth.
4. Use server-side fetch to avoid browser CORS and reduce client scraping complexity.
5. Browser cache reuse is opportunistic and non-deterministic; do not couple product logic to cache presence.

## What Is Infeasible So Far

1. A single official endpoint that lists a user's screenshots/artwork feed by game without HTML discovery was not found.
2. Deterministic "use existing user browser cache from prior store browsing" behavior cannot be guaranteed.

## What This Enables In Product Terms

1. Per-game media wall with trailers and screenshots.
2. Optional "Your Screenshots" lane for personal nostalgia.
3. Optional "Community Spotlight" lane to add variation/clutter.
4. Better fidelity in game detail overlays (store + personal + community layers).

## Sources

1. Store `appdetails` JSON behavior (verified with live payload)
2. Steam Community user screenshot page HTML structure (verified selectors)
3. Steam Community app hub/homecontent HTML structure (verified selectors)
4. `ISteamRemoteStorage/GetPublishedFileDetails` live request/response verification

## Roadmap Linkage

1. Act 2 roadmap: `docs/acts/act2-ready-for-friends.md`
2. Planned feature: `docs/features/user-screenshot-wall.md`
