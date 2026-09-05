/**
 * GameBoxStorePanel - the disc's alpha-clipped semicircle specifically. uikit's overflow:'hidden'
 * clips children to a plain rectangle regardless of border-radius, so a full-bleed header Image
 * needs its OWN transparent corners to read as a semicircle - this is the one thing the class draws
 * by hand, and the one thing worth a dedicated regression test.
 */
import { describe, it, expect } from 'vitest'
import { GameBoxStorePanel } from '../../../../../src/scene/game-box-fold/panels/GameBoxStorePanel'

function solidImage(width: number, height: number, rgba: [number, number, number, number]) {
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
        pixels.set(rgba, i * 4)
    }
    return { pixels, width, height }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discCanvas(panel: GameBoxStorePanel): HTMLCanvasElement {
    return (panel as any).discCanvas
}

describe('GameBoxStorePanel disc texture', () => {
    it('clips the header image to a semicircle - fully opaque near top-center, fully transparent in the corners', () => {
        const panel = new GameBoxStorePanel(() => {})
        panel.setHeaderImage(solidImage(4, 4, [200, 100, 50, 255]))

        const canvas = discCanvas(panel)
        const ctx = canvas.getContext('2d')!
        const width = canvas.width
        const height = canvas.height

        const topCenter = ctx.getImageData(Math.floor(width / 2), 1, 1, 1).data
        expect(topCenter[3]).toBe(255) // inside the arc - opaque
        expect(topCenter[0]).toBeGreaterThan(0) // real color drawn, not left blank

        const topLeftCorner = ctx.getImageData(0, 0, 1, 1).data
        expect(topLeftCorner[3]).toBe(0) // outside the arc - fully transparent, not a square edge

        const topRightCorner = ctx.getImageData(width - 1, 0, 1, 1).data
        expect(topRightCorner[3]).toBe(0)

        panel.dispose()
    })

    it('the placeholder (before any header image, or after clearing one) is opaque within the semicircle and transparent outside it - a real shape, not a blank rect', () => {
        const panel = new GameBoxStorePanel(() => {})
        panel.setHeaderImage(solidImage(4, 4, [200, 100, 50, 255]))

        panel.setHeaderImage(null)

        const canvas = discCanvas(panel)
        const ctx = canvas.getContext('2d')!
        const topCenter = ctx.getImageData(Math.floor(canvas.width / 2), 1, 1, 1).data
        expect(topCenter[3]).toBe(255) // still a filled placeholder shape, not blank

        const topLeftCorner = ctx.getImageData(0, 0, 1, 1).data
        expect(topLeftCorner[3]).toBe(0) // outside the arc either way

        panel.dispose()
    })

    it('draws a spindle hole at the disc\'s center, like the binder UI\'s own disc cutout', () => {
        const panel = new GameBoxStorePanel(() => {})
        panel.setHeaderImage(solidImage(4, 4, [200, 100, 50, 255]))

        const canvas = discCanvas(panel)
        const ctx = canvas.getContext('2d')!
        const centerX = Math.floor(canvas.width / 2)
        const centerY = canvas.height

        // Just above the disc's true center - inside the hole's radius, so this should be the
        // hole's own dark fill, not the header art drawn everywhere else on the disc.
        const holePixel = ctx.getImageData(centerX, centerY - 4, 1, 1).data
        expect(holePixel[3]).toBe(255) // opaque - a real shape, not left blank
        expect(holePixel[0]).toBeLessThan(100) // dark hole fill, not the bright header art color

        // Off to the side at the same height, outside the hole's radius but still within the disc -
        // should still show the header art, confirming the hole didn't blank out the whole disc.
        const artPixel = ctx.getImageData(centerX - 60, centerY - 4, 1, 1).data
        expect(artPixel[3]).toBe(255)
        expect(artPixel[0]).toBeGreaterThan(100) // the solid header color's red channel (200)

        panel.dispose()
    })

    it('fills the gap under a wide header image with the same neutral base color, not a '
        + 'transparent leak through to the panel behind - a typical Steam header image\'s aspect '
        + 'ratio (~460x215) is shorter than the disc\'s own semicircle bounding box once fit to its '
        + 'width, leaving a gap at the bottom for nearly every game', () => {
        const panel = new GameBoxStorePanel(() => {})
        // Same ~2.14:1 aspect as a real Steam header image (460x215) - narrow enough that
        // fit-width scaling leaves height short of the disc's own semicircle bounding box.
        panel.setHeaderImage(solidImage(46, 21, [200, 100, 50, 255]))

        const canvas = discCanvas(panel)
        const ctx = canvas.getContext('2d')!
        const centerX = Math.floor(canvas.width / 2)

        // Near the disc's true bottom edge (the diameter line) - below where the scaled image's
        // own content reaches, so this used to be left fully transparent.
        const bottomGapPixel = ctx.getImageData(centerX, canvas.height - 4, 1, 1).data
        expect(bottomGapPixel[3]).toBe(255) // opaque now - base fill, not a transparent leak
        expect(bottomGapPixel[0]).toBeLessThan(100) // the neutral border-gray fill, not the art's red (200)

        panel.dispose()
    })

    it('the disc has exactly one Image, constructed once and reused across every selection', () => {
        const panel = new GameBoxStorePanel(() => {})
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const disc = (panel as any).disc
        expect(disc.children).toHaveLength(1)
        const image = disc.children[0]

        panel.setHeaderImage(solidImage(4, 4, [200, 100, 50, 255]))
        panel.setHeaderImage(solidImage(4, 4, [10, 20, 30, 255]))
        panel.setHeaderImage(null)

        expect(disc.children).toHaveLength(1)
        expect(disc.children[0]).toBe(image)

        panel.dispose()
    })
})
