/**
 * GameBoxDebugPanel - the two layout fixes from direct request (2026-09-02): the description
 * starting mid-sentence rather than at the top ("needs to start at the start ... not the weird
 * middle its at"), and the debug face's content visibly overlapping the cache-entry section
 * below it ("the visuals are very crowded").
 */
import { describe, it, expect } from 'vitest'
import { Text } from '@pmndrs/uikit'
import { GameBoxDebugPanel } from '../../../../../src/scene/game-box-fold/panels/GameBoxDebugPanel'

describe('GameBoxDebugPanel layout', () => {
    it('sets the description Text to top-aligned, not left at the default vertical-center', () => {
        const panel = new GameBoxDebugPanel()
        panel.setContent({ name: 'Half-Life 3', description: 'A description long enough to wrap across several lines on the debug face.' })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sectionsArea = panel.container.children[0] as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const descriptionArea = sectionsArea.children[0].children[0] as any
        const descriptionText = descriptionArea.children[0] as Text
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((descriptionText as any).inputProperties.verticalAlign).toBe('top')
    })

    it('gives the cache-entry viewport a fixed height, not a flexGrow share of remaining space', () => {
        const panel = new GameBoxDebugPanel()

        const viewport = panel.container.children[panel.container.children.length - 1] as unknown as {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputProperties: any
        }
        expect(viewport.inputProperties.flexGrow).toBeUndefined()
        expect(viewport.inputProperties.height).toBeGreaterThan(0)
    })

    it('caps the sections area to a fixed max height with its own scrollbar, rather than letting content overflow the fixed-height page', () => {
        const panel = new GameBoxDebugPanel()

        const sectionsArea = panel.container.children[0] as unknown as {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputProperties: any
        }
        expect(sectionsArea.inputProperties.overflow).toBe('scroll')
        expect(sectionsArea.inputProperties.maxHeight).toBeGreaterThan(0)
    })

    it('declares flexDirection:\'column\' on both scrollable containers - uikit defaults an unset '
        + 'flexDirection to \'row\' and unset alignItems to \'stretch\', which stomps a single '
        + 'child to the container\'s own fixed height and makes maxScrollPosition compute to ~0 '
        + '(confirmed live, 2026-09-03: scrollY stayed 0 on both scroll directions despite wheel '
        + 'events reaching the canvas and uikit\'s own onScroll firing)', () => {
        const panel = new GameBoxDebugPanel()

        const sectionsArea = panel.container.children[0] as unknown as {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputProperties: any
        }
        const viewport = panel.container.children[panel.container.children.length - 1] as unknown as {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputProperties: any
        }
        expect(sectionsArea.inputProperties.flexDirection).toBe('column')
        expect(viewport.inputProperties.flexDirection).toBe('column')
    })
})
