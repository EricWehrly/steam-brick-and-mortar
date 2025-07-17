/**
 * Mock for InputManager
 */
import { vi } from 'vitest'

export const InputManagerMock = vi.fn().mockImplementation(() => ({
    startListening: vi.fn(),
    stopListening: vi.fn(),
    updateMovementOptions: vi.fn(),
    updateCallbacks: vi.fn(),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const inputManagerMockFactory = async () => ({ InputManager: InputManagerMock })
