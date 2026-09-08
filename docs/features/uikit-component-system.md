# Feature: uikit Component System

**Act**: 2 (Best Effort) — advancing alongside [VR Support](vr-support.md) sub-scope 2's
settings-menu migration and the new in-world-UI thread, not gated behind either
**Status**: Not started as its own extraction pass — building opportunistically wherever the other
three concurrent threads (game box panels, settings-menu migration, new in-world UI) hit the same
duplication (see Sequencing below)
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

## Sequencing: build ahead, opportunistically (revised 2026-09-05)

Original direction (2026-09-05, superseded same day): wait for the VR settings-menu migration to
fully land before starting, so the design generalizes from two real panel families instead of
guessing from one. Revised direction, once `feature/vr-uikit-menu-migration` was rebuilt onto
`act2/default` and both branches' panel families were sitting side by side: rather than wait for
either the settings-menu migration (five panels still unported) or the new in-world-UI thread to
finish, build this "ahead" of where each concrete port needs it - extracting a shared piece the
moment porting the next settings panel, or the next in-world UI tab, would otherwise duplicate
something the game box's panels already do. **No hard gating rule on when this starts or how far it
goes** - the point is finding the cheapest real implementation path as each new panel's actual shape
shows up, not pre-designing a full component system speculatively. Concretely: fewer rewritten
lines and less duplicated tree-shape beats a complete abstraction landed all at once. This still
respects the original worry (don't generalize from a single call site) because by the time this
work starts for real, three families already exist to look at - the game box, the settings-menu
tabs already ported (`display-advanced`, `debug`), and the `category-reference` world-lock tab -
just without waiting for any of them to be *finished* first.

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

No separate plan doc required to start - each extraction rides along with whatever settings-menu
panel or in-world-UI tab is being ported when the duplication shows up, the same way
`GameBoxPanelParts.ts`'s `buildScrollableColumn`/`roundedCorners` helpers were pulled out during the
game box's own reconciliation pass. Write `docs/plans/uikit-component-system-plan.md` only if/when
the extracted pieces grow enough to need a real design (a token system, a shared row-builder
library) rather than a handful of small shared functions - not a prerequisite to starting.

## Notes / Open Questions

- **Why not deferred anymore**: the original wait-for-two-families reasoning is satisfied more
  cheaply by building alongside the still-in-progress settings-menu migration and in-world-UI
  thread than by waiting for either to finish - see Sequencing above.
- **Dependencies**: none blocking start; informed by whichever of [VR Support](vr-support.md)
  sub-scope 2's remaining panels or the new in-world-UI tab is being worked on at the time.
- Related tech debt, likely folded into or built alongside this: `game-box-color-centralization`,
  `generic-color-token-consumers`, `vr-uikit-menu-sync-recheck` (all in `docs/tech-debt.md`).
- Related: [Game Detail Screen](game-detail-screen.md) (the game box's own feature doc),
  [In-Scene UI Substrate](../architecture/in-scene-ui-substrate.md) (the uikit-vs-canvas decision
  this builds on top of).
- The two PR #161 review threads referenced above are marked outdated (the code they anchored to
  no longer exists) but not resolved - leave that decision to whoever merges #161; this doc exists
  so the underlying concern has a real home either way.
