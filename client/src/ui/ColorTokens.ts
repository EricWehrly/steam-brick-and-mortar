/**
 * Color tokens read live from this directory's own tokens.css --color-* custom properties (the
 * app's one real design-token source) via getComputedStyle, resolved once at module load into a
 * plain hex-string object any non-CSS-aware code can import - not specific to uikit or any other
 * consumer. uikit can't read CSS custom properties itself (its surfaces are plain three.js
 * materials/instanced meshes, not a DOM tree with a stylesheet cascade), but the need for a live
 * CSS color value in TypeScript isn't unique to uikit, hence the generic name and location.
 *
 * Covers in-world "material" surfaces (a game box's own printed-cardboard color, GameBoxPanelStyle's
 * PANEL_COLORS.surface/sleeve reusing surface3/surface2 below) as well as DOM UI chrome - this ramp
 * is the one design-token source regardless of what's consuming a color. Reuse an existing key here
 * before reaching for a bare hex literal anywhere, even for something that reads as "content" rather
 * than "UI".
 *
 * The FALLBACKS below (tokens.css's own shipped values) only kick in where getComputedStyle isn't
 * meaningful - non-browser test environments where tokens.css's <style> tag was never injected - so
 * tests keep seeing stable values without needing jsdom to load real CSS.
 */

const FALLBACKS = {
    accent: '#00aaff',
    accentBright: '#33bbff',
    accentDim: '#0088cc',

    surface1: '#1a1a1a',
    surface2: '#2a2a2a',
    surface3: '#333333',

    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textTertiary: '#888888',

    success: '#4caf50',
    warning: '#ff9800',
    error: '#dc3545',

    border: '#333333',
    borderBright: '#555555'
} as const

type ColorTokenKey = keyof typeof FALLBACKS

const CSS_VAR_NAMES: Record<ColorTokenKey, string> = {
    accent: '--color-accent',
    accentBright: '--color-accent-bright',
    accentDim: '--color-accent-dim',

    surface1: '--color-surface-1',
    surface2: '--color-surface-2',
    surface3: '--color-surface-3',

    textPrimary: '--color-text-primary',
    textSecondary: '--color-text-secondary',
    textTertiary: '--color-text-tertiary',

    success: '--color-success',
    warning: '--color-warning',
    error: '--color-error',

    border: '--color-border',
    borderBright: '--color-border-bright'
}

function readCssColorTokens(): Record<ColorTokenKey, string> {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
        return { ...FALLBACKS }
    }

    const rootStyle = getComputedStyle(document.documentElement)
    const resolved = { ...FALLBACKS } as Record<ColorTokenKey, string>

    for (const key of Object.keys(FALLBACKS) as ColorTokenKey[]) {
        const liveValue = rootStyle.getPropertyValue(CSS_VAR_NAMES[key]).trim()
        if (liveValue) {
            resolved[key] = liveValue
        }
    }

    return resolved
}

export const COLOR_TOKENS: Readonly<Record<ColorTokenKey, string>> = readCssColorTokens()
