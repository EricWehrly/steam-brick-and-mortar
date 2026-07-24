# Plan: Wall Poster Placement

**Status**: Implemented across all three poster-eligible walls (back, left, right), then revised
(2026-07-23) after a real-machine visual check surfaced letterboxing at the original size/aspect —
see the updated Spacing and Frame-footprint sections below for the numbers actually shipped. This
feature is parked here for now; work resumes with Source 2 (official store screenshots) later.
**Feature**: [Wall Art & Framed Posters](../features/wall-art-framed-posters.md)
**Not** an instance of a shared placement system — see [Placement Commonality — Deferred
Survey](placement-anchor-system-plan.md) for why that's deferred. This placer is self-contained,
mirroring `UserPropPlacer`'s existing shape for shelf-cap props: subscribes to the room events it
needs, owns its own layout math, expresses its own aesthetic preference directly.

## Goal

Get real local screenshots onto the store's walls as framed posters: evenly spaced, not busy,
evoking the video-rental-store wall-of-posters read. Covers back, left, and right walls (the front
is the glass storefront, never a poster surface). Near-game placement and any cross-prop-type
sharing remain explicitly out of scope (see Non-Goals).

## Inputs already built (now committed - see Disposition below)

- `client/src/steam/LocalScreenshotReader.ts` — `listScreenshots()` / `readScreenshotBytes(filename)`.
- `client/src/scene/props/wall-art/PosterTexture.ts` — `buildPosterTexture(bytes)` →
  `THREE.CanvasTexture`, capped at 1024px on the longer edge, `SRGBColorSpace`. Used as-is, no
  changes needed.

## Design decisions (this pass)

### Spacing

**Rule (revised)**: 3 poster-widths of gap between adjacent posters (originally 4, revised
alongside the 3x size bump below), where "poster width" is the frame's *outer* width (image +
molding), per instruction. So pitch (center-to-center) = `FRAME_OUTER_WIDTH * 4`. With
`FRAME_OUTER_WIDTH = 2.7m`, pitch = 10.8m — a 22m-wide room (`RoomConstants.DEFAULT_ROOM_WIDTH`)
fits 2, which is the point (bigger, bolder, still not busy).

### Frame footprint — fixed outer width, aspect-preset outer height

Original version fixed *both* outer dimensions (one aperture aspect for every poster), sized for
the local screenshots' ~16:10 captures. Real-machine viewing showed visible letterboxing ("black
bars" top/bottom) because the fixed aperture aspect (~1.38) didn't actually match the real capture
aspect (1.6). Revised: outer **width** stays fixed (it's the spacing pitch unit, per Spacing
above), but outer **height** is picked from a small set of aspect-ratio presets, nearest to each
image's real aspect — see `PosterFrameBuilder.ts`'s `POSTER_SIZE_PRESETS`/`pickPosterSizePreset`.
Currently: `widescreen` (16:10, matches local screenshots exactly) and `standard` (4:3, a fallback
for anything else). The border is a **fraction** of each dimension (not a flat meters value), so
the inner aperture always keeps the outer footprint's own aspect exactly — the only remaining
letterbox source is the (usually small) gap between an image's real aspect and its nearest preset,
which for the current real screenshots (2560×1600, 1280×800 — both exactly 16:10) is zero.

