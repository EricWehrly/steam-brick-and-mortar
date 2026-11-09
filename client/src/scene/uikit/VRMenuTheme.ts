/**
 * Points @pmndrs/uikit-default's theme at the app palette (COLOR_TOKENS), so its components - tabs,
 * switch, toggle group, slider, dialog buttons - render their active/checked/hover states in app
 * colors natively. Without this their state colors are hardcoded in TypeScript against the library's
 * own greyscale theme, and the only override is a class, which paints every state the same.
 *
 * Importing this module applies the theme; VRMenuStyleSheet does so alongside registering the CSS.
 */

import { setTheme, defaultThemes } from '@pmndrs/uikit-default'
import { Color } from 'three'
import { COLOR_TOKENS } from '../../ui/ColorTokens'

const color = (hex: string): Color => new Color(hex)

/** uikit-default role -> app token. Roles the menu never renders keep a sensible neighbour so a
 *  future component doesn't fall back to the library's white-on-white light theme. */
const VR_MENU_THEME = {
    ...defaultThemes.default,
    background: color(COLOR_TOKENS.surface3),
    foreground: color(COLOR_TOKENS.textPrimary),
    card: color(COLOR_TOKENS.surface2),
    cardForeground: color(COLOR_TOKENS.textPrimary),
    popover: color(COLOR_TOKENS.surface2),
    popoverForeground: color(COLOR_TOKENS.textPrimary),
    primary: color(COLOR_TOKENS.accent),
    primaryForeground: color(COLOR_TOKENS.textPrimary),
    secondary: color(COLOR_TOKENS.surface3),
    secondaryForeground: color(COLOR_TOKENS.textPrimary),
    muted: color(COLOR_TOKENS.surface2),
    mutedForeground: color(COLOR_TOKENS.textSecondary),
    accent: color(COLOR_TOKENS.accent),
    accentForeground: color(COLOR_TOKENS.textPrimary),
    destructive: color(COLOR_TOKENS.error),
    destructiveForeground: color(COLOR_TOKENS.textPrimary),
    border: color(COLOR_TOKENS.border),
    input: color(COLOR_TOKENS.borderBright),
    ring: color(COLOR_TOKENS.accentBright),
    dark: undefined
}

setTheme(VR_MENU_THEME)
