/**
 * Mock for UIManager
 */
import { vi } from 'vitest'

export const UIManagerMock = vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    hideLoading: vi.fn(),
    showError: vi.fn(),
    setWebXRSessionActive: vi.fn(),
    setWebXRSupported: vi.fn(),
    showSteamStatus: vi.fn(),
    showProgress: vi.fn(),
    updateProgress: vi.fn(),
    dispose: vi.fn()
}))

// Export async factory function for vi.mock() - enables one-line usage
export const uiManagerMockFactory = async () => ({ UIManager: UIManagerMock })
