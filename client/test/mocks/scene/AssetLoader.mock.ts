/**
 * Mock for AssetLoader
 */
import { vi } from 'vitest'

export const AssetLoaderMock = vi.fn().mockImplementation(() => ({
    loadShelfModel: vi.fn().mockResolvedValue({
        position: { x: 0, y: 0, z: 0 },
        userData: { isShelfModel: true }
    }),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const assetLoaderMockFactory = async () => ({ AssetLoader: AssetLoaderMock })
