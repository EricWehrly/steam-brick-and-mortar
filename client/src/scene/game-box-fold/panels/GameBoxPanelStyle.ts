/**
 * The shared "page" every game-box face is laid out on, plus its type scale and palette.
 *
 * PANEL_WIDTH_PX x PANEL_HEIGHT_PX is a uikit-px page that maps exactly onto one physical face
 * (BOX_WIDTH x BOX_HEIGHT metres) through PANEL_PIXEL_SIZE - all three derived from the real box
 * dimensions, so a face-size change can't silently leave the page the wrong shape. Every layout
 * number in ./ is therefore readable as "pixels on a 300x400 page".
 *
 * Panels depth-test normally (no depthTest:false / ALWAYS_ON_TOP_RENDER_ORDER, unlike the floating
 * VR settings menu): they sit flush on a real surface that hinges through the scene, so they should
 * occlude and be occluded like the geometry they're mounted to.
 */

import { BOX_WIDTH, BOX_HEIGHT } from '../GameBoxFoldDimensions'
import { UIKIT_COLORS } from '../../uikit/UikitColorTokens'

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
 * stay local rather than being forced into a semantic token that doesn't mean this.
 * Structural roles (surface, text, borders) do come from tokens.css via UIKIT_COLORS.
 */
export const PANEL_COLORS = {
    surface: UIKIT_COLORS.surface1,
    sleeve: '#241f1a',
    border: UIKIT_COLORS.border,

    title: UIKIT_COLORS.textPrimary,
    body: UIKIT_COLORS.textSecondary,
    label: UIKIT_COLORS.textTertiary,
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
