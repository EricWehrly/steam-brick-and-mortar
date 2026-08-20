/**
 * Color tokens for the VR uikit menu system, mirroring client/src/ui/tokens.css - the app's one
 * real design-token source of truth. uikit can't read CSS custom properties directly (these are
 * plain three.js materials/instanced meshes, not a DOM tree with a stylesheet cascade), so this is
 * a hand-kept TypeScript copy of the same values. Every VR panel should import from here instead
 * of inventing its own hex literals - direct request (2026-08-20): "I'm fairly sure our colors
 * aren't being applied to these menus" turned out to mean the VR menu's ad-hoc colors didn't match
 * the app's real palette, not that colors weren't rendering at all.
 *
 * Keep this in sync with tokens.css by hand if that file's values change - there's no build-time
 * link between the two.
 */

export const UIKIT_COLORS = {
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
