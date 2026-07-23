# Plan: Wall Poster Placement

**Status**: Draft — awaiting sign-off before implementation
**Feature**: [Wall Art & Framed Posters](../features/wall-art-framed-posters.md)
**Not** an instance of a shared placement system — see [Placement Commonality — Deferred
Survey](placement-anchor-system-plan.md) for why that's deferred. This placer is self-contained,
mirroring `UserPropPlacer`'s existing shape for shelf-cap props: subscribes to the room events it
needs, owns its own layout math, expresses its own aesthetic preference directly.

## Goal

Get a handful of real local screenshots onto the store's back wall as framed posters: evenly
spaced, not busy, evoking the video-rental-store wall-of-posters read. First cut only — near-game
placement, other walls, and any cross-prop-type sharing are explicitly out of scope (see Non-Goals).

## Inputs already built (this session, uncommitted spike — see Disposition below)

- `client/src/steam/LocalScreenshotReader.ts` — `listScreenshots()` / `readScreenshotBytes(filename)`.
- `client/src/scene/props/wall-art/PosterTexture.ts` — `buildPosterTexture(bytes)` →
  `THREE.CanvasTexture`, capped at 1024px on the longer edge, `SRGBColorSpace`. Used as-is, no
  changes needed.

## Design decisions (this pass)

### Spacing

**Rule**: 4 poster-widths of gap between adjacent posters, where "poster width" is the frame's
*outer* width (image + molding), per instruction. So pitch (center-to-center) =
`FRAME_OUTER_WIDTH * 5`. With `FRAME_OUTER_WIDTH = 0.9m`, pitch = 4.5m — wide enough that even the
default 22m-wide room (`RoomConstants.DEFAULT_ROOM_WIDTH`) only fits a handful, which is the point.

### Frame footprint — fixed outer size, not image-aspect-driven

Screenshots are landscape (~16:10, confirmed against this machine's real captures — see the
feature doc). If frame size followed image aspect, the spacing pitch would vary per poster and the
wall would look uneven. Instead the frame's **outer** footprint is fixed regardless of image
aspect, and the image is contain-fit (letterboxed, never cropped or stretched) inside a fixed inner
aperture, matted like a real framed print:

```
FRAME_OUTER_WIDTH_METERS  = 0.9   // the pitch unit
FRAME_OUTER_HEIGHT_METERS = 0.68  // fixed outer aspect ~4:3, independent of image aspect
FRAME_BORDER_METERS       = 0.05  // molding bar width
FRAME_DEPTH_METERS        = 0.04  // molding extrusion depth
WALL_STANDOFF_METERS      = 0.02  // gap off the wall face, avoids z-fighting (same idea as
                                   // SceneSignManager's SIGN_DEPTH/2 offset for the block-letter sign)
```

Inner aperture = `(0.9 - 2*0.05) x (0.68 - 2*0.05)` = `0.8 x 0.58`. The image is scaled to fit
inside that box preserving its own aspect ratio; a dark mat-board plane (`0x161616`) fills the
aperture behind it, so any letterboxed margin reads as a mat border, not a gap to the wall.

### Frame geometry — four boxes, not an extruded profile

A picture-frame molding could be built as a `THREE.Shape` with a rectangular hole, extruded — but
that's meaningfully more geometry complexity (hole paths, UV seams at the miters) for a benefit
that doesn't matter at this size/distance. Four `THREE.BoxGeometry` bars (top/bottom/left/right)
positioned around the aperture read correctly as a frame from the front and are trivial to reason
about and test. If the boxy corner miters look wrong once it's actually in the scene, upgrading to
an extruded profile is a contained change to one file (`PosterFrameBuilder.ts`), not a redesign.

### Frame color — matches the Steam-library sign's blue

