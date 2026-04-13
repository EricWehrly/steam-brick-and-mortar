# Feature: Room Variants

**Act**: 2 (Best Effort — architecture; specific variants are Encore)
**Status**: Not Started
**Priority**: Low

## Goal

A room variant system that allows the store environment (geometry, lighting, materials) to be swapped between distinct named styles — so the same game library can be browsed in different atmospheric contexts.

## Context

The store currently has one room. There are several distinct variant ideas that have accumulated, plus the room structure itself has known duplication that would need cleanup before variants can be layered on top. The right approach is: get the room structure clean first, then build the variant system, then implement specific variants.

**Important design constraint**: lighting presets and room variants should be loosely coupled. Any lighting preset should work in any room, even if some combinations are especially curated (e.g. Blacklight pairs naturally with the basement variant).

## Planned Variants

**Cozy Basement Gaming Library** — the most-developed concept:
- Lower ceilings, warmer lighting, carpet, wood paneling
- Pairs especially well with the Blacklight lighting atmosphere
- Strong contrast to the default "video store" room

**Museum Mode** — longer-term / Encore:
- Cool neutral overhead spots, minimal ambient, clean gallery feel
- Shared with the "Museum" feature idea from current-status.md where a user can build and share a curated collection

## What's Needed First

The room structure has known duplication across multiple creation classes (`room-structure-refactor-plan.md`). This cleanup is a prerequisite for building a clean variant system — adding variants on top of tangled room creation code would make it worse.

## Acceptance Criteria

- Room structure refactored to a single clean creation path
- Variant system: named variants selectable at runtime (or at startup via config)
- "Cozy Basement" variant implemented with distinct ceiling, lighting defaults, carpet, paneling
- Lighting presets work in any room (not hard-coupled to a variant)
- Room variant persists across session (stored in settings)

## Stories / Tasks

- **Room structure cleanup**: review and consolidate `room-structure-refactor-plan.md` — eliminate duplication across room creation classes
- **Variant abstraction**: design a `RoomVariant` interface or config type; how is a variant described and applied?
- **Cozy Basement**: implement the specific visual elements (ceiling, carpet, paneling, lighting defaults)
- **Variant selector**: UI affordance for switching room variant (settings panel or in-scene)

## Notes / Open Questions

- The room structure refactor (`docs/architecture/room-structure-refactor-plan.md`) is the technical prerequisite — don't build the variant system on top of the current tangled state
- Blacklight / UV atmosphere is an Encore lighting preset that pairs with the basement variant; the two can be developed independently but curated together
- "Museum Mode" as a standalone shareable experience (from current-status.md ideas) is a much larger scope and probably belongs in Encore; the museum room *aesthetic* could be an early variant though
- Room variant architecture should also inform how layout variations (arc vs square rows) interact with room geometry at a macro level
