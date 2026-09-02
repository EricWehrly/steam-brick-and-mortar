/**
 * uikit's default msdf font can only render a limited glyph set - confirmed empirically, and
 * repeatedly: a plain em-dash, emoji section-heading icons and a middle-dot separator all log
 * "Missing glyph info for character ..." every single frame (buildGlyphLayout re-runs each frame
 * while a panel is visible) rather than failing once. Text sourced from Steam or shared with DOM
 * surfaces has no such restriction, so it needs sanitizing before it reaches a uikit Text. This is
 * the single choke point for that, rather than fixing each new unsupported character as it's
 * separately discovered.
 */

const NON_PRINTABLE_ASCII = /[^\x20-\x7E]/g
// Same set, but newlines survive - see toUikitSafeMultilineText().
const NON_PRINTABLE_ASCII_EXCEPT_NEWLINE = /[^\x20-\x7E\n]/g

export function toUikitSafeText(text: string): string {
    return text.replace(NON_PRINTABLE_ASCII, '').replace(/\s+/g, ' ').trim()
}

/** For text rendered with whiteSpace:'pre' (the game box's cache-entry JSON viewport), where line
 *  structure is the whole point - so unlike toUikitSafeText() this can't collapse whitespace. */
export function toUikitSafeMultilineText(text: string): string {
    return text.replace(NON_PRINTABLE_ASCII_EXCEPT_NEWLINE, '')
}
