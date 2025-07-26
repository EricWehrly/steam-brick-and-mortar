/**
 * Mock for WebXRManager
 */
import { vi } from 'vitest'

export const WebXRManagerMock = vi.fn().mockImplementation(() => ({
    setRenderer: vi.fn(),
    checkCapabilities: vi.fn().mockResolvedValue({
        supportsImmersiveVR: true,
        supportsInlineVR: true
    }),
    startSession: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const webxrManagerMockFactory = async () => ({ WebXRManager: WebXRManagerMock })
