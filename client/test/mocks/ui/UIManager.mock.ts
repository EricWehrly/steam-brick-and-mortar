/**
 * Mock for UIManager
 */
import { vi } from 'vitest'

export const UIManagerMock = vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    hideLoading: vi.fn(),
    showError: vi.fn(),
    
    // Expose UI panels as public readonly properties (replacing delegation methods)
    steamUIPanel: {
        showStatus: vi.fn(),
        updateCacheStats: vi.fn(),
        isDevelopmentMode: vi.fn().mockReturnValue(false)
    },
    progressDisplay: {
        show: vi.fn(),
        update: vi.fn()
    },
    webxrUIPanel: {
        setSupported: vi.fn(),
        setSessionActive: vi.fn()
    }
}))

// Add static methods to the mock constructor
;(UIManagerMock as any).getInstance = vi.fn().mockReturnValue({
    steamUIPanel: {
        showStatus: vi.fn(),
        updateCacheStats: vi.fn(),
        isDevelopmentMode: vi.fn().mockReturnValue(false)
    },
    progressDisplay: {
        show: vi.fn(),
        update: vi.fn()
    },
    webxrUIPanel: {
        setSupported: vi.fn(),
        setSessionActive: vi.fn()
    }
})

// Export async factory function for vi.mock() - enables one-line usage
export const uiManagerMockFactory = async () => ({ UIManager: UIManagerMock })
