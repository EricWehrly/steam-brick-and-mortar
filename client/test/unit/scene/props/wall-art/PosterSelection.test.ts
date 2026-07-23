import { describe, it, expect } from 'vitest'
import { selectPosterScreenshots } from '../../../../../src/scene/props/wall-art/PosterSelection'
import type { LocalScreenshot } from '../../../../../src/steam/LocalScreenshotReader'

function shot(appid: number, creation: number, filename = `${appid}-${creation}.jpg`): LocalScreenshot {
    return { appid, filename, width: 100, height: 100, creation, caption: null }
}

describe('selectPosterScreenshots', () => {
    it('keeps only the earliest screenshot per appid', () => {
        const selected = selectPosterScreenshots(
            [shot(620, 200), shot(620, 100), shot(440, 150)],
            10
        )

        expect(selected).toHaveLength(2)
        expect(selected.find(s => s.appid === 620)?.creation).toBe(100)
    })

    it('orders selections chronologically by earliest capture', () => {
        const selected = selectPosterScreenshots(
            [shot(620, 300), shot(440, 100), shot(730, 200)],
            10
        )

        expect(selected.map(s => s.appid)).toEqual([440, 730, 620])
    })

    it('caps the result to the available slot count', () => {
        const selected = selectPosterScreenshots(
            [shot(1, 1), shot(2, 2), shot(3, 3)],
            2
        )

        expect(selected).toHaveLength(2)
    })

    it('returns nothing when there are no slots', () => {
        expect(selectPosterScreenshots([shot(1, 1)], 0)).toEqual([])
    })
})