Also revised: posters are now **3x** the original size, per instruction ("in scene at maybe 3x
their current size").

```
FRAME_OUTER_WIDTH_METERS = 2.7    // the pitch unit (was 0.9)
BORDER_FRACTION          = 0.06   // fraction of each dimension, not a flat meters value
FRAME_DEPTH_METERS       = 0.12   // molding extrusion depth (was 0.04)
WALL_STANDOFF_METERS     = 0.02   // gap off the wall face, avoids z-fighting (same idea as
                                   // SceneSignManager's SIGN_DEPTH/2 offset for the block-letter sign)
```

Per preset, outer height = `FRAME_OUTER_WIDTH_METERS / preset.aspect` (e.g. widescreen →
2.7/1.6 = 1.6875m), and both border and aperture dimensions derive from that per-preset height, not
a shared constant. A dark mat-board plane (`0x161616`) still fills the aperture behind the image,
so any residual letterboxed margin reads as a mat border, not a gap to the wall.

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

### Walls — back, left, and right (revised: all three, not back-only)

Originally back-wall-only for the first cut; expanded per instruction ("expand to the other
walls... sides and back"). `WallTargets.ts` maps each wall to: which room dimension its slots run
along (`width` for back, `depth` for left/right - `RoomManager`'s left/right walls are
`PlaneGeometry(depth, height)`), a rotation matching `RoomManager`'s own wall rotation exactly
(`0` for back, `+90°` for left, `-90°` for right - `RoomManager.ts`'s `ensureWalls`), and a
room-local XZ position formula that nudges the frame off the wall surface toward the room's
interior. Reusing `RoomManager`'s exact rotation values (rather than re-deriving the trig) is safe
because those values already orient the *actual* wall meshes correctly today - matching them
guarantees a poster's front face ends up oriented the same way.

Each wall gets its own slot list from the same `computeWallPosterSlots` (just fed a different
span), and content fills wall-by-wall in `WALL_TARGETS` order (back, then left, then right) - so
with fewer screenshots than total capacity across all three walls, the entrance-facing back wall
fills first, which is the visually important one.

### Content selection — one poster per game, earliest screenshot, capped to slot count

`listScreenshots()` can return multiple screenshots per `appid` (this machine has 2 for one game).
Selection: sort by `creation` ascending, dedupe keeping the **first** (earliest) screenshot per
`appid`, then take as many as there are wall slots, in that order. Keeps the "a few posters, not
busy" read even if the user has many screenshots of the same game, and gives a deterministic,
testable order (chronological, oldest capture first) rather than array order from the OS/VDF file.

### Layout — deterministic slots, centered, corner margin

```
availableWidth = wallWidth - 2 * CORNER_MARGIN_METERS   // CORNER_MARGIN_METERS = FRAME_OUTER_WIDTH_METERS
pitch          = FRAME_OUTER_WIDTH_METERS * 4           // 3-width gap + the poster itself
slotCount      = floor((availableWidth - FRAME_OUTER_WIDTH_METERS) / pitch) + 1   // 0 if availableWidth < frame width
slots[i]       = centered around wall-local x = 0, spaced by `pitch`
```

Pure function of `wallWidth` alone — no THREE/scene dependency, so it's unit-testable without any
mocking. If there are fewer selected screenshots than slots, the extra slots are simply left empty
(no stretching, no duplicating) — matches "get a few on the wall, build from there."

### Height (revised)

Originally a fixed center height. Revised (per instruction, "hang them a little higher... a
consistent distance from the bottom") to anchor by **floor clearance to the frame's bottom edge**
instead: `POSTER_BOTTOM_CLEARANCE_METERS = 1.1` (was an effective ~0.76m bottom under the old
center-height/widescreen-preset math). Anchoring by center height would leave bottoms uneven once
frames vary in height by aspect preset (a `widescreen` frame is shorter than a `standard` one at
the same fixed width) — bottom-anchoring keeps every poster's bottom edge level regardless of
preset, which reads better than aligning midpoints. `PosterFrameBuilder.getFrameOuterHeight(group)`
exposes each built group's own outer height (stashed in `group.userData` at build time) so the
placer can compute `centerY = POSTER_BOTTOM_CLEARANCE_METERS + outerHeight / 2` per poster. Same
clearance for every poster regardless of room height; flagged as a first guess to eyeball later,
same as the other placement constants.

## Non-goals (explicitly out of scope for this plan)

- **Near-game placement** ("posters near their game's shelf") — the preference the user raised as
  a longer-term want. Not attempted here; this is fixed evenly-spaced slots only. Revisit once this
  placer exists and a second data point (e.g. `UserPropPlacer`'s front-center/spread preference) is
  available to compare against, per the deferred-survey doc's revisit trigger.
- **Wall shelves, other wall decorations (non-poster)** — a different prop type; not this placer's
  job even though it shares the same wall geometry.
- **Any shared placement abstraction** — see [Placement Commonality — Deferred
  Survey](placement-anchor-system-plan.md).
- **Store/official-art posters (Source 2)** — this plan is Source 1 (local screenshots) only; the
  frame/layout machinery built here should be directly reusable once Source 2 textures exist
  (same `PosterFrameBuilder` input shape, just a different texture source), but that wiring isn't
  built now. Source 2 also needs its own content-selection layer (highlight games: recently
  purchased → play next → recently played) - see the feature doc's "Selection Criteria" section -
  which is a separate concern from this plan's placement/frame machinery.

## Proposed files

- `client/src/scene/props/wall-art/WallPosterLayout.ts` (new) — pure slot-math:
  `computeWallPosterSlots(wallWidth: number): number[]`. No THREE dependency.
- `client/src/scene/props/wall-art/PosterFrameBuilder.ts` (new) — `buildPosterFrame(texture:
  THREE.CanvasTexture): THREE.Group`: four molding boxes + mat-board plane + contain-fit image
  plane, per the dimensions above.
- `client/src/scene/props/wall-art/WallTargets.ts` (new) — `WALL_TARGETS`: per-wall span/rotation/
  position-formula mapping for back/left/right. Pure, no THREE dependency.
- `client/src/scene/props/wall-art/WallPosterPlacer.ts` (new) — singleton, `getInstance(scene)`.
  Two independent async/event flows that converge on one `layoutBuiltGroups()` call once both have
  run at least once:
  - Content: on startup, `LocalScreenshotReader.listScreenshots()` → select (per above, sized to
    total capacity summed across all three walls) → `readScreenshotBytes` + `buildPosterTexture` +
    `buildPosterFrame` per selected screenshot → cache the built (but unpositioned, not yet
    in-scene) groups. Runs once; texture loads aren't repeated on room resize.
  - Layout: subscribes to `RoomEventTypes.Resized` (same event `StorePropsCoordinator` and
    `RoomManager` already key off), recomputes each wall's slot positions via `WallPosterLayout`/
    `WallTargets` whenever dimensions actually change (skip-if-unchanged guard, mirroring
    `StorePropsCoordinator.handleRoomResized`'s existing pattern), and (re)positions the cached
    groups by walking `WALL_TARGETS` in order and consuming groups into each wall's slots in turn,
    using the same `centerOffset`/`STORE_FRONT_OFFSET` world-offset formula `StorePropsCoordinator`
    already uses for the entrance mat.
- Reuses as-is: `LocalScreenshotReader.ts`, `PosterTexture.ts`.

## Tests

- `WallPosterLayout.test.ts` — slot count/spacing/centering across several wall widths; empty
  result when the wall is narrower than one frame.
- Content-selection helper — dedupe-by-appid-keep-earliest, cap-to-slot-count, deterministic order
  (pure function, easy to isolate and unit test without touching the placer class itself).
- `PosterFrameBuilder.test.ts` — preset selection (`pickPosterSizePreset`) for widescreen/standard/
  portrait aspects; resulting group's bounding box matches the fixed outer width and its preset's
  derived height; a 16:10 image exactly matching its preset fills the aperture with zero
  letterboxing; a portrait image contain-fits inside `standard` without upscaling.
- `WallTargets.test.ts` — span/rotation/position-formula correctness per wall (back along width,
  left/right along depth; rotation matches `RoomManager`'s own wall rotations).
- `WallPosterPlacer.test.ts` — mocked `RoomEventTypes.Resized` + mocked `LocalScreenshotReader`:
  asserts placed group count, world positions, and pitch spacing on the back wall; asserts
  re-fired resize with unchanged dimensions doesn't rebuild; asserts overflow beyond the back
  wall's capacity spills onto the left and right walls with the correct rotation each.

## Spike file disposition (resolved)

- `LocalScreenshotReader.ts`, `PosterTexture.ts` — matched this plan's design as-is, committed
  unchanged as real dependencies (`b3d4e088`), no longer spike files.
- `client/src/debug/LocalScreenshotPosterInspector.ts` (+ its `main.ts` import) — removed, per the
  plan: superseded by `WallPosterPlacer` once it shipped.

## Open questions

- Corner-miter look of the four-box frame, once actually lit in the running scene — may want the
  extruded-profile upgrade noted above; can't tell without seeing it built.
- Whether the revised 2.7m/10.8m-pitch size reads right at real room widths for longer than a
  first look — treat as a second guess, not final, same caveat as the original numbers.
- Whether `standard` (4:3) is the right second preset, or whether a source that actually needs it
  (store screenshots, trailer thumbnails) will want something else once built — no real non-16:10
  poster content exists yet to check against.
- Whether `background_raw`/store screenshots (Source 2) should share this exact placer once built,
  or get their own — deferred per Non-goals above.
- Whether filling walls strictly in `WALL_TARGETS` order (back, then left, then right) is the
  right default once there are enough screenshots to actually fill more than the back wall — an
  even/round-robin distribution across walls is a plausible alternative, untested against real
  content volume.

## Related

- [Wall Art & Framed Posters](../features/wall-art-framed-posters.md) — parent feature
- [Placement Commonality — Deferred Survey](placement-anchor-system-plan.md) — why this is a
  standalone placer, not a shared system
- `client/src/scene/props/UserPropPlacer.ts` — the shape this placer mirrors (self-contained,
  event-driven, owns its own occupancy/aesthetic preference)
- `client/src/scene/props/StorePropsCoordinator.ts` — the `RoomEventTypes.Resized` +
  world-offset-computation precedent this placer follows
- `client/src/scene/SceneSignManager.ts` — source of the `0x003087` theme blue
- `client/src/scene/RoomManager.ts` — wall geometry (including left/right rotation values) this
  placer reads and mirrors
