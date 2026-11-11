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

/** uikit-default role -> app token. Roles the menu never renders keep a sensible neighbour so a
 *  future component doesn't fall back to the library's white-on-white light theme. */
const VR_MENU_THEME = {
    ...defaultThemes.default,
    background: new Color(COLOR_TOKENS.surface3),
    foreground: new Color(COLOR_TOKENS.textPrimary),
    card: new Color(COLOR_TOKENS.surface2),
    cardForeground: new Color(COLOR_TOKENS.textPrimary),
    popover: new Color(COLOR_TOKENS.surface2),
    popoverForeground: new Color(COLOR_TOKENS.textPrimary),
    primary: new Color(COLOR_TOKENS.accent),
    primaryForeground: new Color(COLOR_TOKENS.textPrimary),
    secondary: new Color(COLOR_TOKENS.surface3),
    secondaryForeground: new Color(COLOR_TOKENS.textPrimary),
    muted: new Color(COLOR_TOKENS.surface2),
    mutedForeground: new Color(COLOR_TOKENS.textSecondary),
    accent: new Color(COLOR_TOKENS.accent),
    accentForeground: new Color(COLOR_TOKENS.textPrimary),
    destructive: new Color(COLOR_TOKENS.error),
    destructiveForeground: new Color(COLOR_TOKENS.textPrimary),
    border: new Color(COLOR_TOKENS.border),
    input: new Color(COLOR_TOKENS.borderBright),
    ring: new Color(COLOR_TOKENS.accentBright),
    dark: undefined
}

setTheme(VR_MENU_THEME)
