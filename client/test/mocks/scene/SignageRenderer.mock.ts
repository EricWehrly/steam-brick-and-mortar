/**
 * Mock for SignageRenderer
 */
import { vi } from 'vitest'

export const SignageRendererMock = vi.fn().mockImplementation(() => ({
    createStandardSigns: vi.fn().mockReturnValue([]),
    createSign: vi.fn().mockReturnValue({ 
        position: { x: 0, y: 0, z: 0 },
        userData: { isSign: true }
    }),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const signageRendererMockFactory = async () => ({ SignageRenderer: SignageRendererMock })
