/**
 * The VR menu's stylesheet - every size, spacing and color the menu renders with, in one file.
 * This is the uikit counterpart to a .css file: building code names a style, it never spells one
 * out. Review feedback (2026-09-09): the DOM menus separated form (template) / style (CSS) /
 * function (TS) for free, and the first uikit panels lost that - sizes and colors were declared as
 * ad-hoc consts in whichever file happened to build the node, so "how does this menu look" had no
 * single answer.
 *
 * Built on uikit's own StyleSheet/classList rather than a hand-rolled token object: components take
 * class names as their second constructor argument (`new Container(props, [MENU_CLASS.panelRoot])`)
 * and uikit resolves them out of the shared StyleSheet registry, exactly like a class attribute.
 * MENU_CLASS is exported (rather than bare strings) so a typo is a compile error, and so importing
 * a class name is what guarantees this module - and therefore the registration below - has run.
 *
 * Colors come from COLOR_TOKENS (tokens.css's --color-* ramp, the app's one design-token source),
 * never bare hex. Sizes come from the two scales below rather than per-call literals, so panels
 * can't drift apart the way the first two did (they had three different title sizes and four
 * different row gaps between them).
 */

import { StyleSheet } from '@pmndrs/uikit'
import { COLOR_TOKENS } from '../../ui/ColorTokens'

/** Type scale. uikit-px, scaled to world-meters by the root's pixelSize - see
 *  VRMenuPixelSize.ts, which owns that conversion and the user's font-scale multiplier. */
const FONT_SIZE = {
    title: 20,
    heading: 17,
    body: 16,
    label: 13,
    hint: 12
} as const

/** Spacing scale - gaps and padding. Grown from the original 10/15/12 values (direct request,
 *  2026-08-20: the panel read as "unnecessarily squished, too tight, not readable enough"). */
const SPACE = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 18,
    xl: 28
} as const

const CORNER_RADIUS = 12

/** Fixed rather than autosized to whichever tab happens to be shortest - direct request ("the
 *  settings menu can be taller ... start with the tallest page"). menuContentArea scrolls, so this
 *  is a budget, not a cap; panels themselves never self-scroll (one scroller, not nested ones). */
const MENU_WIDTH = 820
const MENU_CONTENT_HEIGHT = 640

/** Exported so other VR uikit surfaces (e.g. VRControllerPointer's cursor/beam) can render above
 *  this menu's own geometry without guessing a number that happens to be higher. */
export const ALWAYS_ON_TOP_RENDER_ORDER = 1000

/** Every style name the VR menu uses. Import these rather than writing the string inline. */
export const MENU_CLASS = {
    menuRoot: 'vrMenuRoot',
    menuTabRow: 'vrMenuTabRow',
    menuTabButton: 'vrMenuTabButton',
    menuTabButtonActive: 'vrMenuTabButtonActive',
    menuTabLabel: 'vrMenuTabLabel',
    menuTabLabelActive: 'vrMenuTabLabelActive',
    menuContentArea: 'vrMenuContentArea',

    panelRoot: 'vrMenuPanelRoot',
    panelTitle: 'vrMenuPanelTitle',
    panelNote: 'vrMenuPanelNote',

    section: 'vrMenuSection',
    sectionHeading: 'vrMenuSectionHeading',
    sectionDescription: 'vrMenuSectionDescription',

    settingRow: 'vrMenuSettingRow',
    settingRowHeader: 'vrMenuSettingRowHeader',
    settingLabel: 'vrMenuSettingLabel',
    settingValue: 'vrMenuSettingValue',

    standalonePanelRoot: 'vrStandalonePanelRoot',

    categorySection: 'vrCategorySection',
    categoryHeading: 'vrCategoryHeading',
    categoryRow: 'vrCategoryRow',
    categoryLabel: 'vrCategoryLabel',
    categoryStatusLive: 'vrCategoryStatusLive',
    categoryStatusPlanned: 'vrCategoryStatusPlanned',
    categoryStatusIdea: 'vrCategoryStatusIdea'
} as const

