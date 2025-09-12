/**
 * Mock for UICoordinator - handles UI state and interactions
 */

import { vi } from 'vitest'

export const UICoordinatorMock = vi.fn().mockImplementation(() => ({
    setupUI: vi.fn().mockResolvedValue(undefined),
    initializeUI: vi.fn().mockResolvedValue(undefined),
    showPauseMenu: vi.fn(),
    hidePauseMenu: vi.fn(),
    updateDebugInfo: vi.fn(),
    hideLoadingScreen: vi.fn(),
    showLoadingScreen: vi.fn(),
    updateLoadingProgress: vi.fn(),
    handleWindowResize: vi.fn(),
    isPauseMenuVisible: vi.fn().mockReturnValue(false),
    updateRenderStats: vi.fn(),
    showError: vi.fn(),
    dispose: vi.fn()
}))

export async function uiCoordinatorMockFactory() {
    return {
        UICoordinator: UICoordinatorMock
    }
}
