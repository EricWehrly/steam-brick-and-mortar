# UI Normalization Audit

## Overview
This audit covers the current state of the UI in the Steam Brick and Mortar client. The UI is built using vanilla TypeScript and DOM manipulation, with styles split between external CSS files, template-embedded styles, and direct inline style manipulation in TypeScript.

## Component Inventory

| Component | Files | Style Method | Consistency Notes |
|-----------|-------|--------------|-------------------|
| **LightingControlsPanel** | `LightingControlsPanel.ts`, `lighting-controls-panel.css` | External CSS + Inline (visibility) | Uses a mix of specific classes and general selectors. Some hardcoded hex/rgba. |
| **PerformanceMonitorUI** | `PerformanceMonitor.ts` | **Inline Only** | Highly inconsistent with the rest of the app. Hardcoded colors like `#00ff00`, `#ffff00`, `#ff0000`. |
| **ToastManager** | `ToastManager.ts`, `toast.css` | External CSS | Relatively clean, but uses hardcoded colors in CSS. Leave as-is until later in Phase 2 — may be shut off entirely alongside other UI cleanup. Lowest priority. |
| **PauseMenu** | `PauseMenuManager.ts`, `PauseMenuPanel.ts`, `shared-components.css` | External CSS (Shared) | The most "normalized" part of the app, but still has hardcoded values in the shared CSS. |
| **GraphicsSettingsPanel** | `GraphicsSettingsPanel.ts`, `graphics-settings-panel.css` | External CSS + Template | Uses `UIComponentUtils` for setup, which helps consistency but still relies on hardcoded CSS values. |
| **CacheManagementUI** | `CacheManagementUI.ts`, `cache-management-ui.css` | External CSS | Marked as @deprecated but still contains logic. Uses its own set of styles. |
| **StartupProgressUI** | `StartupProgressUI.ts`, `StartupProgressUI.css` | External CSS | Specific to startup, uses some hardcoded blue colors. |

## Hardcoded Values

### Colors
- **Steam Blue Accents**: `#00aaff` (main), `#0088cc`, `#2a5470`, `#3d6b8a`, `#9cc4e8`, `rgba(0, 122, 204, 0.2)`
- **Backgrounds**: `rgba(0, 0, 0, 0.85)`, `rgba(40, 40, 40, 0.9)`, `rgba(30, 30, 30, 0.8)`, `#1a1a1a`, `#2a2a2a`, `#333`, `#444`
- **Status Colors**: `#4caf50` (green), `#ff9800` (orange), `#f44336`/`#dc3545` (red)
- **Borders/Dividers**: `#333`, `#444`, `#555`, `#666`
- **Text**: `white`, `#fff`, `#ccc`, `#aaa`, `#888`

### Spacing & Layout
- **Padding**: `8px 12px`, `10px 16px`, `2px 4px`, `4px 6px`
- **Border Radius**: `8px`, `6px`, `4px`, `3px`, `2px`
- **Gap/Margin**: `8px`, `6px`, `4px`, `16px`
- **Transitions**: `0.2s`, `1.3s` (variable name `--menu-transition-time` exists but is inconsistent)

### Typography
- **Families**: `Arial, sans-serif`, `Monaco, monospace`, `'Courier New', monospace`
- **Sizes**: `10px`, `11px`, `12px`, `13px`, `14px`

## Duplication & Inconsistencies
1. **Buttons**: Different implementations in `shared-components.css` (`.pause-btn`), `main.css` (`.settings-button`), and `LightingControlsPanel.ts` (`.refresh-button`).
2. **Checkboxes**: Native checkboxes are used everywhere, but styled differently (or not at all) in various panels. `UIComponentUtils` helps but doesn't solve the styling.
3. **Panels/Containers**: `LightingControlsPanel` has its own layout logic, while Pause Menu panels use a different structure.
4. **Scrolling**: `overflow-y: auto` is applied per-component with different scrollbar handling (or lack thereof).
5. **Transitions**: Panel expansion in `LightingControlsPanel` uses `1.3s`, while the rest of the UI uses `0.2s`.

## Panels Needing Normalization

All of the following need attention — not just `GraphicsSettingsPanel` and the cache panel:
- All **Pause Menu panels** (tabs + the overall menu container)
- `LightingControlsPanel`
- `CacheManagementUI` (deprecated but still live)
- `GraphicsSettingsPanel`
- `PerformanceMonitorUI` (highest inconsistency — inline-only styles)
- `StartupProgressUI`
- Binder + BinderGameDetailPanel (touched this session, partially normalized)

- Unify `PerformanceMonitorUI` to use CSS classes instead of inline styles.
- Standardize the "Steam Blue" into a single set of palette tokens.
- Create a shared `UIPanel` class/CSS to wrap these disparate control containers.
