# Feature: Lighting and Atmosphere

**Act**: 2
**Status**: Mostly Implemented (core system complete; presets, atmosphere, and interactive controls are stretch goals)
**Priority**: Medium

## Goal

A complete lighting system with tunable mood presets, opt-in atmosphere effects (dust motes, spotlight shimmer), and an in-scene interactive control panel — so the store can feel like anything from a clean corporate aisle to a dank basement.

## Context

The core lighting system was largely built during Act 1: dynamic lights, a quality selector, a UI panel, and the LightingRenderer lifecycle. What remains is the experiential layer — the ability to shift the emotional tone of the space, which is what makes the store feel like _somewhere_ rather than just a lit room.

Two directions are in play:
- **Mood presets ("tone knob")**: a named scale from corporate to dank, controlled by a single in-scene dial or panel
- **Atmosphere effects**: dust motes, volumetric spotlight shimmer — subtle but transformative

There's also a longer-term design where lighting presets and room variants (basement, museum) are loosely coupled — any preset should work in any room, even if some combinations are especially curated. That's Act 3 territory.

## Acceptance Criteria

- Tiered lighting quality selector (basic / standard / high) exposed in settings panel
- Four named tone presets implemented: Corporate, Cheery, Dim, Dank
- Flat / Wolfenstein-mode preset (uniform ambient, no dynamic lights) available as a fallback/toggle
- Dongle switch panel: retro rocker switches (one per light), masking-tape labels, LED state indicators, tone knob
- Dust mote particle system: ambient floating particles, visible in light beams; VR-performance-tuned particle count
- Basic animated spotlight effects: feathered edges, subtle breathing effect

## Stories / Tasks

- **Tiered quality selector**: expose basic/standard/high toggle in settings panel (deferred from Act 1)
- **Tone presets**: implement Corporate / Cheery / Dim / Dank as named lighting configurations; wire to a single knob/control
- **Flat/Wolfenstein mode**: uniform ambient, no dynamic lights — fast fallback, useful for debug
- **Dongle switch panel**: design and implement retro rocker-switch UI (blocked on UI normalization baseline from intermission); requires tone presets to exist first
- **Dust mote system**: particle system for ambient dust; tuned for VR performance; visible in light beam columns
- **Animated spotlight shimmer**: edge feathering, subtle pulse; shader-based; builds on dust motes for beam visibility
- **Walkway and shelf-edge accent lighting**: optional theatrical aisle guidance (movie-theater walkways / subtle neon edge cues) layered on top of base presets

## Notes / Open Questions

- The dongle switch panel is a second lighting control panel running alongside the existing one, not replacing it.
- Raw WebGL light names should be retained as tooltips on the dongle switches; human-readable labels on the masking-tape strips.
- Lighting presets and room variants should be loosely coupled — design the preset system so any preset works in any room.
- Blacklight / UV atmosphere (glowing accents, dark ambient) is on the Encore list paired with the basement room variant; it's not in scope here but the preset architecture should make adding it easy.
- Dust motes and animated spotlights were previously on the Encore list — graduating them here as stretch goals because the scope is reasonable (1-3 days each) and they're high-impact for atmosphere.
- Related: archived source notes in `docs/archive/phase2-ready-for-friends.md` (Feature 8.5.0 / 8.5.1).

## Progress Snapshot (2026-05)

What has landed recently on the "make the store look better" path:
- Instanced game artwork moved to a lit material strategy (`MeshStandardMaterial` with array-texture sampling patch) so boxes now participate in scene lighting and shadows more convincingly.
- Retail lighting was retuned (ambient/directional/spot/rim plus ceiling fixture intensity), producing better shelf readability and stronger artwork contrast.
- Texture-array color handling was corrected in the pipeline (array texture color-space tagging and decode-path adjustments) to reduce muted artwork output.
- Lighting controls panel was upgraded to multiplier sliders, making brightness balancing easier and more predictable during visual tuning.

Current decision boundaries:
- TSL/NodeMaterial was evaluated and deferred for now because it implies a broader renderer migration scope than this feature needs.
- Near-term visual improvements should continue on the current WebGL material path unless a renderer-wide migration is explicitly scheduled.

What remains in this feature:
- Tone presets and in-scene "dongle" controls.
- Atmosphere effects (dust motes, subtle spotlight shimmer).
- Optional additional art-direction tuning once preset architecture is in place.

## Pre-Clutter Immersion Checkpoint

Before investing in new clutter assets, prefer these technical immersion passes:
1. Improve game-box gloss and edge readability.
2. Tighten contact shadow grounding around shelves.
3. Add subtle per-instance variation to reduce clone look.
4. Add dust motes and subtle light animation for depth and presence.

Actionable implementation notes and execution order are tracked in:
- `docs/plans/game-artwork-box-shading-plan.md` (Pre-Clutter Technical Options section).
