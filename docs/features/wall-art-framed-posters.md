# Feature: Wall Art & Framed Posters

**Act**: 2 (Best Effort) for **desktop-local** Source 1 and Source 2 (official art) — both ship
without new web infrastructure. **Web-facilitated** Source 1 (the HTML-scrape/Lambda path) and
Source 3 (points-shop cosmetics) are **deliberately deferred to early Act 3** — see Sequencing
Decision below.
**Status**: Research complete for all three sources. Source 1 (local screenshots) is **fully built
and committed**: Rust file-reading layer (`9a5813e3`), and the client-side frame/placement pipeline
(`b3d4e088`) — `WallPosterPlacer` hangs framed posters across the back, left, and right walls (the
front is the glass storefront). See "Implementation status" below. Source 2 (official store art)
and Source 3/web-facilitated work are unstarted; Source 2's content-selection requirement is now
documented (see "Source 2 — Selection Criteria" below) even though it isn't built yet.
**Priority**: Medium

## Sequencing Decision (2026-07-14)

Web-facilitated screenshot pulling (the scrape + `GetPublishedFileDetails` Lambda adapter) is put off
until **early Act 3**, timed to land before Act 3's broader public-sharing work — not Act 2. Rationale:

- Desktop-local extraction is comparatively far cheaper and higher-fidelity (confirmed this session:
  zero new parsing infrastructure, full-resolution images, no scrape fragility, no rate limits) versus
  the web path (new Lambda route, HTML selector maintenance, community rate limits, thumbnail-quality
  images only).
- General project direction as of this pass: **lean into desktop-app features to fill out the store**
  (screenshots and beyond), and **only extend the web/browser build for features flagged critical**.
  This isn't unique to wall art — it's a standing priority call for how this project splits effort
  between the two builds going forward.
- Desktop-local extraction for this feature is proceeding **right now, in a separate session** — not
  duplicated here. Official store/marketing art (Source 2) already ships through existing
  infrastructure (the box-art pipeline's `appdetails` fetch) and needs no new web-facilitation work
  either, so it's unaffected by this deferral and can proceed in Act 2 on either build.

> This is the **wall-mounted, framed-picture** sibling of
> [Scene Clutter & Props (harvested)](scene-clutter-and-props.md)'s **Tier A**, which already covers
> *standees/cutouts/marquee* built from Steam art. That doc owns the tiered strategy, the legal
> matrix, and the "no one source gives us everything" framing — this doc doesn't re-litigate any of
> that. It narrows to one content shape (a framed poster hanging on a wall) and evaluates the three
> content *sources* the user wants to draw from for it. Graduated from the Act 4 Encore one-liner
> "Poster walls from user media."

## Implementation status (2026-07-23)

**Committed (`9a5813e3`)** — the Rust file-reading layer, tested against this machine's real
screenshots, no client dependency:

- `desktop/tauri-app/src/steam/screenshots.rs` — two Tauri commands:
  - `read_local_screenshots` — parses the per-account `userdata/<id>/760/screenshots.vdf` index
    (text KeyValues, reuses the existing `keyvalues.rs` parser — no new parsing infrastructure).
    Returns `{ appid, filename, width, height, creation, caption }` per screenshot.
  - `read_local_screenshot_bytes(filename)` — reads the actual JPEG bytes given a `filename` from
    the above. Rejects any filename containing `..` (defensive, since the argument crosses the
    JS/Rust boundary). First version joined `filename` onto `760/` directly; a real-machine test
    caught that it's actually relative to `760/remote/` (`screenshots.vdf` lives one level above
    the tree its own paths are relative to) — fixed, re-verified: `434021` bytes read, matching
    the real file's size exactly.
  - Both registered in `lib.rs`; module declared in `steam/mod.rs`.
  - Unit-tested against a realistic fixture (grouping, dimensions, caption, the `shortcutnames`
    sibling block, path-traversal rejection) plus one `#[ignore]`d real-machine test.

