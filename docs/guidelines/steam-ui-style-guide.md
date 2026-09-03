# Steam UI Style Guide (Intermission)

## Purpose
This document is the visual style source of truth for UI normalization during Intermission.

Use this guide to make panel and menu decisions before adding one-off styles. It merges:
- Existing project guidance (`docs/guidelines/ui-guidelines.md`)
- Existing token plans (`docs/plans/ui-design-tokens.md`, `client/src/styles/tokens.css`)
- Existing Steam panel implementation (`client/src/styles/components/steam-ui.css`)
- Updated Steam reference findings gathered during controls panel redesign

## Steam Reference Findings (Updated)
Notes from the latest review pass:
- Steam store pages are useful for broad visual direction, but not a reliable source for in-client overlay CSS.
- Steam-style interfaces generally favor muted text hierarchy and restrained accents:
  - Primary text: `#c6d4df`
  - Muted labels/section metadata: `#8f98a0`
  - Interactive accent: `#67c1f5`
  - Accent hover/active: `#1a9fff`
- Headings are usually less "hero" and more structural: compact, muted, often uppercase labels.
- Row-based settings are typically flat or lightly elevated cards; left accent bars are better treated as state indicators (selected/focused), not default decoration.

## Visual Rules

### 1. Color Hierarchy
Use accent color for interaction and state, not for every heading.

- Default panel text should be secondary-light, not pure white.
- Use white/high-contrast text only for key values or interactive emphasis.
- Accent blue is for:
  - active tab/selection
  - focus ring
  - primary action controls
  - selected row indicator

### 2. Headings and Labels
- Do not repeat context already provided by parent tabs.
  - Example: in Controls tab content, avoid repeating a top-level "Controls" heading.
- Prefer compact section labels over large blue headings.
- Recommended section label treatment:
  - uppercase
  - `12px` to `13px`
  - muted color (`#8f98a0`-like)
  - letter-spacing around `0.08em`

### 3. Rows and Selection
- Default row style:
  - subtle dark surface
  - rounded corners
  - no accent border by default
- Selected state style:
  - optional left border accent (or equivalent)
  - only applied with explicit state class (example: `.selected`)

### 4. Inputs and Buttons
- Preserve interaction stability: no layout shift on focus/hover.
- Focus style should be clear and consistent (accent outline or ring).
- Button variants should map to semantic intent (primary, secondary, warning), not per-panel custom color choices.

## Token Direction (What To Normalize Toward)
Current project tokens, defined per `docs/plans/ui-design-tokens.md` in `client/src/ui/tokens.css`
(not `client/src/styles/tokens.css` - that's a separate, narrower panel-chrome-only file), are a
good base. For redesign consistency, align on these semantic roles:

- `--color-text-primary`: high-emphasis content
- `--color-text-secondary`: default panel body text
- `--color-text-tertiary`: metadata and helper text
- `--color-accent`: interactive highlight and selected state
- `--color-surface-1..3`: panel, nested panel/input, and hover/divider layers
- `--color-border`: neutral border/divider

If a new style does not fit one of these semantic roles, add a semantic token first instead of
hardcoding - and that applies beyond DOM CSS too: non-DOM code (uikit/three.js, or anything else
that can't read a CSS custom property directly) reads this same source through
`client/src/ui/ColorTokens.ts`'s `COLOR_TOKENS`, a live `getComputedStyle` mirror deliberately kept
generic rather than scoped to any one consumer.

## Component Pattern Baseline
For panel normalization work:
- Structure: template-driven HTML sections with shared layout classes
- Shared styles first (`shared-components.css`), panel-specific styles only for unique behavior
- Keep per-panel CSS focused on unique affordances (example: keyboard key badges in Controls)

## Practical Do/Do Not

Do:
- Start from shared panel primitives and semantic tokens
- Treat accent as a state signal
- Use subtle, readable hierarchy

Do Not:
- Add blue headings by default
- Duplicate tab titles inside panel body unless needed for clarity
- Ship new hardcoded color values when tokenized equivalents exist

## Implementation Notes For Current Redesign Pass
- Controls panel should keep row cards and key badges.
- Left accent border should be state-based (`.selected`), not always-on.
- Section headings should be either removed when redundant, or restyled as muted section labels.

## Relationship To Other Docs
- `docs/guidelines/ui-guidelines.md`: coding and template implementation conventions
- `docs/plans/ui-design-tokens.md`: token inventory and migration rationale
- This file: final visual language decisions used to drive panel redesign choices
