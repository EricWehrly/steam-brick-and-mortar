/**
 * Mock for StoreLayout
 */
import { vi } from 'vitest'

export const StoreLayoutMock = vi.fn().mockImplementation(() => ({
    generateStore: vi.fn().mockResolvedValue(undefined),
    getStoreStats: vi.fn().mockReturnValue({
        totalShelves: 5,
        totalSections: 20,
        totalGames: 0
    }),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const storeLayoutMockFactory = async () => ({ StoreLayout: StoreLayoutMock })
