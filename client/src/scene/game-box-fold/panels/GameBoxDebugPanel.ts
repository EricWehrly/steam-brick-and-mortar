/**
 * Second-flap face: the store-page-style content that doesn't fit the front cover or the store
 * panel - description, rating, metacritic, genres, tags and features (each moved here by explicit
 * request through 2026-08-20) - followed by a visually distinct, deliberately minor "cache entry"
 * section holding the raw JSON this box's content was built from.
 *
 * That JSON sits in a uikit overflow:'scroll' viewport, which is the whole reason scrolling here no
 * longer needs gating: only the viewport scrolls, because only the viewport is scrollable. The
 * canvas version had to hit-test a wheel event's position against a remembered Y to stop the
 * description and chip rows above from scrolling the JSON too.
 *
 * The sections column above the cache entry is its OWN bounded, scrollable area rather than a
 * plain flex child sized however it happens to come out. Left unbounded, a verbose game's content
 * (description + rating + metacritic + genres + tags + an uncapped features list - see
 * GameBoxFoldCoordinator's MAX_FEATURES_SHOWN cap, added alongside this) could exceed the fixed
 * page height, and content that overflows a fixed-height flex column here visibly overlapped the
 * cache viewport below it rather than merely clipping (direct request, 2026-09-02: "the visuals
 * are very crowded"). A capped, scrollable area degrades to a scrollbar instead.
 */

import { Container, Text } from '@pmndrs/uikit'
import type { GameBoxFoldContent } from '../GameBoxFoldContent'
import { buildChipSection, buildTextLine } from './GameBoxPanelParts'
import { toUikitSafeMultilineText } from '../../uikit/UikitTextSanitizer'
import {
    BODY_LINE_HEIGHT, LABEL_FONT_SIZE, MONO_FONT_SIZE,
    PANEL_COLORS, PANEL_PADDING, PANEL_ROOT_PROPERTIES
} from './GameBoxPanelStyle'

const SECTION_GAP = 8
// The description gets a fixed share of the face rather than pushing everything below it around
// from game to game - overflow:'hidden' clips a long one instead.
const DESCRIPTION_MAX_LINES = 5
const SECTIONS_MAX_HEIGHT = 220
const DIVIDER_HEIGHT = 1
// Fixed, not flexGrow - direct request (2026-09-02: "the cache entry needs to be smaller until we
// can put it on a separate screen"). A flexGrow share of whatever's left over also meant its
// available height could shrink toward zero once the sections above it ran long, which was part
// of the same overlap this file's class doc comment describes.
const CACHE_VIEWPORT_HEIGHT = 70

export class GameBoxDebugPanel {
    readonly container: Container

    private readonly sections: Container
    private readonly cacheText: Text

    constructor() {
        this.sections = new Container({ flexDirection: 'column', gap: SECTION_GAP, width: '100%' })
        this.cacheText = new Text({
            text: '',
            fontSize: MONO_FONT_SIZE,
            color: PANEL_COLORS.json,
            whiteSpace: 'pre'
        })
        this.container = this.build()
    }

    setContent(content: GameBoxFoldContent | null): void {
        this.sections.clear()

        const description = buildTextLine(content?.description, PANEL_COLORS.body)
        if (description) {
            // verticalAlign:'top' - uikit's own Text default is 'middle', which combined with
            // this area's overflow:'hidden' clip meant a description longer than
            // DESCRIPTION_MAX_LINES was centered then clipped top AND bottom, starting mid-
            // sentence rather than at the start (direct request, 2026-09-02: "needs to start at
            // the start if it's scrollable, not the end or the weird middle its at").
            description.setProperties({ verticalAlign: 'top' })
            const descriptionArea = new Container({
                width: '100%',
                maxHeight: DESCRIPTION_MAX_LINES * BODY_LINE_HEIGHT,
                overflow: 'hidden'
            })
            descriptionArea.add(description)
            this.sections.add(descriptionArea)
        }

        const rating = buildTextLine(content?.rating, PANEL_COLORS.rating)
        if (rating) {
            this.sections.add(rating)
        }
        const metacritic = buildTextLine(content?.metacritic, PANEL_COLORS.metacritic)
        if (metacritic) {
            this.sections.add(metacritic)
        }

        for (const section of [
            buildChipSection('GENRES', content?.genres, PANEL_COLORS.genres),
            buildChipSection('TAGS', content?.tags, PANEL_COLORS.tags),
            buildChipSection('FEATURES', content?.categories, PANEL_COLORS.features)
        ]) {
            if (section) {
                this.sections.add(section)
            }
        }

        this.cacheText.setProperties({ text: toUikitSafeMultilineText(content?.debugJson ?? '') })
    }

    private build(): Container {
        const root = new Container({
            ...PANEL_ROOT_PROPERTIES,
            padding: PANEL_PADDING,
            gap: SECTION_GAP
        })

        const sectionsArea = new Container({
            width: '100%',
            maxHeight: SECTIONS_MAX_HEIGHT,
            overflow: 'scroll',
            scrollbarColor: PANEL_COLORS.border,
            scrollbarWidth: 3
        })
        sectionsArea.add(this.sections)
        root.add(sectionsArea)

        root.add(new Container({ width: '100%', height: DIVIDER_HEIGHT, backgroundColor: PANEL_COLORS.border }))
        root.add(new Text({ text: 'CACHE ENTRY', fontSize: LABEL_FONT_SIZE, color: PANEL_COLORS.label }))

        const viewport = new Container({
            width: '100%',
            height: CACHE_VIEWPORT_HEIGHT,
            overflow: 'scroll',
            scrollbarColor: PANEL_COLORS.border,
            scrollbarWidth: 3
        })
        viewport.add(this.cacheText)
        root.add(viewport)

        return root
    }
}