**Committed (`b3d4e088`)** — the client-side frame/placement pipeline, self-contained per
[Wall Poster Placement Plan](../plans/wall-poster-placement-plan.md) (the placement-anchor
question below was resolved as "build per-prop-type placers, not a shared system yet" — see
[Placement Commonality — Deferred Survey](../plans/placement-anchor-system-plan.md)):

- `client/src/steam/LocalScreenshotReader.ts` — thin wrapper around the two Tauri commands.
- `client/src/scene/props/wall-art/PosterTexture.ts` — resizes raw bytes into a
  `THREE.CanvasTexture` capped at 1024px on the longer edge (`POSTER_MAX_DIMENSION`), never upscales.
  Plain per-frame texture, deliberately not the `DataArrayTexture`/LOD atlas machinery (see
  "Framing & Rendering" below).
- `client/src/scene/props/wall-art/PosterFrameBuilder.ts` — four-box molding + mat board +
  contain-fit image plane. Outer frame width is fixed (2.7m, the spacing pitch unit); outer height
  is picked from a small aspect-ratio preset set (`widescreen` 16:10, `standard` 4:3) nearest the
  image's real aspect, with a proportional (not flat) border, so the aperture always matches the
  outer footprint's aspect — real local screenshots (all 16:10) fill the frame with zero
  letterboxing. "Glass front" is faked via low material roughness on the image plane, not a
  second surface. Molding color is `BlockbusterColors.steamLibraryAccent` (`0x003087`), shared
  with `SceneSignManager`'s Steam-library block-letter sign so the two can't drift apart.
- `client/src/scene/props/wall-art/WallPosterLayout.ts` — pure slot math: 3-poster-width gaps
  (pitch = 4x frame width = 10.8m), centered per wall, corner margin one frame-width deep.
