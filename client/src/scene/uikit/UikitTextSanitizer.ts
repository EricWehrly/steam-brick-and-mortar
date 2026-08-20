/**
 * uikit's default msdf font can only render a limited glyph set - confirmed empirically, and
 * repeatedly: a plain em-dash first, now emoji section-heading icons and a middle-dot tab
 * separator all log "Missing glyph info for character ..." every single frame (buildGlyphLayout
 * re-runs each frame while a panel is open) rather than failing once. Settings schema content
 * (SettingsSchema.ts) and VR tab labels (VRMenuTabRegistry.ts) are shared with or modeled after
 * DOM text, which has no such restriction (real fonts, full Unicode, emoji included) - so text
 * that's perfectly fine on the DOM side needs sanitizing before it reaches a uikit Text. This is
 * the single choke point for that, rather than fixing each new unsupported character as it's
 * separately discovered.
 */

const NON_PRINTABLE_ASCII = /[^\x20-\x7E]/g

export function toUikitSafeText(text: string): string {
    return text.replace(NON_PRINTABLE_ASCII, '').replace(/\s+/g, ' ').trim()
}
