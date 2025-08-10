/**
 * Mock for SceneCoordinator - handles scene setup and coordination
 */

import { vi } from 'vitest'

export const SceneCoordinatorMock = vi.fn().mockImplementation(() => ({
    setupCompleteScene: vi.fn().mockResolvedValue(undefined),
    updatePerformanceData: vi.fn(),
    getPerformanceStats: vi.fn().mockReturnValue({
        activeMeshes: 0,
        totalTextures: 0,
        textureMemoryMB: 0,
        renderCalls: 0,
        triangles: 0
    }),
    getGameBoxRenderer: vi.fn().mockReturnValue({
        updatePerformanceData: vi.fn(),
        cleanupOffScreenTextures: vi.fn(),
        getPerformanceStats: vi.fn()
    }),
    getStoreLayout: vi.fn().mockReturnValue({
        getStoreStats: vi.fn().mockReturnValue({
            totalShelves: 5,
            totalSections: 20,
            totalGames: 0
        })
    }),
    dispose: vi.fn()
}))

export async function sceneCoordinatorMockFactory() {
    return {
        SceneCoordinator: SceneCoordinatorMock
    }
}
