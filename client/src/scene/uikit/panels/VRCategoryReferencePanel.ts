/**
 * VR port of CategoryReferencePanel (client/src/ui/CategoryReferencePanel.ts). Renders the same
 * STEAM_GENRE_CATEGORIES/META_CATEGORIES/SORT_DIMENSIONS data the DOM panel exports, rather than
 * re-hardcoding it - same "one source, two renderers" reasoning as SettingsSchema, just without a
 * shared schema type since this content is read-only reference data, not editable settings.
 *
 * Owns its own root styling (background/border-radius/depthTest/renderOrder/pixelSize) rather than
 * inheriting it from a shared shell - it's not a tab inside VRSettingsMenuShell. Originally tried
 * as a tab there, piloting `world-lock` anchoring on the whole settings menu; that was a
 * misunderstanding (direct correction, 2026-08-20) - the trial was meant to place *this* panel as
 * its own standalone world-positioned object, leaving the settings menu on `camera-attached` as
 * before. See VRCategoryReferenceCoordinator.ts, which owns that placement.
 */

import { Container, Text } from '@pmndrs/uikit'
import { STEAM_GENRE_CATEGORIES, META_CATEGORIES, SORT_DIMENSIONS, type CategoryEntry } from '../../../ui/CategoryReferencePanel'
import { toUikitSafeText } from '../UikitTextSanitizer'
import { UIKIT_COLORS } from '../UikitColorTokens'
import { ALWAYS_ON_TOP_RENDER_ORDER } from '../VRSettingsMenuShell'

const SHELL_PIXEL_SIZE = 0.0008
const PANEL_WIDTH = 480
const PANEL_PADDING = 20
const SECTION_GAP = 18
const ROW_GAP = 4
const TITLE_FONT_SIZE = 18
const SECTION_HEADING_FONT_SIZE = 13
const SECTION_HEADING_COLOR = UIKIT_COLORS.accent
const ROW_LABEL_FONT_SIZE = 13
const ROW_LABEL_COLOR = UIKIT_COLORS.textPrimary
// Mirrors category-reference-panel.css's .cat-row--<status> intent (live/planned/idea), sourced
// from tokens.css's status colors - "idea" isn't really an error, so it maps to the muted
// tertiary-text tone rather than being forced into the error color.
const STATUS_COLOR: Record<CategoryEntry['status'], string> = {
    live: UIKIT_COLORS.success,
    planned: UIKIT_COLORS.warning,
    idea: UIKIT_COLORS.textTertiary
}
const SCROLL_HEIGHT = 460

export class VRCategoryReferencePanel {
    readonly container: Container

    constructor() {
        this.container = this.build()
    }

    private build(): Container {
        const root = new Container({
            flexDirection: 'column',
            gap: ROW_GAP,
            padding: PANEL_PADDING,
            width: PANEL_WIDTH,
            pixelSize: SHELL_PIXEL_SIZE,
            depthTest: false,
            renderOrder: ALWAYS_ON_TOP_RENDER_ORDER,
            backgroundColor: UIKIT_COLORS.surface1,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12
        })
        root.add(new Text({ text: 'Category Reference', fontSize: TITLE_FONT_SIZE, color: UIKIT_COLORS.textPrimary }))

        const scroll = new Container({
            flexDirection: 'column',
            gap: SECTION_GAP,
            width: '100%',
            height: SCROLL_HEIGHT,
            overflow: 'scroll'
        })
        scroll.add(this.buildSection('Steam Genres', STEAM_GENRE_CATEGORIES))
        scroll.add(this.buildSection('Meta / Library-State Categories', META_CATEGORIES))
        scroll.add(this.buildSection('Sort Dimensions', SORT_DIMENSIONS))
        root.add(scroll)

        return root
    }

    private buildSection(heading: string, entries: readonly CategoryEntry[]): Container {
        const section = new Container({ flexDirection: 'column', gap: ROW_GAP, width: '100%' })
        section.add(new Text({
            text: toUikitSafeText(`${heading.toUpperCase()} (${entries.length})`),
            fontSize: SECTION_HEADING_FONT_SIZE,
            color: SECTION_HEADING_COLOR
        }))
        for (const entry of entries) {
            section.add(this.buildRow(entry))
        }
        return section
    }

    private buildRow(entry: CategoryEntry): Container {
        const row = new Container({ flexDirection: 'row', justifyContent: 'space-between', width: '100%' })
        row.add(new Text({ text: toUikitSafeText(entry.label), fontSize: ROW_LABEL_FONT_SIZE, color: ROW_LABEL_COLOR }))
        row.add(new Text({ text: entry.status, fontSize: ROW_LABEL_FONT_SIZE, color: STATUS_COLOR[entry.status] }))
        return row
    }
}
