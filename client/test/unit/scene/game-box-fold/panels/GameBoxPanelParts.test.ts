/**
 * GameBoxPanelParts' shared style helpers (roundedCorners, buildScrollableColumn) - extracted from
 * GameBoxDebugPanel.ts/GameBoxStorePanel.ts where the same shapes were duplicated inline.
 */
import { describe, it, expect } from 'vitest'
import { roundedCorners, buildScrollableColumn } from '../../../../../src/scene/game-box-fold/panels/GameBoxPanelParts'

describe('roundedCorners', () => {
    it('sets the same radius on all four corners', () => {
        expect(roundedCorners(6)).toEqual({
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 6
        })
    })
})

describe('buildScrollableColumn', () => {
    it('always sets flexDirection:\'column\' - an unset one defaults to \'row\' in uikit, which '
        + 'stretches the child to the container\'s own height and leaves nothing to scroll to', () => {
        const column = buildScrollableColumn({ height: 100 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = (column as any).inputProperties
        expect(props.flexDirection).toBe('column')
        expect(props.overflow).toBe('scroll')
    })

    it('applies a fixed height when given one', () => {
        const column = buildScrollableColumn({ height: 70 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((column as any).inputProperties.height).toBe(70)
    })

    it('applies a maxHeight when given one instead', () => {
        const column = buildScrollableColumn({ maxHeight: 260 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((column as any).inputProperties.maxHeight).toBe(260)
    })
})
