/**
 * VRDebugPanel - structural + stat-rendering tests. Real @pmndrs/uikit Container/Text/Button
 * instances construct fine under jsdom (see VRDisplayAdvancedPanel.test.ts's doc comment).
 * DebugStatsProvider itself (the real async stats-gathering path, including its PixelDataCache
 * dynamic import and navigator.storage.estimate() call) is swapped out via VRDebugPanel's
 * injectable createStatsProvider constructor param - this panel's own responsibility is rendering
 * whatever a stats provider hands it, not gathering it correctly, which is DebugStatsProvider's own
 * concern to test separately.
 *
 * Row values are asserted via a spy on Text.prototype.setProperties (the call VRDebugPanel makes
 * to update a row once stats resolve) rather than reading uikit's internal signal state back -
 * asserting on the interface call keeps this test decoupled from uikit's property-system
 * internals, which aren't part of this project's own contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Text } from '@pmndrs/uikit'
import { DataManager } from '../../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../../src/core/data/DataTypes'
import { VRDebugPanel } from '../../../../../src/scene/uikit/panels/VRDebugPanel'
import type { PerformanceMonitorUI } from '../../../../../src/ui/PerformanceMonitor'
import type { DebugStats } from '../../../../../src/ui/pause/panels/DebugStatsProvider'

const FAKE_STATS: DebugStats = {
    sceneObjects: { total: 42, meshes: 10, lights: 3, cameras: 1, textures: 5, materials: 6, geometries: 7 },
    performance: { fps: 58.3, frameTime: 16.66, memoryUsed: 100 * 1024 * 1024, memoryTotal: 200 * 1024 * 1024, triangles: 123456, drawCalls: 42 },
    cache: { imageCount: 12, imageCacheSize: 2 * 1024 * 1024, gameDataCount: 3, gameDataSize: 1024, quotaUsed: 50 * 1024 * 1024, quotaTotal: 100 * 1024 * 1024 },
    system: { userAgent: 'test', webxrSupported: true, webglVersion: 'WebGL 2.0', maxTextureSize: 8192, vendor: 'Test Vendor', renderer: 'Test Renderer' }
}

function publishFakePerformanceMonitor(): void {
    DataManager.getInstance().set(
        DataKey.PerformanceMonitor,
        {} as unknown as PerformanceMonitorUI,
        { domain: DataDomain.Scene }
    )
}

describe('VRDebugPanel', () => {
    beforeEach(() => {
        DataManager.resetInstance()
    })

    it('constructs a real uikit component tree without throwing', () => {
        expect(() => new VRDebugPanel()).not.toThrow()
    })

    it('builds all four stat sections plus a Refresh button', () => {
        const panel = new VRDebugPanel()

        // container children: title Text, scroll Container, Refresh Button.
        expect(panel.container.children).toHaveLength(3)
        const scroll = panel.container.children[1]
        expect(scroll.children).toHaveLength(4)
    })

    it('does not touch any row when no PerformanceMonitor is published yet', async () => {
        const getDebugStats = vi.fn<() => Promise<DebugStats>>().mockResolvedValue(FAKE_STATS)
        const setPropertiesSpy = vi.spyOn(Text.prototype, 'setProperties')

        new VRDebugPanel(() => ({ getDebugStats }))
        await Promise.resolve() // let the constructor's fire-and-forget refresh() settle

        expect(getDebugStats).not.toHaveBeenCalled()
        expect(setPropertiesSpy).not.toHaveBeenCalled()
    })

    it('populates real values once PerformanceMonitor is published and refresh() resolves', async () => {
        publishFakePerformanceMonitor()
        const getDebugStats = vi.fn<() => Promise<DebugStats>>().mockResolvedValue(FAKE_STATS)
        const setPropertiesSpy = vi.spyOn(Text.prototype, 'setProperties')

        new VRDebugPanel(() => ({ getDebugStats }))
        await Promise.resolve()
        await Promise.resolve()

        expect(getDebugStats).toHaveBeenCalledTimes(1)
        const texts = setPropertiesSpy.mock.calls.map(call => (call[0] as { text?: string }).text)
        expect(texts).toContain('58.3')
        expect(texts).toContain('Test Renderer')
        expect(texts).toContain('42') // sceneObjects.total and performance.drawCalls both format to '42'
    })

    it('color-codes a low FPS reading as a warning, not the default row color', async () => {
        publishFakePerformanceMonitor()
        const getDebugStats = vi.fn<() => Promise<DebugStats>>().mockResolvedValue({
            ...FAKE_STATS,
            performance: { ...FAKE_STATS.performance, fps: 12 }
        })
        const setPropertiesSpy = vi.spyOn(Text.prototype, 'setProperties')

        new VRDebugPanel(() => ({ getDebugStats }))
        await Promise.resolve()
        await Promise.resolve()

        const fpsCall = setPropertiesSpy.mock.calls.find(call => (call[0] as { text?: string }).text === '12.0')
        expect(fpsCall?.[0]).toMatchObject({ color: '#e05a5a' })
    })
})
