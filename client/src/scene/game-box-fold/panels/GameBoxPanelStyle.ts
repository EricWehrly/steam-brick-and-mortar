/**
 * The shared "page" every game-box face is laid out on, plus its type scale and palette.
 *
 * PANEL_WIDTH_PX x PANEL_HEIGHT_PX is a uikit-px page that maps exactly onto one physical face
 * (BOX_WIDTH x BOX_HEIGHT metres) through PANEL_PIXEL_SIZE - all three derived from the real box
 * dimensions, so a face-size change can't silently leave the page the wrong shape. Every layout
 * number in ./ is therefore readable as "pixels on a 300x400 page".
 *
 * Panels depth-test normally (no depthTest:false / always-on-top render order, unlike a floating
 * overlay menu would need): they sit flush on a real surface that hinges through the scene, so they
 * should occlude and be occluded like the geometry they're mounted to.
 */

import { BOX_WIDTH, BOX_HEIGHT } from '../GameBoxFoldDimensions'
import { COLOR_TOKENS } from '../../../ui/ColorTokens'

// Reuses the EXISTING surface ramp (tokens.css's deepest->lightest ladder) rather than a bare hex
// literal or new box-specific tokens: surface3 (lightest) reads as the box's own steam-gray
// material, surface2 (one step deeper) is the "nested panel" shade already meant for exactly this
// depth-behind-the-surface look, reused here for the store panel's sleeve. Re-exported under these
// names (not just inlined into PANEL_COLORS below) so GameBoxFoldModel's plainMaterial imports a
// name that reads as "the box's own material," rather than a bare COLOR_TOKENS.surface3 that
// doesn't obviously read as box-relevant two files away.
export const BOX_SURFACE_GRAY = COLOR_TOKENS.surface3
const BOX_SLEEVE_GRAY = COLOR_TOKENS.surface2

export const PANEL_WIDTH_PX = 300
export const PANEL_HEIGHT_PX = PANEL_WIDTH_PX * (BOX_HEIGHT / BOX_WIDTH)
export const PANEL_PIXEL_SIZE = BOX_WIDTH / PANEL_WIDTH_PX

export const PANEL_PADDING = 14

export const TITLE_FONT_SIZE = 20
export const BODY_FONT_SIZE = 12
export const LABEL_FONT_SIZE = 10
export const MONO_FONT_SIZE = 9
export const BODY_LINE_HEIGHT = 15

/**
 * Section accents carried over from the canvas panels this replaced, where they were bare hex
 * literals. They aren't in tokens.css - it has no vocabulary for "the genres section" - so they
 * stay local rather than being forced into a semantic token that doesn't mean this; see
 * docs/tech-debt.md's game-box-color-centralization entry if that changes. Everything else here -
 * text, borders, and the box's own surface/sleeve material (BOX_SURFACE_GRAY/BOX_SLEEVE_GRAY
 * above) - comes from tokens.css via COLOR_TOKENS.
 */
export const PANEL_COLORS = {
    surface: BOX_SURFACE_GRAY,
    sleeve: BOX_SLEEVE_GRAY,
    border: COLOR_TOKENS.border,

    title: COLOR_TOKENS.textPrimary,
    body: COLOR_TOKENS.textSecondary,
    label: COLOR_TOKENS.textTertiary,
    muted: '#555555',

    play: '#5fae5f',
    rating: '#e0c15a',
    metacritic: '#66cc33',
    genres: '#c9a0ff',
    tags: '#8fc7ff',
    features: '#a0d8a0',
    collections: '#e0a0e0',
    json: '#8fd68f'
} as const

/** Root properties every face shares - one full page, opaque, laid out top-down. */
export const PANEL_ROOT_PROPERTIES = {
    flexDirection: 'column',
    width: PANEL_WIDTH_PX,
    height: PANEL_HEIGHT_PX,
    pixelSize: PANEL_PIXEL_SIZE,
    backgroundColor: PANEL_COLORS.surface
} as const