const ROUNDED = {
    borderTopLeftRadius: CORNER_RADIUS,
    borderTopRightRadius: CORNER_RADIUS,
    borderBottomLeftRadius: CORNER_RADIUS,
    borderBottomRightRadius: CORNER_RADIUS
}

/** Drawn over scene geometry rather than depth-sorted into it - a menu the world can occlude is
 *  worse than useless in a headset. Both properties inherit, so descendants don't repeat them. */
const ALWAYS_ON_TOP = {
    depthTest: false,
    renderOrder: ALWAYS_ON_TOP_RENDER_ORDER
}

Object.assign(StyleSheet, {
    [MENU_CLASS.menuRoot]: {
        flexDirection: 'column',
        gap: SPACE.md,
        width: MENU_WIDTH,
        backgroundColor: COLOR_TOKENS.surface1,
        ...ROUNDED,
        ...ALWAYS_ON_TOP
    },
    // flexWrap so a future tab row too long for one line wraps instead of overflowing the frame.
    [MENU_CLASS.menuTabRow]: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACE.sm,
        width: '100%',
        padding: SPACE.md
    },
    [MENU_CLASS.menuTabButton]: { backgroundColor: 'transparent' },
    [MENU_CLASS.menuTabButtonActive]: { backgroundColor: COLOR_TOKENS.surface3 },
    [MENU_CLASS.menuTabLabel]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.textSecondary },
    [MENU_CLASS.menuTabLabelActive]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.textPrimary },
    [MENU_CLASS.menuContentArea]: {
        flexDirection: 'column',
        width: '100%',
        height: MENU_CONTENT_HEIGHT,
        overflow: 'scroll'
    },

    [MENU_CLASS.panelRoot]: {
        flexDirection: 'column',
        gap: SPACE.lg,
        padding: SPACE.xl,
        width: '100%'
    },
    [MENU_CLASS.panelTitle]: { fontSize: FONT_SIZE.title, color: COLOR_TOKENS.textPrimary },
    [MENU_CLASS.panelNote]: { fontSize: FONT_SIZE.hint, color: COLOR_TOKENS.textTertiary },

    [MENU_CLASS.section]: { flexDirection: 'column', gap: SPACE.lg, width: '100%' },
    [MENU_CLASS.sectionHeading]: { fontSize: FONT_SIZE.heading, color: COLOR_TOKENS.textPrimary },
    [MENU_CLASS.sectionDescription]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.textTertiary },

    [MENU_CLASS.settingRow]: { flexDirection: 'column', gap: SPACE.sm, width: '100%' },
    [MENU_CLASS.settingRowHeader]: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    [MENU_CLASS.settingLabel]: { fontSize: FONT_SIZE.body, color: COLOR_TOKENS.textPrimary },
    [MENU_CLASS.settingValue]: { fontSize: FONT_SIZE.body, color: COLOR_TOKENS.textPrimary },

    // A panel that is its own world-positioned root rather than a tab inside the menu shell, so it
    // carries the frame/always-on-top chrome menuRoot would otherwise have given it.
    [MENU_CLASS.standalonePanelRoot]: {
        flexDirection: 'column',
        gap: SPACE.xs,
        padding: SPACE.lg,
        backgroundColor: COLOR_TOKENS.surface1,
        ...ROUNDED,
        ...ALWAYS_ON_TOP
    },

    // The category-reference tool's denser reference-table look: tighter rows than a settings
    // panel, accent-colored headings, and a status color per row. Mirrors what
    // category-reference-panel.css does for the DOM implementation of the same content.
    [MENU_CLASS.categorySection]: { flexDirection: 'column', gap: SPACE.xs, width: '100%' },
    [MENU_CLASS.categoryHeading]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.accent },
    [MENU_CLASS.categoryRow]: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    [MENU_CLASS.categoryLabel]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.textPrimary },
    [MENU_CLASS.categoryStatusLive]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.success },
    [MENU_CLASS.categoryStatusPlanned]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.warning },
    // "idea" isn't an error, so it reads as muted rather than being forced into the error color.
    [MENU_CLASS.categoryStatusIdea]: { fontSize: FONT_SIZE.label, color: COLOR_TOKENS.textTertiary }
})
