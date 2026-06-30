# Encore: Someday Maybe

> Items here are not scheduled. They exist so we don't forget them. When entering Act 3, review this list and graduate anything ready to act on.
> 
> Some items here have feature docs already — they're listed here as stretch goals within those features. Check the feature doc for context before pulling forward.

The main thing we'll want to check in this "encore" act is: Can we embed an audio-video stream from another source? Can we sample other desktop windows? What if we were a desktop program ourselves? Can we drum up webpage views? Could we capture/replay with the help of a tray app...?

> The "desktop program ourselves" thread is now captured concretely in [Native Desktop App](../features/desktop-app.md) — the umbrella for everything gated on filesystem/process/hardware access (local screenshots at scale, Source→glTF extraction, peripheral enumeration, launching games). **It is now under evaluation for *between Act 2 and 3*, not this someday list** (a Tauri spike is queued).

## Visual / Atmosphere

- **Architectural columns & decorative variants** — optional in-room columns (Roman/Corinthian style) to break up wall runs and frame aisles
- **Waist-height counter area** — service counter / check-out zone near front-of-store; strong video-store vibe anchor → graduated into [Fabricated Set Dressing](../features/fabricated-set-dressing.md)
- **Working analog wall clock** — in-world prop with real-time hand movement; ambient polish → see [Fabricated Set Dressing](../features/fabricated-set-dressing.md)
- Fill the camera up with steam after launching a game, so the effect of the frozen frame in application is .. steamy.
- **Room variant — cozy basement** — see [Room Variants](../features/room-variants.md); Encore stretch beyond the Act 2 best-effort
- **Poster walls from user media** — wall posters sourced from user-owned public screenshots/artwork, rotating by category/zone (needs rights/privacy review)
- **Blacklight room atmosphere** — UV-style ambient with glowing accent colors; pairs naturally with basement variant; add to lighting preset system when room variants exist
- **Dissolve animation system** — smooth entrance materialization for store geometry; eliminates jarring "pop" on load. See `docs/research/dissolve-animation-research.md`.
- **Dust motes** — floating ambient particles, especially visible in light beams; ~1-2 day scope; see [Lighting and Atmosphere](../features/lighting-and-atmosphere.md)
- **Animated spotlight effects** — edge feathering, subtle pulse, volumetric light rays; shader-based; see [Lighting and Atmosphere](../features/lighting-and-atmosphere.md)
- **Post-processing atmosphere effects** (see [Post-Processing Effects](../features/postprocessing-effects.md)):
  - Vignette — subtle screen-edge darkening; optional setting; try in XR as a comfort/locomotion technique
  - God rays (GodRaysEffect) — ceiling light shafts; likely replacement for current spotlight approach; land after LUT/lighting balance is finalized
  - User-opt-in Effects panel: noise/film grain, glitch, scanlines, chromatic aberration (flatscreen only); low-effort once the UI section is wired

## Layout Modes

- **Insect Collection layout mode** — games pinned like specimens in a display case
- **Encircling Games layout mode** — the "Cyberspace room"; games orbit the player in concentric rings
- **Dynamic spoke/aisle shelf arrangement** — shelves as spokes per category, or giant aisles running past; 4-6 day estimate post-Act 2 core; see [Layout Variations](../features/layout-variations.md)
- **Layout grouping** — apply a shape to N shelves then repeat; stretch goal within [Layout Variations](../features/layout-variations.md)
- **Entrance aisle runner carpet with marquee lights** — add a long runner along the primary entrance aisle (from door through center) with movie-theater style border lighting.

## Extensibility

- **Plugin/extension system** — community additions and modular panel architecture
- **Hot reload system** — live preview for UI/content changes during development
- **Settings version history + recovery** — auto-save versioned settings snapshots and provide rollback/recovery UI for earlier known-good configurations

## Community / Analytics

- **Community management** — Discord/forums, code of conduct, moderation, beta programs
- **A/B testing framework** — for feature improvements and UX experiments

## Misc

- **Friend stream projection (Tiers 2–4)** — presence data, Steam Broadcasting DASH, and native window capture; the `getDisplayMedia` Tier 1 proof is **pulled into Act 2**. See [Friend Stream Projection](../features/friend-stream-projection.md).
- Portal-style portals linking different rooms
would love to build to support inside the same room, but not at first
Would love to build as much as possible, a "filter" drawing effect that causes the different appearance of the different "rooms"
like a cartoonish effect for a more Nikelodeon feel,
art deco effect that adds a little emphasis on top of our 'blockbuster' scene

## Deferred Re-entry Candidates

- **AC4.4: Local collections import (filesystem API)** — revisit `cloud-storage-namespace-1.json` import only if we are ready to accept filesystem API UX/security complexity. Prior findings show categories are the main unique value; other local metadata did not justify shipping this in Act 2.

## I don't know where to put this note
but want it displayed in the games menus somewhere
"Nostalgia is evoking a memory of how something made you feel
retro (?) is harmonizing with _why_ that thing made you feel what you did"
