# Encore: Someday Maybe

> Items here are not scheduled. They exist so we don't forget them. When entering Act 3, review this list and graduate anything ready to act on.
> 
> Some items here have feature docs already — they're listed here as stretch goals within those features. Check the feature doc for context before pulling forward.

The main thing we'll want to check in this "encore" act is: Can we embed an audio-video stream from another source? Can we sample other desktop windows? What if we were a desktop program ourselves? Can we drum up webpage views? Could we capture/replay with the help of a tray app...?

## Visual / Atmosphere

- **Architectural columns & decorative variants** — optional in-room columns (Roman/Corinthian style) to break up wall runs and frame aisles
- **Waist-height counter area** — service counter / check-out zone near front-of-store; strong video-store vibe anchor
- **Working analog wall clock** — in-world prop with real-time hand movement; ambient polish
- Fill the camera up with steam after launching a game, so the effect of the frozen frame in application is .. steamy.
- **Room variant — cozy basement** — see [Room Variants](../features/room-variants.md); Encore stretch beyond the Act 2 best-effort
- **Poster walls from user media** — wall posters sourced from user-owned public screenshots/artwork, rotating by category/zone (needs rights/privacy review)
- **Blacklight room atmosphere** — UV-style ambient with glowing accent colors; pairs naturally with basement variant; add to lighting preset system when room variants exist
- **Dissolve animation system** — smooth entrance materialization for store geometry; eliminates jarring "pop" on load. See `docs/research/dissolve-animation-research.md`.
- **Dust motes** — floating ambient particles, especially visible in light beams; ~1-2 day scope; see [Lighting and Atmosphere](../features/lighting-and-atmosphere.md)
- **Animated spotlight effects** — edge feathering, subtle pulse, volumetric light rays; shader-based; see [Lighting and Atmosphere](../features/lighting-and-atmosphere.md)

## Layout Modes

- **Insect Collection layout mode** — games pinned like specimens in a display case
- **Encircling Games layout mode** — the "Cyberspace room"; games orbit the player in concentric rings
- **Dynamic spoke/aisle shelf arrangement** — shelves as spokes per category, or giant aisles running past; 4-6 day estimate post-Act 2 core; see [Layout Variations](../features/layout-variations.md)
- **Layout grouping** — apply a shape to N shelves then repeat; stretch goal within [Layout Variations](../features/layout-variations.md)

## Extensibility

- **Plugin/extension system** — community additions and modular panel architecture
- **Hot reload system** — live preview for UI/content changes during development

## Community / Analytics

- **Community management** — Discord/forums, code of conduct, moderation, beta programs
- **A/B testing framework** — for feature improvements and UX experiments

## Deferred Re-entry Candidates

- **AC4.4: Local collections import (filesystem API)** — revisit `cloud-storage-namespace-1.json` import only if we are ready to accept filesystem API UX/security complexity. Prior findings show categories are the main unique value; other local metadata did not justify shipping this in Act 2.
