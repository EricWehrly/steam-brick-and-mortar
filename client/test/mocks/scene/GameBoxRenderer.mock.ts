/**
 * Mock for GameBoxRenderer
 */
import { vi } from 'vitest'

export const GameBoxRendererMock = vi.fn().mockImplementation(() => ({
    createGameBox: vi.fn().mockReturnValue({
        position: { x: 0, y: 0, z: 0 },
        userData: { isGameBox: true }
    }),
    createPlaceholderBoxes: vi.fn(),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const gameBoxRendererMockFactory = async () => ({ GameBoxRenderer: GameBoxRendererMock })
