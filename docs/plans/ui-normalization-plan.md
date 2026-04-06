# UI Normalization — Active Plan
**Milestone**: 6.6  
**Status**: 🔮 Ready to start  
**Approach**: Incremental sub-agent bites. One small change per run, review before next bite.

---

## Why do this first

Before adding any new UI (search omnibar, 3D signage, lighting controls), we need shared components. Otherwise every new panel is more inconsistency to clean up later.

This work is highly parallel-eligible: once tokens are defined, converting each panel is independent.

---

## Phase A — Audit + Design Token Spec
**Goal**: Inventory what exists, define the token system. Output: `docs/ui-design-tokens.md`.

### A1. Audit existing UI elements
Sub-agent task: read all files in `client/src/ui/` and produce a flat list of:
- Every hardcoded color value
- Every hardcoded font size or font family
- Every hardcoded padding/margin/border-radius
- Which files they appear in

Output: inline report (don't need to commit anything yet).

### A2. Define CSS custom property tokens
Based on audit, define a minimal set of tokens:

```css
/* Palette */
--color-primary: ...
--color-accent: ...
--color-surface-0: ...   /* deepest background */
--color-surface-1: ...   /* panel background */
--color-surface-2: ...   /* inset/input background */
--color-border: ...
--color-text-primary: ...
--color-text-secondary: ...
--color-text-disabled: ...

/* Spacing */
--space-xs: 4px
--space-sm: 8px
--space-md: 16px
--space-lg: 24px

/* Radius */
--radius-sm: 4px
--radius-md: 8px

/* Typography */
--font-family-ui: ...
--font-size-sm: ...
--font-size-md: ...
--font-size-lg: ...
```

Commit as `docs/ui-design-tokens.md` with the token list + rationale for each choice.

---

## Phase B — Base Components
**Goal**: One shared CSS/TS component file for each primitive. Components use tokens only.

### B1. First component: Button
Convert one button to use a `ui-button` class backed by tokens.  
**File**: create `client/src/ui/components/UIButton.ts` + `ui-button.css`  
**Review**: Does it look right? Does it match existing style?

### B2. Second component: Checkbox / Toggle
Convert one checkbox.  
**File**: `UICheckbox.ts` + `ui-checkbox.css`  
**Review**: Same drill.

### B3. Panel component
`UIPanel.ts` + `ui-panel.css` — standard container with header + body regions.

### B4. Tab bar
`UITabBar.ts` + `ui-tab-bar.css`

---

## Phase C — Migrate Existing Panels (one at a time)
**Goal**: Replace inline styles and one-off classes in each panel with shared components.

**Order** (most broken/inconsistent first):
1. Settings / Graphics panel (`GraphicsSettingsPanel.ts`)
2. Cache panel (`CacheManagementPanel` or equivalent) — **also fix broken preview here**
3. Lighting panel (`LightingControlsPanel.ts`)
4. Steam UI panel (`SteamUIPanel.ts`)
5. Pause menu tabs and navigation

**Per-panel sub-agent prompt template**:
> "Convert `<file>` to use shared UI components from `client/src/ui/components/`. Replace all hardcoded colors, sizes, and layout values with CSS custom property tokens from `docs/ui-design-tokens.md`. Do not change any behavior or functionality. Produce a minimal diff."

**Review after each one.** Don't batch-migrate.

---

## Phase D — Known Bugs (can run in parallel with C)

| Bug | File | Notes |
|-----|------|-------|
| Cache previewer broken | TBD | Diagnose first |
| GPU memory estimates in console only | `GpuMemoryEstimator.ts` + Debug tab | Surface in UI |
| Disconnected checkboxes (FPS counter, perf stats) | `GameSettingsPanel.ts` | Connect or placeholder |

---

## Phase E — Steam-style Tag Components

**Goal**: Game categories/genres display as Steam-style tag pills, not plain text.

Steam's store uses compact, rounded-corner tag boxes with a subtle background tint on genre/feature labels. We want to match this visual language in the detail panel.

### Research task (subagent)
Before implementation, probe the current Steam store page for an existing game and note:
- Tag box CSS: background color, border-radius, font-size, padding, font-weight, hover state
- Whether Steam uses a single class or multiple (genre vs. feature tags look similar but may differ slightly)
- Any color-coding by category type

Write findings to `docs/plans/steam-tag-research.md`.

### Implementation (after research)
- Create `UITag.ts` + `ui-tag.css` as a component (tokens-based)
- Replace current `.detail-tag` styles in `binder.css` with the component
- Wire into `BinderGameDetailPanel` — genres and categories both use it
- This component also feeds the future in-world shelf category label system

---

## Done criteria
- [ ] `docs/ui-design-tokens.md` committed
- [ ] All buttons, checkboxes, panels use shared components
- [ ] No hardcoded color/size values in UI files
- [ ] Cache previewer works
- [ ] GPU memory visible in Debug tab
- [ ] All settings checkboxes have visible effect or explicit placeholder
