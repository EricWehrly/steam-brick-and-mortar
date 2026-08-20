/**
 * VR port of CategoryReferencePanel (client/src/ui/CategoryReferencePanel.ts) - not part of the
 * Tier 1 pause-menu migration (docs/plans/vr-uikit-menu-migration-plan.md), built specifically to
 * pilot `world-lock` anchoring on real, non-settings content (see that plan's "world-lock trial
 * via CategoryReferencePanel" section). Renders the same STEAM_GENRE_CATEGORIES/META_CATEGORIES/
 * SORT_DIMENSIONS data the DOM panel exports, rather than re-hardcoding it - same "one source, two
 * renderers" reasoning as SettingsSchema, just without a shared schema type since this content is
 * read-only reference data, not editable settings.
 */

import { Container, Text } from '@pmndrs/uikit'
import { STEAM_GENRE_CATEGORIES, META_CATEGORIES, SORT_DIMENSIONS, type CategoryEntry } from '../../../ui/CategoryReferencePanel'
import { toUikitSafeText } from '../UikitTextSanitizer'

const PANEL_PADDING = 20
const SECTION_GAP = 18
const ROW_GAP = 4
const TITLE_FONT_SIZE = 18
const SECTION_HEADING_FONT_SIZE = 13
const SECTION_HEADING_COLOR = '#aac4ff'
const ROW_LABEL_FONT_SIZE = 13
const ROW_LABEL_COLOR = '#e8e8e8'
// Mirrors category-reference-panel.css's .cat-row--<status> .cat-status colors.
const STATUS_COLOR: Record<CategoryEntry['status'], string> = {
    live: '#5dd',
    planned: '#fd8',
    idea: '#a88'
}
const SCROLL_HEIGHT = 460

export class VRCategoryReferencePanel {
    readonly container: Container

    constructor() {
        this.container = this.build()
    }

    private build(): Container {
        const root = new Container({ flexDirection: 'column', gap: ROW_GAP, padding: PANEL_PADDING, width: '100%' })
        root.add(new Text({ text: 'Category Reference', fontSize: TITLE_FONT_SIZE, color: '#ffffff' }))

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
