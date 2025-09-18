/**
 * Mock for UICoordinator - handles UI state and interactions
 */

import { vi } from 'vitest'

export const UICoordinatorMock = vi.fn().mockImplementation(() => ({
    setupUI: vi.fn().mockResolvedValue(undefined),
    setSteamWorkflowManager: vi.fn(),
    dispose: vi.fn(),
    // Expose specialized coordinators
    steam: {
        showError: vi.fn(),
        updateCacheStats: vi.fn(),
        updateProgress: vi.fn(),
        showProgress: vi.fn(),
        showSteamStatus: vi.fn(),
        checkOfflineAvailability: vi.fn(),
        setDevMode: vi.fn(),
        loadGames: vi.fn(),
        loadFromCache: vi.fn(),
        useOffline: vi.fn(),
        refreshCache: vi.fn(),
        clearCache: vi.fn(),
        showCacheStats: vi.fn(),
        checkCacheAvailability: vi.fn()
    },
    webxr: {
        updateWebXRSessionState: vi.fn(),
        updateWebXRSupport: vi.fn(),
        toggleVR: vi.fn()
    },
    system: {
        enableCacheActions: vi.fn(),
        disableCacheActions: vi.fn(),
        updateRenderStats: vi.fn(),
        togglePerformanceMonitor: vi.fn(),
        getCurrentPerformanceStats: vi.fn().mockReturnValue({}),
        openPauseMenu: vi.fn(),
        setupPauseMenu: vi.fn(),
        startPerformanceMonitoring: vi.fn()
    }
}))

export async function uiCoordinatorMockFactory() {
    return {
        UICoordinator: UICoordinatorMock
    }
}
