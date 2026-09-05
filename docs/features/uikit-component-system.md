# Feature: uikit Component System

**Act**: 2 (Best Effort) — sequenced after [VR Support](vr-support.md) sub-scope 2's settings-menu
migration lands, not before
**Status**: Not started — deliberately deferred (see Sequencing below)
**Priority**: Medium

## Goal

A real separation of **content** (what data a panel shows), **layout** (how it's structured/
composed), and **style** (colors, spacing, type scale) for `@pmndrs/uikit`-built in-scene panels -
replacing today's fully-imperative "build the whole Container tree by hand, per panel" approach.

## Context

This isn't a new complaint - it predates the uikit migration itself. Two review threads on
[PR #161](https://github.com/EricWehrly/steam-brick-and-mortar/pull/161) (still unresolved,
now marked outdated since the code they anchored to has since been rewritten) asked exactly this:

- On the old canvas-drawn `GameBoxFoldCoordinator.ts`: *"this feels like a really kludgey way to
  implement UI / buttons"*
- On the old canvas-drawn `GameBoxFoldModel.ts`: *"is there a system that would let us separate
  content from styling from layout? This seems very oddly primitive"*

Moving the game box's three faces from hand-drawn canvas to `@pmndrs/uikit` panels (2026-09-02,
[In-Scene UI Substrate](../architecture/in-scene-ui-substrate.md)) answered the first complaint -
real hover/click/scroll from the library instead of raycast-to-UV hit-testing against remembered
pixel rects - but not the second one. Direct request (2026-09-05), after that migration shipped:
"we have three different files just for storing variables related to how we're building the game
boxes [`GameBoxFoldDimensions.ts`, `GameBoxPanelStyle.ts`, `GameBoxPanelParts.ts`]... still a
disgusting amount of magic numbers and hardcoded variables in the adjacent files besides... this is
still so manual." Each panel (`GameBoxIdentityPanel`, `GameBoxStorePanel`, `GameBoxDebugPanel`)
still builds its own `Container`/`Text`/`Image` tree imperatively, constant-by-constant, with only a
thin, ad hoc layer of shared builder functions (`GameBoxPanelParts.ts`) extracted so far - see
`docs/tech-debt.md` for the narrower, already-tracked pieces of this same gap
(`game-box-color-centralization`, `generic-color-token-consumers`).

uikit itself has no template language - a panel's tree IS built in code, same as a Three.js scene
graph - so this isn't about bolting on an HTML-template-like DSL. It's about building our own real
component layer on top of uikit's primitives: declarative composition instead of imperative
`new Container({...}); x.add(y)` chains, a proper token system instead of scattered per-file
constants, and shared components (rows, scrollable sections, chip lists, dividers) that panels
compose rather than each reimplementing.

## Sequencing: after the VR settings-menu migration, not before

[`feature/vr-uikit-menu-migration`](https://github.com/EricWehrly/steam-brick-and-mortar/tree/feature/vr-uikit-menu-migration)
is already building its own uikit-based settings panels independently (see
`docs/tech-debt.md`'s `vr-uikit-menu-sync-recheck` for the reconciliation already known to be
needed there). Direct request: land that work first, *then* design this system - with two real,
differently-shaped panel families (game box faces + settings menu) to generalize from, rather than
building an abstraction against a single call site and guessing at what a second consumer will
need. Building it now, against only the game box, risks the exact premature-abstraction trap this
project's own conventions warn against.

## Acceptance Criteria (draft - refine once scoping starts)

- A panel's content model (what data it shows) is separate from its layout composition (how
  sections are arranged) and its style (colors/spacing/type scale come from tokens, not per-file
  literals)
- The three current constant-holding files (`GameBoxFoldDimensions.ts`, `GameBoxPanelStyle.ts`,
  `GameBoxPanelParts.ts`) either consolidate into a coherent structure or each earn a clearly
  distinct, non-overlapping responsibility
- Shared structural patterns (scrollable columns, chip rows, dividers, labeled sections) are real
  components both the game box and the settings menu compose, not parallel reimplementations
- No bare pixel/hex literals in a panel file for anything the token/component system already has a
  concept for
- Existing game-box panels are migrated onto the new system (not left as a legacy second style)

## Stories / Tasks

Not yet broken down - scoping starts once the VR settings-menu migration (sequencing above) lands.
Write `docs/plans/uikit-component-system-plan.md` at that point, informed by both panel families'
actual shapes.

## Notes / Open Questions

- **Deferral reason**: only one real consumer (the game box) exists today; the settings-menu
  migration will be the second, and designing against two shapes rather than one is the whole
  point of waiting.
- **Dependencies**: [VR Support](vr-support.md) sub-scope 2 (settings-menu uikit migration) landing
  first.
- Related tech debt, likely folded into or built alongside this: `game-box-color-centralization`,
  `generic-color-token-consumers`, `vr-uikit-menu-sync-recheck` (all in `docs/tech-debt.md`).
- Related: [Game Detail Screen](game-detail-screen.md) (the game box's own feature doc),
  [In-Scene UI Substrate](../architecture/in-scene-ui-substrate.md) (the uikit-vs-canvas decision
  this builds on top of).
- The two PR #161 review threads referenced above are marked outdated (the code they anchored to
  no longer exists) but not resolved - leave that decision to whoever merges #161; this doc exists
  so the underlying concern has a real home either way.
