# UI Normalization — Active Roadmap
**Milestone**: 6.6  
**Status**: 🔄 In Progress (Phase A Complete)  
**Approach**: Incremental updates. One small component or panel at a time to ensure nothing breaks.

---

## The "Why" and "How"

Before adding any new UI (search omnibar, 3D signage, lighting controls), we need shared components. Otherwise, every new panel is more technical debt and inconsistency. 

`tokens.css` gives us the raw ingredients (standard colors, corner radiuses, paddings), but it doesn't enforce that "all buttons look the same". To achieve that, we need shared CSS component classes (e.g., `.ui-button`, `.ui-panel`) that consume these tokens.

---

## Phase A — Audit + Design Token Spec (✅ Complete)
**Goal**: Inventory what exists, define the token system.
- Audit completed in `docs/plans/ui-normalization-audit.md`
- Token spec defined in `docs/plans/ui-design-tokens.md`
- Tokens implemented in `client/src/ui/tokens.css`

---

## Phase B — Shared UI Components (🚧 In Progress)
**Goal**: Create utility CSS classes for common primitives so all UI elements share the exact same padding, rounding, and interaction states.

Implementation structure:
- Keep each primitive in its own file: `ui-button.css`, `ui-panel.css`, `ui-input.css`, `ui-checkbox.css`, etc.
- Use one import-only entrypoint (`client/src/ui/components/index.css`) to aggregate component styles.
- Import that entrypoint once from app root styles to avoid scattered imports.

We will create component styles for:

### B1. Interactive Elements (`.ui-button`, `.ui-input`, `.ui-checkbox`)
- **Buttons**: Standard padding (e.g., `var(--space-sm) var(--space-md)`), standard border radius (`var(--radius-md)`), standard hover states and text colors. 
- **Inputs**: Consistent borders, focus outlines (`var(--color-border-bright)`), backgrounds (`var(--surface-2)`).
- **Checkboxes/Toggles**: Consistent styling for toggles instead of native browser checkboxes.

### B2. Layout Primitives (`.ui-panel`, `.ui-header`, `.ui-divider`)
- **Panels**: Standard container with `var(--color-surface-1)`, `var(--radius-lg)`, and standard padding.
- **Headers**: Consistent typography sizing (`var(--font-size-lg)`) and bottom spacing.
- **Dividers**: Simple lines using `var(--color-border)`.

### B0. Scaffold status (implemented)
- `client/src/ui/components/index.css` created as single import entrypoint.
- `client/src/ui/components/ui-button.css` created.
- `client/src/ui/components/ui-panel.css` created.
- `client/src/ui/components/ui-input.css` created.
- `client/src/ui/components/ui-checkbox.css` created.
- `client/src/styles/main.css` now imports `../ui/components/index.css`.

### B1. First live adoption slice (implemented)
- `LightingControlsPanel.ts` refresh action now uses shared `.ui-button`.
- `LightingControlsPanel.ts` checkboxes now use shared `.ui-checkbox` for master/group/light toggles.
- `lighting-controls.css` no longer hard-overrides shared checkbox styling when `.ui-checkbox` is present.

---

## Phase C — Migrate Existing Panels (Incremental Roadmap)
**Goal**: Replace inline styles and bespoke CSS in each existing panel with the shared component classes from Phase B. 

### Visual Validation Pattern (required for panel work)
- Capture a targeted **before** screenshot for the panel/region before changing styles.
- Capture a matching **after** screenshot using the same selector after changes.
- Use `client/test/visual/screenshot.spec.ts` with `PLAYWRIGHT_SCREENSHOT_NAME` and `PLAYWRIGHT_SCREENSHOT_SELECTOR`.
- Keep results under `client/test-results/` (auto-archived in `client/test-results/archive/`).

**Order of Migration** (Working from most standalone to most integrated):
1. **Base Testing**: Convert one small panel first to test the utility classes. (e.g., `GraphicsSettingsPanel.ts`)
2. **Settings / Debug**: `LightingControlsPanel.ts` and `LayoutControlPanel.ts`
3. **Core Menus**: The Pause Menu system (`PauseMenuManager.ts` & `PauseMenuPanel.ts` & pause tabs)
4. **Data/Integration**: `SteamUIPanel.ts`
5. **Specialized UI**: `PerformanceMonitor.ts` (currently uses inline styles) and `CacheManagementUI.ts`

**Migration Rules for each step**:
- Delete bespoke CSS for standard buttons/inputs in the panel's custom `.css` file.
- Add `.ui-*` classes to the generated DOM elements.
- Verify nothing functionally broke.

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

---

## Phase F — UX Polish Items (deferred, not blocking normalization)

### F1. Scroll-to-top anchors
For any scrollable panel content that extends 300%+ of the visible panel height, add a "scroll to top" anchor/button. Design it so adding a "scroll to bottom" later is trivial (same component, different direction). Low priority — implement when panels have substantial content.

---

## Done criteria
- [ ] `docs/ui-design-tokens.md` committed
- [ ] All buttons, checkboxes, panels use shared components
- [ ] No hardcoded color/size values in UI files
- [ ] Cache previewer works
- [ ] GPU memory visible in Debug tab
- [ ] All settings checkboxes have visible effect or explicit placeholder
