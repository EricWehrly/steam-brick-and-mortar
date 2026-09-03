/**
 * Second-flap face: the store-page-style content that doesn't fit the front cover or the store
 * panel - description, rating, metacritic, genres and tags (each moved here by explicit request
 * through 2026-08-20) - followed by a visually distinct, deliberately minor "cache entry" section
 * holding the raw JSON this box's content was built from.
 *
 * That JSON sits in a uikit overflow:'scroll' viewport, which is the whole reason scrolling here no
 * longer needs gating: only the viewport scrolls, because only the viewport is scrollable. The
 * canvas version had to hit-test a wheel event's position against a remembered Y to stop the
 * description and chip rows above from scrolling the JSON too.
 *
 * The sections column above the cache entry is its OWN bounded, scrollable area rather than a
 * plain flex child sized however it happens to come out. Left unbounded, a verbose game's content
 * could exceed the fixed page height, and content that overflows a fixed-height flex column here
 * visibly overlapped the cache viewport below it rather than merely clipping (direct request,
 * 2026-09-02: "the visuals are very crowded"). A capped, scrollable area degrades to a scrollbar
 * instead.
 */

import { Container, Text } from '@pmndrs/uikit'
import type { GameBoxFoldContent } from '../GameBoxFoldContent'
import { buildChipSection, buildTextLine } from './GameBoxPanelParts'
import { toUikitSafeMultilineText } from '../../uikit/UikitTextSanitizer'
import {
    BODY_LINE_HEIGHT, LABEL_FONT_SIZE, MONO_FONT_SIZE,
    PANEL_COLORS, PANEL_PADDING, PANEL_ROOT_PROPERTIES
} from './GameBoxPanelStyle'

// More breathing room between rows than the box's other faces get away with - direct request
// (2026-09-02: "vertical spacing between items on the right side").
const SECTION_GAP = 14
// More allowance than a single tight budget - direct request (2026-09-02: "give a little more
// vertical space allowance for description"). overflow:'hidden' still clips a description longer
// than this rather than pushing the sections below it around from game to game.
const DESCRIPTION_MAX_LINES = 8
const SECTIONS_MAX_HEIGHT = 260
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

        // TD: game-box-features-icon-display - a plain chip row of Steam's raw category strings
        // ("Full controller support", "Steam Cloud", ...) wasn't pulling its weight next to
        // GENRES/TAGS - direct request (2026-09-02: "the features section isn't that helpful. We
        // need to deliberately park it until we can represent it with icons"). content.categories
        // is still built (deduped) by GameBoxFoldCoordinator; only the display is parked.
        for (const section of [
            buildChipSection('GENRES', content?.genres, PANEL_COLORS.genres),
            buildChipSection('TAGS', content?.tags, PANEL_COLORS.tags)
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
            scrollbarWidth: 3,
            // TEMPORARY - remove once flatscreen wheel-scroll is confirmed working (direct
            // request, 2026-09-02, round two: still no console output at all with the
            // Logger.debug() version of this, which needed setLogLevel(...) run first - plain
            // console.log needs no setup). Fires from inside uikit's own scroll.js the moment IT
            // decides a scroll happened, so seeing this log (or not) tells us whether the wheel
            // event ever reaches uikit's scroll handling at all, independent of whether the
            // visual result is what's actually broken.
            onScroll: (scrollX: number, scrollY: number) => {
                // eslint-disable-next-line no-console
                console.log('[GameBoxDebugPanel TEMP DIAGNOSTIC] cache viewport onScroll fired', { scrollX, scrollY })
            }
        })
        viewport.add(this.cacheText)
        root.add(viewport)

        return root
    }
}
