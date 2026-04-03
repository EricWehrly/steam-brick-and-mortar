/**
 * Mock for SceneCoordinator - handles scene setup and coordination
 */

import { vi } from 'vitest'

export const SceneCoordinatorMock = vi.fn().mockImplementation(function() { return {
    setupCompleteScene: vi.fn().mockResolvedValue(undefined),
    updatePerformanceData: vi.fn(),
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
} })

export async function sceneCoordinatorMockFactory() {
    return {
        SceneCoordinator: SceneCoordinatorMock
    }
}
