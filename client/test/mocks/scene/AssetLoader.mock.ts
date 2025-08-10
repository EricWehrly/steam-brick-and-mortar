/**
 * Mock for AssetLoader
 */
import { vi } from 'vitest'

export const AssetLoaderMock = vi.fn().mockImplementation(() => ({
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const assetLoaderMockFactory = async () => ({ AssetLoader: AssetLoaderMock })
