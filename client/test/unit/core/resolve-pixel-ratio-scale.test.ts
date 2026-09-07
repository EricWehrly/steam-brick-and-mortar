/**
 * resolvePixelRatioScale() - the fix for a real bug: this app's default settings had
 * pixelRatioScale hardcoded to 1, disconnected from both the "high" preset's own value (1.5) and
 * from the display's actual window.devicePixelRatio - so on a HiDPI/scaled display, the renderer
 * silently rendered below native resolution, most visibly blurring small text (e.g. the VR
 * settings menu). High/Ultra are billed as quality-first tiers, so they floor at the real
 * devicePixelRatio; Low/Medium keep their preset value as-is since rendering below native is the
 * actual performance relief those two tiers exist to offer.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { resolvePixelRatioScale, RENDER_QUALITY_PRESETS, QUALITY_LEVEL } from '../../../src/core/AppSettings'

function withDevicePixelRatio(value: number, run: () => void): void {
    const original = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
    try {
        run()
    } finally {
        Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true })
    }
}

describe('resolvePixelRatioScale', () => {
    afterEach(() => {
        Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
    })

    it('floors High at the real devicePixelRatio when the preset value is lower (the reported bug)', () => {
        withDevicePixelRatio(2, () => {
            expect(resolvePixelRatioScale(QUALITY_LEVEL.HIGH)).toBe(2)
        })
    })

    it('keeps High at its own preset value when that already exceeds devicePixelRatio', () => {
        withDevicePixelRatio(1, () => {
            expect(resolvePixelRatioScale(QUALITY_LEVEL.HIGH)).toBe(RENDER_QUALITY_PRESETS.high.pixelRatioScale)
        })
    })

    it('floors Ultra at the real devicePixelRatio too', () => {
        withDevicePixelRatio(3, () => {
            expect(resolvePixelRatioScale(QUALITY_LEVEL.ULTRA)).toBe(3)
        })
    })

    it('does NOT floor Low - rendering below native is that tier\'s actual performance relief', () => {
        withDevicePixelRatio(2, () => {
            expect(resolvePixelRatioScale(QUALITY_LEVEL.LOW)).toBe(RENDER_QUALITY_PRESETS.low.pixelRatioScale)
        })
    })

    it('does NOT floor Medium either', () => {
        withDevicePixelRatio(2, () => {
            expect(resolvePixelRatioScale(QUALITY_LEVEL.MEDIUM)).toBe(RENDER_QUALITY_PRESETS.medium.pixelRatioScale)
        })
    })
})
