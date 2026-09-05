/**
 * Color tokens for the VR uikit menu system, read live from client/src/ui/tokens.css's --color-*
 * custom properties (the app's one real design-token source) via getComputedStyle. uikit can't
 * read CSS custom properties itself - these become plain three.js materials/instanced meshes, not
 * a DOM tree with a stylesheet cascade - so this resolves each token once, at module load, into a
 * plain hex-string object every VR panel imports instead of inventing its own hex literals.
 *
 * This used to be a hand-kept copy of tokens.css's values, which could silently drift. Reading the
 * computed values directly means it can't drift - change tokens.css and the VR menu follows, no
 * second edit required. The FALLBACKS below (tokens.css's own shipped values) only kick in where
 * getComputedStyle isn't meaningful - non-browser test environments where tokens.css's <style> tag
 * was never injected - so tests keep seeing the same stable values without needing jsdom to load
 * real CSS.
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

type UikitColorKey = keyof typeof FALLBACKS

const CSS_VAR_NAMES: Record<UikitColorKey, string> = {
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

function readCssColorTokens(): Record<UikitColorKey, string> {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
        return { ...FALLBACKS }
    }

    const rootStyle = getComputedStyle(document.documentElement)
    const resolved = { ...FALLBACKS } as Record<UikitColorKey, string>

    for (const key of Object.keys(FALLBACKS) as UikitColorKey[]) {
        const liveValue = rootStyle.getPropertyValue(CSS_VAR_NAMES[key]).trim()
        if (liveValue) {
            resolved[key] = liveValue
        }
    }

    return resolved
}

export const UIKIT_COLORS: Readonly<Record<UikitColorKey, string>> = readCssColorTokens()