- `client/src/scene/props/wall-art/WallTargets.ts` — per-wall geometry mapping (back/left/right;
  the front is the glass storefront, never a poster surface) — which room dimension each wall's
  slots run along, rotation to face into the room (matches `RoomManager`'s own wall rotations),
  and room-local position math. Walls fill in back → left → right order, so with fewer screenshots
  than total capacity the entrance-facing back wall fills first.
- `client/src/scene/props/wall-art/WallPosterPlacer.ts` — the singleton placer, wired into
  `DefaultBootstrapPath` alongside `UserPropPlacer`. Selects one poster per distinct game
  (earliest screenshot, deterministic order), builds a frame per selection, and positions each by
  a **consistent floor-to-bottom clearance** (`POSTER_BOTTOM_CLEARANCE_METERS`, currently 1.1m) —
  not a shared center height — so frames of different preset heights still hang with level
  bottoms. All placement/size constants are named and isolated for later tuning; none have been
  validated beyond a first real-machine look.
- The old `LocalScreenshotPosterInspector.ts` debug tool was removed — superseded by the real
  placer.

Revision history on these numbers: initial cut used a smaller frame (0.9m) and a fixed single
aperture aspect, which produced visible letterboxing since real captures are 16:10, not the
aperture's ~4:3. Revised to the preset system above, and separately sized up 3x and reduced the
gap rule from 4 to 3 frame-widths, per direct feedback after viewing it running. See
[Wall Poster Placement Plan](../plans/wall-poster-placement-plan.md) for the full before/after.

## Goal

Add framed wall posters as store decor — the video-rental-store "wall of movie posters" beat —
sourced from three places, roughly in order of how settled the research is:

1. **User screenshots** — already researched (see [User Screenshot Wall](user-screenshot-wall.md)).
2. **Official store/marketing art** — confirmed viable and already partly in use for box art.
3. **Points-shop cosmetics (profile backgrounds, badges)** — unresearched until this pass; more open
   than the other two.

## Source 1 — User Screenshots

No new research needed — this rides on [User Screenshot Wall](user-screenshot-wall.md)'s existing
plan almost unchanged: HTML-discover `publishedfileid` → resolve via
`ISteamRemoteStorage/GetPublishedFileDetails`, parser-fragile, server-side adapter, URL-based
rendering (no app-managed blob cache). A framed poster is just a second *consumer* of that feature's
`media[]` contract (`source=user`), rendered on a wall instead of in an in-store lane.

**New this pass** — a better path exists for desktop users. The Tauri app already resolves the active
user's `userdata/<accountid>` directory
(`desktop/tauri-app/src/steam/paths.rs:181` `find_active_userdata_dir`, `:210` `active_userdata_dir`),
which is exactly the parent of `userdata/<accountid>/760/remote/<appid>/screenshots/*.jpg` —
the local screenshot folder that `scene-clutter-and-props.md` flagged as blocked from the *browser*
by Chromium's Program-Files directory-picker blocklist. The desktop app doesn't read screenshots yet
(confirmed: no `screenshot` references anywhere under `desktop/tauri-app/src/steam/`), but the path
resolution it needs is already built for other purposes. Once wired up, this gives full-resolution
local screenshots with no HTML scraping, no parser drift, and no community rate limits — strictly
better than the browser path, for desktop users only.

**Confirmed this pass, on a real machine (2026-07-14)** — the prediction above checked out. Verified
against this dev machine's actual Steam install (`C:\Program Files (x86)\Steam\userdata\24323802\760\`),
local-file access only, no API calls:

- **5 real screenshots across 4 games**, all still on disk at the predicted path layout:
  `remote/<appid>/screenshots/<timestamp>_1.jpg` + a `thumbnails/` sibling folder per app. Appids
  1235140, 1869290, 2218750 (2 screenshots), 2238040 — resolved to names for free via the existing
  baked `appdetails` bundle (`client/public/steam-cache/app-details.json.gz`, same technique used
  for local genre/category id resolution elsewhere in this pipeline — no network call needed):
  *Yakuza: Like a Dragon*, *Supraworld*, *Halls of Torment*, *Tiny Terry's Turbo Trip*. Resolutions
  are full desktop-capture quality (2560×1600 on 4 of the 5; one 1280×800) — not the
  community-scraped thumbnail quality the browser/HTML path would get.
- **A per-account metadata index exists and is trivial to parse**: `userdata/<accountid>/760/screenshots.vdf`,
  one level up from the per-app folders, in **plain-text KeyValues** — the exact format
  `desktop/tauri-app/src/steam/keyvalues.rs` already parses for `loginusers.vdf`/`libraryfolders.vdf`/etc.
  **No new parser is needed for this feature at all**, text or binary. Confirmed fields per screenshot
  entry: `filename`, `thumbnail`, `width`/`height`, `gameid`, `creation` (unix timestamp),
  `Permissions` (integer, decoded — see below), and two optional fields worth knowing about: `caption`
  (free text the user typed, present on one of the five) and `publishedfileid` (present only on the
  one screenshot that was actually published to Steam Community — most local screenshots are
  private-only and lack this field entirely).
  A `timelineid`/`timelinetime` pair also appears on newer entries, tied to Steam's gameplay-timeline
  feature — not needed for posters, noted for completeness.
- **Gotcha caught by a real-machine test, worth flagging explicitly**: `filename` (e.g.
  `"1235140/screenshots/20240627104622_1.jpg"`) is relative to `userdata/<accountid>/760/remote/`,
  **not** to `760/` directly — even though `screenshots.vdf` itself lives at `760/screenshots.vdf`,
  one level *above* `remote/`. Joining `filename` onto `760/` directly (the natural first guess,
  since that's where the index file lives) silently resolves to a path one directory too shallow
  and fails to read. First implementation attempt got this wrong; a real-machine
  `#[ignore]`'d test (not just the fixture tests) caught it immediately, which is exactly why that
  category of test exists.
- **`Permissions` decoded**: it's Valve's `EUCMFilePrivacyState` bitmask (SteamKit's
  `Resources/SteamLanguage/enums.steamd`, unofficial but a direct decompiled/reverse-engineered
  source, not a guess): `Private = 2`, `FriendsOnly = 4`, `Public = 8`, `Unlisted = 16`
  (`Invalid = -1`, `All = 30`). Cross-checked against this machine's own 5 entries and it holds
  exactly: the one screenshot with `Permissions = 8` is the *only* one that also has a
  `publishedfileid` (i.e. actually published to Steam Community — genuinely `Public`); all four
  `Permissions = 2` entries have no `publishedfileid` at all (never published — genuinely
  `Private`). Two independent signals agreeing is good confirmation for an unofficial source.
  Practically irrelevant to this feature either way (showing a user their own screenshots back to
  themselves isn't republishing), but worth knowing `Permissions` is a legitimate future filter if
  a "don't surface private screenshots as posters" toggle ever matters — it's a real bitmask, not
  a private/undocumented one-off.
- **Net effect**: this source is now de-risked from "predicted to work" to "built and verified on a
  real machine." `desktop/tauri-app/src/steam/screenshots.rs` (new) exposes two Tauri commands —
  `read_local_screenshots` (parses `screenshots.vdf`) and `read_local_screenshot_bytes` (reads the
  actual JPEG bytes, joining `filename` onto `760/remote/` per the gotcha above) — both verified
  against this machine's real 5 screenshots. Client side, `LocalScreenshotReader.ts` wraps those
  commands, `PosterTexture.ts` resizes the bytes into a `THREE.CanvasTexture` capped at 1024px on
  the longer edge (~8x box art's pixel count, ~84% smaller than a native 2560×1600 capture — see
  that file for the reasoning), and `LocalScreenshotPosterInspector.ts` (debug tool,
  `window.testLocalScreenshotPoster()`) drops one onto a plain plane in front of the camera to
  visually confirm the pipeline. No frame/border craft, no placement-anchor integration yet — this
  is deliberately just the byte-to-GPU-texture path proven end to end, per the "What We Can
  Implement Now" sequencing above.

**Web/remote path also re-verified live (2026-07-14), independent of the local-file check above** —
this is what would cover browser-only users (no desktop app) and anyone the local machine doesn't
belong to. **Confirmed feasible, but deliberately not being built yet** — see Sequencing Decision
above; this section documents what's proven so the eventual early-Act-3 build has no research left to
do, only implementation. Full details in `docs/research/steam-visual-metadata-pipeline-research.md`;
summary:

- `GET steamcommunity.com/profiles/{steamid64}/screenshots/?appid={appid}` returns, in the initial
  static HTML (no JS execution needed), a `data-publishedfileid` + `data-appid` pair per screenshot
  **and** an inline `background-image: url(...)` preview CDN link on the same element — so a minimal
  adapter can skip the resolution API call entirely and just regex/parse that attribute pair plus the
  inline URL for a "cheap as possible" first pass.
- `POST ISteamRemoteStorage/GetPublishedFileDetails/v1/` resolves a `publishedfileid` to a full-res
  `file_url` when preview quality isn't enough — confirmed against a screenshot from 2026-07-11 (not a
  stale fixture).
- Both calls are plain unauthenticated HTTP — no API key, no session cookie, no CORS-relevant browser
  restriction (this needs to run server-side/Lambda anyway, since Steam Community doesn't send
  permissive CORS headers).
- Tested against a real public profile+game (not the dev's own `spitemonger` account, whose
  screenshots page is empty — consistent with the local-file check finding only 1 of 5 local shots
  was ever actually published/public; the `Permissions` bitmask decoded above explains exactly why).

**Net effect**: the web path is confirmed live today for any public profile, same as the desktop-local
path is confirmed for this machine. Recommended default: **prefer the local-file read when running
inside the desktop app** (higher fidelity, no scrape fragility); **fall back to the web scrape** for
browser-only sessions or viewing someone else's public screenshots. Same `media[]` output shape either
way, so callers don't need to know which path served a given poster.

## Source 2 — Official Store / Marketing Art

**Confirmed viable and live today.** Tested directly against `store.steampowered.com/api/appdetails`
during this session (Portal 2, appid 620) despite the Steam connectivity blips reported earlier this
week — the store API itself responded normally. Confirmed fields:

- `screenshots[]` — `id`, `path_thumbnail`, `path_full` — the store page's official screenshot gallery
- `background_raw` — the store page's hero background art (higher production value than a raw
  screenshot on many pages)
- `movies[].thumbnail` — trailer frame thumbnails (better suited to
  [Fabricated Set Dressing](fabricated-set-dressing.md)'s "coming attractions" board than a poster)

This is the **same legal tier already cleared** in `scene-clutter-and-props.md`'s legal matrix
(official Steam store art, display-in-context use — the same posture that already covers our box art).
No separate press-kit/marketing API was found beyond the store page's own assets; that's the practical
ceiling here absent per-game manual curation. `library_hero`/`header`/capsule are already resolved by
the existing box pipeline, so `screenshots[]` and `background_raw` are the only genuinely new fields
this source adds.

### Source 2 — Selection Criteria (2026-07-23, documented, not yet built)

Source 2 posters should come from **"highlight" games**, not an arbitrary slice of the owned-games
list — the request is to surface what the player would actually want to see called out: recently
purchased, "play next" suggestions, or recently played, **in that preference order**, using
whichever signal is actually available (fall through to the next when a signal can't be sourced).
Feasibility per signal, grounded in this project's existing research rather than assumed:

1. **Recently purchased** — **unresearched, likely infeasible.** No known public Steam Web API
   exposes a purchase/acquisition timestamp: `IPlayerService/GetOwnedGames` returns playtime and
   art fields but no purchase date, and no dedicated purchase-history endpoint is documented
   anywhere in this project's Steam API research (`docs/research/steam-api-research.md`). Would
   need a real feasibility pass (parsing `licenses`/package data isn't confirmed either) before
   assuming this is buildable — don't build toward it without that check first.
2. **"Play Next" / Discovery queue** — **confirmed infeasible via public API.** Already researched
   and documented twice: [Fabricated Set Dressing](fabricated-set-dressing.md) ("Discovery queue
   / Play Next — *not* exposed by the public API; session/library features. Likely
   **desktop-app-only** or omitted") and [Native Desktop App](desktop-app.md)'s feature-gap table.
   Nothing new to check here; treat as unavailable unless a desktop-side local read is found later.
3. **Recently played** — **confirmed feasible.** `IPlayerService/GetRecentlyPlayedGames/v1` is a
   documented public endpoint, already relied on elsewhere in this project's research
   (`docs/research/steam-api-research.md`, `docs/research/steam-featured-games-and-profile-sections-research.md`).
   No new adapter work beyond calling it.

**Practical fallback chain given current research**: attempt recently-purchased only after a real
feasibility pass finds a source for it → else attempt play-next only if a source is ever found →
else use `GetRecentlyPlayedGames` as the working default, since it's the only signal confirmed
buildable today. This selection layer decides **which games** get a Source-2 poster; it composes
with (doesn't replace) the existing frame/placement pipeline — a selected game's `screenshots[]`/
`background_raw` still feeds `PosterFrameBuilder`/`WallPosterPlacer` the same way Source 1's
per-game selection does.

## Source 3 — Points-Shop Cosmetics (Profile Backgrounds, Badges)

**New research, and the least settled of the three.** No official public Web API exposes the points
shop catalog or a user's equipped cosmetics:

- `ISteamEconomy/GetAssetPrices` requires a **publisher key** and is scoped to a game's own in-game
  economy — not Steam's own community items, and not callable client-side regardless.
- `ISteamFriends::RequestEquippedProfileItems` is a **Steamworks client-side callback** — it only
  works from inside a Steamworks-registered game with the Steam client attached, which rules it out
  for a Lambda/web adapter entirely.

The only feasible path mirrors the screenshot-wall precedent — scrape, not call an API:

- The equipped animated/static background lives in the profile page's
  `miniprofile_nameplatecontainer` HTML, as a `<video>`/`<img>` `src` pointing at
  `steamcommunity/public/images/items/...` on Steam's CDN.
- Owned (not necessarily equipped) community items are queryable via the unofficial
  `steamcommunity.com/inventory/<steamid>/753/6` endpoint — but it's **heavily IP-rate-limited**
  without a session cookie (community guidance: ~one request per few seconds, cooldown risk on
  bursts), so this is server-side-only and low-volume, same as the screenshot discovery adapter.
- Badges have a documented endpoint, `IPlayerService/GetBadges` — but it returns badge id, appid, and
  XP, **not an icon URL**. Badge artwork would still require a profile-page scrape, so badges don't
  come out ahead of backgrounds despite having an official-looking endpoint.

**Legal/privacy note**: this is the user's own purchased/earned cosmetic property, displayed back to
them personally — the same "per-viewer, not redistributed" posture that already makes the screenshot
wall acceptable. Likely fine, but flagged explicitly since it's virtual goods rather than free store
art, echoing the Act 4 line's existing "needs rights/privacy review" caveat. Worth a quick gut-check
before building, not a blocker to researching further.

**Recommendation**: treat as a **third-priority stretch inside this feature**, built after the
scrape-based pattern from Source 1 is already proven in production — same infrastructure, same risk
class, no reason to pioneer it here first.

## Proposed Data Contract (agreed this pass)

One shape for every source/path, so rendering code never needs to know which one served a given
poster:

```ts
interface PosterImage {
  appid: number;
  source: 'user-local' | 'user-web' | 'community' | 'store';
  publishedFileId?: string;
  previewUrl: string;   // always present — embedded in scrape HTML or store JSON, zero extra call
  fullUrl?: string;     // only when resolved (GetPublishedFileDetails, or store path_full/library art)
  createdAt?: number;
}
```

Adapter placement, once each path is actually built:

- **`user-local`** (desktop, building now, separate session): a Tauri command reading
  `screenshots.vdf` + resolving `<userdata>/760/<filename>`, per the local-file findings above.
- **`user-web`** / community scrape (early Act 3): a new Lambda route (e.g.
  `GET /user-screenshots/{steamid64}/{appid}`) on the existing proxy in
  `external-tool/infrastructure/lambda-src/`, following the `handleGetOwnedGames`/
  `handleBatchAppDetails` pattern already there, plus a small client class
  (`client/src/steam/media/UserScreenshotsClient.ts`) mirroring `BatchAppDetailsClient.ts`'s shape —
  composed into `SteamApiClient`, not wired into `SteamIntegration` directly.
- **`store`**: already flows through the existing box-art `appdetails` pipeline; no new adapter needed.

## Framing & Rendering

A framed poster differs from Tier A's standees in shape, not pipeline:

- **Frame geometry**: a simple procedural border (reuse `CanvasSignRenderer`'s board-face craft per
  `fabricated-set-dressing.md`, or a plain beveled quad) rather than anything new.
- **Image plane**: posters are a bounded, small-N decorative set (dozens, not hundreds like game
  boxes) — a simple per-frame `THREE.PlaneGeometry` + texture is the right call, **not** the instanced
  `DataArrayTexture`/LOD machinery in `docs/architecture/image-texture-pipeline.md`, which was built
  for hundreds of game boxes at once. Reuse that pipeline's cache-first fetch pattern
  (`GameArtworkProvider`-style), not its instancing.
- **Placement**: hang frames on wall segments, deterministically spaced. Not waiting on a shared
  placement system — see [Placement Commonality — Deferred Survey](../plans/placement-anchor-system-plan.md)
  (2026-07-23) for why that's deferred until a second/third real placer exists to compare against.
  This feature gets its own self-contained placer instead, mirroring `UserPropPlacer`'s shape: see
  [Wall Poster Placement Plan](../plans/wall-poster-placement-plan.md) (draft, awaiting sign-off).

## What We Can Implement Now (Act 2, no new web infra)

1. ✅ **Desktop-local screenshot extraction, frame/placement — done and committed.** Real
   screenshots read from disk, framed, and hung across the back/left/right walls in the live
   scene. See "Implementation status" above for exactly what landed and where.
2. **Framed poster prop rendering store screenshots** (Source 2, official art) — reuses the same
   `PosterFrameBuilder`/`WallPosterPlacer` pipeline with a different texture source. Not yet
   started. Must apply the selection criteria below (highlight games, not arbitrary owned games)
   before picking which games' screenshots to fetch.
3. ✅ **Placement** — see [Wall Poster Placement Plan](../plans/wall-poster-placement-plan.md) —
   a self-contained placer for this feature alone, not a shared system; see
   [Placement Commonality — Deferred Survey](../plans/placement-anchor-system-plan.md) for why.
4. **Fallback behavior** — user media (desktop-local, where available) as priority, store
   screenshot/`background_raw` as fallback, so every game with a shelf slot can have a poster even
   without user content. Not yet built — depends on Source 2 (item 2).

## Deferred to Early Act 3 (deliberate, not blocked)

1. **Web-facilitated Source 1** (HTML-scrape + `GetPublishedFileDetails` Lambda adapter) — research
   complete (this doc + `steam-visual-metadata-pipeline-research.md`), implementation intentionally
   not started. This is what brings screenshot posters to browser-only users and to viewing someone
   else's public screenshots.
2. **Source 3 (points-shop cosmetics)** — same scrape-based risk class as the above; rides along on
   the same timing, after a privacy gut-check.

## Recommended Sequencing

1. ✅ Desktop-local screenshot byte-to-texture spike (done, see "Implementation status" above).
2. ✅ Wall poster placement — self-contained placer covering back/left/right walls; see
   [Wall Poster Placement Plan](../plans/wall-poster-placement-plan.md). Shared placement
   engineering across prop types is explicitly deferred — see
   [Placement Commonality — Deferred Survey](../plans/placement-anchor-system-plan.md). Parked
   here for now — next work on this feature resumes with item 3.
3. Official-art poster spike (Source 2) — reuses the same frame/placement pipeline with a
   different texture source; must apply the "Selection Criteria" section above first (recently
   purchased → play next → recently played, whichever is actually available) rather than picking
   arbitrary owned games.
4. **Early Act 3**: web-facilitated Source 1 (Lambda route + `UserScreenshotsClient`), timed ahead of
   Act 3's broader public-sharing work.
5. **Early Act 3**: points-shop cosmetics stretch, after a privacy gut-check.

## Open Questions

- Whether the shipped constants (2.7m frame width, 10.8m pitch, 1.1m floor clearance) read right
  in the real running scene for longer than a first look — see
  [Wall Poster Placement Plan](../plans/wall-poster-placement-plan.md)'s own open questions.
  Corner-miter look of the four-box frame is in the same bucket.
- **Recently-purchased feasibility** — needs an actual research pass (see "Selection Criteria"
  above) before Source 2 work assumes it's available; don't build toward it speculatively.
- Points-shop cosmetics: privacy/rights gut-check before investing in the scrape adapter.
- Is `background_raw` worth pulling as a fourth Source-2 sub-type? Likely yes — same endpoint,
  marginal cost.

## Brainstorm — Other Sources (unvetted, for discussion)

- **SteamGridDB "Posters" collection** — moved to [Act 4 Misc](../acts/act4-encore-someday-maybe.md);
  per-asset licensing isn't permissive enough for us to pull/host directly (same two-layer caveat as
  fan 3D models). "Point users at the site, let them supply their own" is the more plausible version
  of this idea, filed as nice-idea-probably-not.
- **Trading card / badge foil art** as small accent frames — `GetBadges` confirms ownership but not
  art URLs, so this is the same scrape-fragility class as profile backgrounds, not an easier win.
- **Achievement icon "trophy wall"** — smaller-format alternative to full posters; same API-thinness
  problem as badges.
- **Community/friends' screenshots**, not just the active user's — `user-screenshot-wall.md` already
  names this as a possible follow-up; same discovery mechanism, just widen to the friends list.
- **Trailer thumbnails** (`movies[].thumbnail`) as a "coming attractions" marquee — belongs to
  `fabricated-set-dressing.md`'s board, not this feature's wall posters, but is a nearly-free 4th
  store-art subtype off the same appdetails call.
- **AI-upscaled/stylized reprocessing** of low-res store screenshots into poster-grade art — Act 4
  territory, and the same "generative accelerator, original-content-only" posture from
  `scene-clutter-and-props.md`'s Source 6 would apply if this touches recognizable IP.
- **Local screenshots via the desktop app** — covered above under Source 1; noted again here because
  it's a quality delta, not just an access delta (full resolution vs. community-scraped thumbnails).

## Related Docs

- [User Screenshot Wall](user-screenshot-wall.md) — Source 1's existing plan
- [Scene Clutter & Props (harvested)](scene-clutter-and-props.md) — the Tier A parent strategy, legal
  matrix, and the placement-anchor gap this feature also depends on
- [Fabricated Set Dressing](fabricated-set-dressing.md) — frame/board-face craft reuse, coming
  attractions board (trailer thumbnails)
- [Native Desktop App](desktop-app.md) — where the local-screenshot-read upgrade to Source 1 belongs
- `docs/architecture/image-texture-pipeline.md` — texture fetch/cache pattern to reuse (not its
  instancing)
- `docs/research/steam-api-research.md`, `docs/research/steam-featured-games-and-profile-sections-research.md`
  — grounding for the Source 2 selection-criteria feasibility notes above (`GetRecentlyPlayedGames`
  confirmed; no purchase-date/showcase-slot API found)
- Act linkage: [Act 2 — Ready for Friends](../acts/act2-ready-for-friends.md) (desktop-local Source 1
  + Source 2 ship now); [Act 3 — Ready for Everyone](../acts/act3-ready-for-everyone.md) (web-facilitated
  Source 1 + Source 3, early Act 3, deliberately deferred); [Act 4 — Encore](../acts/act4-encore-someday-maybe.md)
  (graduated from here)

### External references

- [SteamGridDB](https://www.steamgriddb.com/) · [SteamGridDB Posters collection](https://www.steamgriddb.com/collection/10279/grids)
- Steamworks [ISteamEconomy](https://partner.steamgames.com/doc/webapi/ISteamEconomy) ·
  [ISteamFriends](https://partner.steamgames.com/doc/api/isteamfriends) (`RequestEquippedProfileItems`)
- [IPlayerService/GetBadges](https://partner.steamgames.com/doc/webapi/IPlayerService) (undocumented
  fields, no icon URL)
- Steam Store API: `store.steampowered.com/api/appdetails?appids=<appid>` (unofficial but stable;
  confirmed live 2026-07-13)
- [SteamKit `enums.steamd`](https://github.com/SteamRE/SteamKit/blob/master/Resources/SteamLanguage/enums.steamd) —
  `EUCMFilePrivacyState`, the source for `screenshots.vdf`'s `Permissions` bitmask decode above

---
*— A1 / P1 / O2*
