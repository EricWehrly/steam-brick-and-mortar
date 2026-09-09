/**
 * The one uikit-px -> world-meters conversion for VR menu surfaces, and the user's scale multiplier
 * on top of it. Separate from VRMenuStyleSheet.ts because this is the only "style" value that isn't
 * static: it reads a live setting, so it can't be baked into a StyleSheet entry.
 *
 * pixelSize is an inherited uikit property, so setting it on a root cascades to every descendant -
 * which is what makes one slider rescale a whole panel. A child that sets its own pixelSize opts
 * out of that cascade permanently (a node's own properties outrank inherited ones), so only roots
 * should ever set it.
 */

import type { AppSettings } from '../../core/AppSettings'

/** Bumped from 0.0008, then 0.0011 to 0.0015 (direct request, 2026-09-05: "this UI is still blurry
 *  ... needs hopefully the base font size cranked" - confirmed live in-browser that a bigger base
 *  pixelSize is genuinely what fixes it, not a post-processing or msdf-atlas issue). Every uikit-px
 *  (text, gaps, padding, controls) scales off this one factor, so it's the single lever for "the
 *  whole panel reads too small/soft," not a per-row font tweak. */
const BASE_MENU_PIXEL_SIZE = 0.0015

/** The base above, scaled by the user's own uiFontScale setting (Display/UI tab, direct request
 *  2026-09-05: "let's add UI font scaling please. We need it now."). */
export function resolveMenuPixelSize(appSettings: AppSettings): number {
    return BASE_MENU_PIXEL_SIZE * appSettings.getSetting('uiFontScale')
}
