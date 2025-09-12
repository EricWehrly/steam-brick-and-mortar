/**
 * Mock for DebugStatsProvider
 */

import { vi } from 'vitest'

export const DebugStatsProviderMock = vi.fn().mockImplementation(() => ({
    getDebugStats: vi.fn().mockReturnValue({
        renderer: {
            triangles: 1000,
            calls: 50,
            points: 0,
            lines: 0,
            frame: 0
        },
        memory: {
            geometries: 10,
            textures: 20
        },
        scene: {
            gameBoxes: 5,
            loadedAssets: 15
        },
        steam: {
            apiCalls: 3,
            cachedItems: 100,
            errorCount: 0
        },
        performance: {
            fps: 60,
            avgFrameTime: 16.67,
            memoryUsage: '50MB'
        }
    }),
    dispose: vi.fn()
}))

export async function debugStatsProviderMockFactory() {
    return {
        DebugStatsProvider: DebugStatsProviderMock
    }
}