Per instruction: reuse the same theme blue as the "user library" block-letter sign
(`SceneSignManager.ts`'s `syncSteamLibraryBlockSign`, `color: 0x003087`) — not `BlockbusterColors`'
`brandBlue` (`0x0066CC`) or `categoryBlue` (`0x4169E1`), which are both different blues already in
use elsewhere. `0x003087` is currently a literal inline in `SceneSignManager.ts` with no shared
constant; this plan proposes extracting it to one exported constant (e.g. `Colors.ts`) that both
`SceneSignManager.ts` and the new frame material import, so the two blues can't silently drift
apart later. Molding material: `MeshStandardMaterial({ color: 0x003087, roughness: 0.35, metalness: 0.25 })`
— enough sheen to read as painted metal/plastic, not flat-matte.

### "Glass front" — faked via material properties, not a separate surface

Chose the fake: the image plane's own material gets low roughness (`roughness: 0.15, metalness: 0.05`)
instead of the debug spike's plain `MeshBasicMaterial`, so ambient/point lighting puts a soft
specular highlight on the poster the way glass would. No separate transparent front pane.
Reasoning: a real glass quad in front of the image adds a second material + mesh per poster, a
second draw call per poster, and a live z-fighting/near-clipping risk for a decorative, small-N
prop where the payoff is marginal. This is revisitable per-poster if the flat sheen doesn't read
well once it's actually lit in the running scene — swapping in a thin transparent quad later
touches only `PosterFrameBuilder.ts`, nothing upstream.

### Wall — back wall only, first cut

`RoomManager`'s back wall (`RoomManager.ts:310-325`) is unrotated — its front face already points
+Z into the room, matching the frame group's default (unrotated) orientation, so no rotation math
is needed for v1. Left/right walls are legitimate future poster locations (mirrors the "wall
shelves and other decorations" idea raised alongside this), but need a 90° rotation and depth
(not width) as the span — deferred as a near-trivial follow-up on the same layout function, not
tackled now.

### Content selection — one poster per game, earliest screenshot, capped to slot count

`listScreenshots()` can return multiple screenshots per `appid` (this machine has 2 for one game).
Selection: sort by `creation` ascending, dedupe keeping the **first** (earliest) screenshot per
`appid`, then take as many as there are wall slots, in that order. Keeps the "a few posters, not
busy" read even if the user has many screenshots of the same game, and gives a deterministic,
testable order (chronological, oldest capture first) rather than array order from the OS/VDF file.

### Layout — deterministic slots, centered, corner margin

```
availableWidth = wallWidth - 2 * CORNER_MARGIN_METERS   // CORNER_MARGIN_METERS = FRAME_OUTER_WIDTH_METERS
pitch          = FRAME_OUTER_WIDTH_METERS * 5
slotCount      = floor((availableWidth - FRAME_OUTER_WIDTH_METERS) / pitch) + 1   // 0 if availableWidth < frame width
slots[i]       = centered around wall-local x = 0, spaced by `pitch`
```

Pure function of `wallWidth` alone — no THREE/scene dependency, so it's unit-testable without any
mocking. If there are fewer selected screenshots than slots, the extra slots are simply left empty
(no stretching, no duplicating) — matches "get a few on the wall, build from there."

### Height

Fixed eye-level center height, `POSTER_CENTER_HEIGHT_METERS = 1.6` (matches the camera's own
default eye height set in `RoomManager.buildRoom`), same for every poster on the wall regardless of
room height.

## Non-goals (explicitly out of scope for this plan)

- **Near-game placement** ("posters near their game's shelf") — the preference the user raised as
  a longer-term want. Not attempted here; this is fixed evenly-spaced slots only. Revisit once this
  placer exists and a second data point (e.g. `UserPropPlacer`'s front-center/spread preference) is
  available to compare against, per the deferred-survey doc's revisit trigger.
- **Left/right wall posters, wall shelves, other wall decorations** — same wall-slicing approach
  should extend cleanly, but not built now.
- **Any shared placement abstraction** — see [Placement Commonality — Deferred
  Survey](placement-anchor-system-plan.md).
- **Store/official-art posters (Source 2)** — this plan is Source 1 (local screenshots) only; the
  frame/layout machinery built here should be directly reusable once Source 2 textures exist
  (same `PosterFrameBuilder` input shape, just a different texture source), but that wiring isn't
  built now.

## Proposed files

- `client/src/scene/props/wall-art/WallPosterLayout.ts` (new) — pure slot-math:
  `computeWallPosterSlots(wallWidth: number): number[]`. No THREE dependency.
- `client/src/scene/props/wall-art/PosterFrameBuilder.ts` (new) — `buildPosterFrame(texture:
  THREE.CanvasTexture): THREE.Group`: four molding boxes + mat-board plane + contain-fit image
  plane, per the dimensions above.
- `client/src/scene/props/wall-art/WallPosterPlacer.ts` (new) — singleton, `getInstance(scene)`.
  Two independent async/event flows that converge on one `layoutPosters()` call once both have run
  at least once:
  - Content: on startup, `LocalScreenshotReader.listScreenshots()` → select (per above) →
    `readScreenshotBytes` + `buildPosterTexture` + `buildPosterFrame` per selected screenshot →
    cache the built (but unpositioned, not yet in-scene) groups. Runs once; texture loads aren't
    repeated on room resize.
  - Layout: subscribes to `RoomEventTypes.Resized` (same event `StorePropsCoordinator` and
    `RoomManager` already key off), recomputes slot positions via `WallPosterLayout` whenever
    dimensions actually change (skip-if-unchanged guard, mirroring
    `StorePropsCoordinator.handleRoomResized`'s existing pattern), and (re)positions the cached
    groups into slots using the same `centerOffset`/`STORE_FRONT_OFFSET` world-offset formula
    `StorePropsCoordinator` already uses for the entrance mat.
- Reuses as-is: `LocalScreenshotReader.ts`, `PosterTexture.ts`.

## Tests

- `WallPosterLayout.test.ts` — slot count/spacing/centering across several wall widths; empty
  result when the wall is narrower than one frame.
- Content-selection helper — dedupe-by-appid-keep-earliest, cap-to-slot-count, deterministic order
  (pure function, easy to isolate and unit test without touching the placer class itself).
- `PosterFrameBuilder.test.ts` — resulting group's bounding box matches the fixed outer footprint
  regardless of input image aspect; image plane is contain-fit (never upscaled/cropped) for both a
  landscape (16:10) and a portrait test image.
- `WallPosterPlacer.test.ts` — mocked `RoomEventTypes.Resized` + mocked `LocalScreenshotReader`:
  asserts placed group count, world positions, and pitch spacing; asserts re-fired resize with
  unchanged dimensions doesn't rebuild.

## Spike file disposition

- `LocalScreenshotReader.ts`, `PosterTexture.ts` — match this plan's design as-is (already noted in
  the feature doc as expected to hold regardless of the placement question). Recommend committing
  now, unchanged.
- `client/src/debug/LocalScreenshotPosterInspector.ts` (+ its `main.ts` import) — superseded by
  `WallPosterPlacer` once this ships; the feature doc already flagged this as "the piece most
  likely to be replaced outright." Recommend removing once `WallPosterPlacer` is placing real
  posters, not committing as-is.

## Open questions

- Corner-miter look of the four-box frame, once actually lit in the running scene — may want the
  extruded-profile upgrade noted above; can't tell without seeing it built.
- Whether 0.9m/4.5m-pitch reads right at real room widths — needs eyeballing against the live
  scene, not derivable from docs; treat the constants above as a first guess, not final.
- Whether `background_raw`/store screenshots (Source 2) should share this exact placer once built,
  or get their own — deferred per Non-goals above.

## Related

- [Wall Art & Framed Posters](../features/wall-art-framed-posters.md) — parent feature
- [Placement Commonality — Deferred Survey](placement-anchor-system-plan.md) — why this is a
  standalone placer, not a shared system
- `client/src/scene/props/UserPropPlacer.ts` — the shape this placer mirrors (self-contained,
  event-driven, owns its own occupancy/aesthetic preference)
- `client/src/scene/props/StorePropsCoordinator.ts` — the `RoomEventTypes.Resized` +
  world-offset-computation precedent this placer follows
- `client/src/scene/SceneSignManager.ts` — source of the `0x003087` theme blue
- `client/src/scene/RoomManager.ts` — wall geometry this placer reads
