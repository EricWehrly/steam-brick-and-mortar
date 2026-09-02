/** Layout fragments shared by more than one game-box face. Each returns a detached Container the
 *  caller adds where it wants; sections with nothing to show return null so callers can skip them
 *  without also having to check emptiness themselves. */

import { Container, Text } from '@pmndrs/uikit'
import { toUikitSafeText } from '../../uikit/UikitTextSanitizer'
import { BODY_FONT_SIZE, LABEL_FONT_SIZE, PANEL_COLORS } from './GameBoxPanelStyle'

const SECTION_GAP = 4
const CHIP_GAP = 4
const CHIP_PADDING_X = 5
const CHIP_PADDING_Y = 2
const CHIP_RADIUS = 4
const COMING_SOON_ROW_GAP = 6

/** A labelled row of chips ("TAGS: [Action] [Indie] ..."). Real wrapping chips rather than one
 *  joined string - the canvas version could only manage the latter. */
export function buildChipSection(label: string, items: readonly string[] | undefined, color: string): Container | null {
    if (!items || items.length === 0) {
        return null
    }

    const section = new Container({ flexDirection: 'column', gap: SECTION_GAP, width: '100%' })
    section.add(new Text({ text: label, fontSize: LABEL_FONT_SIZE, color: PANEL_COLORS.label }))

    const chipRow = new Container({ flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP, width: '100%' })
    for (const item of items) {
        chipRow.add(buildChip(item, color))
    }
    section.add(chipRow)

    return section
}

function buildChip(text: string, color: string): Container {
    const chip = new Container({
        paddingLeft: CHIP_PADDING_X,
        paddingRight: CHIP_PADDING_X,
        paddingTop: CHIP_PADDING_Y,
        paddingBottom: CHIP_PADDING_Y,
        borderTopLeftRadius: CHIP_RADIUS,
        borderTopRightRadius: CHIP_RADIUS,
        borderBottomLeftRadius: CHIP_RADIUS,
        borderBottomRightRadius: CHIP_RADIUS,
        backgroundColor: PANEL_COLORS.border
    })
    chip.add(new Text({ text: toUikitSafeText(text), fontSize: LABEL_FONT_SIZE, color }))
    return chip
}

/** "Screenshots ......... coming soon" rows - sections with no data source wired up yet (see
 *  docs/plans/game-box-store-data-research.md). */
export function buildComingSoonRows(rows: readonly string[]): Container {
    const list = new Container({ flexDirection: 'column', gap: COMING_SOON_ROW_GAP, width: '100%' })
    for (const row of rows) {
        const line = new Container({ flexDirection: 'row', justifyContent: 'space-between', width: '100%' })
        line.add(new Text({ text: toUikitSafeText(row), fontSize: BODY_FONT_SIZE, color: PANEL_COLORS.label }))
        line.add(new Text({ text: 'coming soon', fontSize: LABEL_FONT_SIZE, color: PANEL_COLORS.muted }))
        list.add(line)
    }
    return list
}

/** A single line of body text, omitted entirely when there's nothing to show. */
export function buildTextLine(text: string | undefined, color: string): Text | null {
    if (!text) {
        return null
    }
    return new Text({ text: toUikitSafeText(text), fontSize: BODY_FONT_SIZE, color })
}
