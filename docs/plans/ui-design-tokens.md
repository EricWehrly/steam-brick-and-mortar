# UI Design Tokens — Phase 1

## Overview
This document defines the system of CSS custom properties (tokens) that will be used to normalize the UI of the Steam Brick and Mortar client. These tokens are based on the existing visual direction: dark, Steam-inspired blue accents, and clean typography.

## Token Definition

### Palette

#### Brand & Accent
```css
--color-accent: #00aaff;          /* Primary Steam-inspired blue */
--color-accent-bright: #33bbff;   /* Hover / Active state for accent */
--color-accent-dim: #0088cc;      /* Secondary / Muted accent */
--color-accent-gradient: linear-gradient(135deg, #2a5470 0%, #1e3a52 100%);
```

#### Surface Colors (Backgrounds)
```css
--color-surface-0: #000000;       /* Base layer / Pure black */
--color-surface-1: #1a1a1a;       /* Deep panel background */
--color-surface-2: #2a2a2a;       /* Nested panel / Input background */
--color-surface-3: #333333;       /* Divider / Border / Hover background */
--color-surface-overlay: rgba(0, 0, 0, 0.85); /* Semi-transparent panel overlay */
```

#### Text Colors
```css
--color-text-primary: #ffffff;    /* Main headers and body text */
--color-text-secondary: #cccccc;  /* Muted / Secondary labels */
--color-text-tertiary: #888888;   /* Disabled / Footnote / Low priority */
--color-text-accent: var(--color-accent);
```

#### Status Colors
```css
--color-success: #4caf50;         /* Success / Good Performance */
--color-warning: #ff9800;         /* Warning / Moderate Performance */
--color-error: #dc3545;           /* Error / Poor Performance */
```

#### Borders & Outlines
```css
--color-border: #333333;          /* Standard border color */
--color-border-bright: #555555;   /* Active / Focused border color */
```

### Spacing & Layout

#### Spacing Steps
```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
```

#### Dimensions
```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--panel-width-narrow: 240px;
--panel-width-standard: 320px;
```

### Typography

#### Font Families
```css
--font-family-ui: Arial, sans-serif;
--font-family-mono: 'Courier New', Monaco, monospace;
```

#### Font Sizes
```css
--font-size-xs: 10px;
--font-size-sm: 12px;
--font-size-md: 14px;
--font-size-lg: 16px;
--font-size-xl: 20px;
```

### Animation

#### Durations
```css
--duration-fast: 0.1s;
--duration-standard: 0.2s;
--duration-slow: 0.4s;
--duration-menu: 1.3s; /* Current panel transition duration */
```

## Rationale & Usage

1. **Hierarchy**: Surfaces (`--color-surface-X`) are ordered from deepest (0) to lightest (3) to create visual depth.
2. **Steam Accent**: The blue accent is the primary brand identifier. It should be used sparingly for primary actions, toggles, and headers.
3. **Accessibility**: Text colors must maintain high contrast against surfaces. `--color-text-primary` on `--color-surface-1` is the standard.
4. **Transition from Hardcoded**: When migrating, any hardcoded `#333` should become `var(--color-surface-3)` or `var(--color-border)`. Any `rgba(0,0,0,0.85)` should become `var(--color-surface-overlay)`.
