/**
 * Unit tests for SteamBrickAndMortarApp orchestrator class
 * 
 * These tests focus on the coordinator architecture and public API,
 * avoiding complex integration testing that requires WebGL context.
 * For integration testing, see coordinator-architecture.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock all direct dependencies to prevent WebGL context creation
vi.mock('../../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn().mockImplementation(() => ({
        getRenderer: vi.fn().mockReturnValue({}),
        getCamera: vi.fn().mockReturnValue({}),
        getScene: vi.fn().mockReturnValue({
            getObjectByName: vi.fn().mockReturnValue(null),
            children: []
        }),
        startRenderLoop: vi.fn(),
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/ui/PerformanceMonitor', () => ({
    PerformanceMonitor: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        getStats: vi.fn().mockReturnValue({}),
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/steam-integration/SteamIntegration', () => ({
    SteamIntegration: vi.fn().mockImplementation(() => ({
        loadGamesForUser: vi.fn().mockResolvedValue(undefined),
        clearCache: vi.fn(),
        getCacheStats: vi.fn().mockReturnValue({}),
        getImageCacheStats: vi.fn().mockReturnValue({}),
        clearImageCache: vi.fn(),
        hasOfflineData: vi.fn().mockReturnValue(false),
        refreshData: vi.fn().mockResolvedValue(undefined)
    }))
}))

vi.mock('../../../src/scene/SceneCoordinator', () => ({
    SceneCoordinator: vi.fn().mockImplementation(() => ({
        setupCompleteScene: vi.fn().mockResolvedValue(undefined),
        updatePerformanceData: vi.fn(),
        getPerformanceStats: vi.fn().mockReturnValue({}),
        getGameBoxRenderer: vi.fn().mockReturnValue({
            updatePerformanceData: vi.fn()
        }),
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/webxr/WebXRCoordinator', () => ({
    WebXRCoordinator: vi.fn().mockImplementation(() => ({
        setupWebXR: vi.fn().mockResolvedValue(undefined),
        handleWebXRToggle: vi.fn().mockResolvedValue(undefined),
        updateCameraMovement: vi.fn(),
        pauseInput: vi.fn(),
        resumeInput: vi.fn(),
        getWebXRManager: vi.fn().mockReturnValue({
            checkCapabilities: vi.fn().mockResolvedValue({})
        }),
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/ui/UICoordinator', () => ({
    UICoordinator: vi.fn().mockImplementation(() => ({
        setupUI: vi.fn().mockResolvedValue(undefined),
        showError: vi.fn(),
        updateWebXRSessionState: vi.fn(),
        updateWebXRSupport: vi.fn(),
        showProgress: vi.fn(),
        updateProgress: vi.fn(),
        showSteamStatus: vi.fn(),
        enableCacheActions: vi.fn(),
        disableCacheActions: vi.fn(),
        updateCacheStats: vi.fn(),
        checkOfflineAvailability: vi.fn(),
        updateRenderStats: vi.fn(),
        togglePerformanceMonitor: vi.fn(),
        getCurrentPerformanceStats: vi.fn().mockReturnValue({}),
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/core/DebugStatsProvider', () => ({
    DebugStatsProvider: vi.fn().mockImplementation(() => ({
        getDebugStats: vi.fn().mockResolvedValue({})
    }))
}))

vi.mock('../../../src/steam-integration/SteamGameManager', () => ({
    SteamGameManager: vi.fn().mockImplementation(() => ({
        resetGameIndex: vi.fn(),
        clearGameBoxes: vi.fn(),
        getCurrentGameIndex: vi.fn().mockReturnValue(0),
        addGameBoxToScene: vi.fn().mockResolvedValue(undefined)
    }))
}))

describe('SteamBrickAndMortarApp Unit Tests', () => {
    let SteamBrickAndMortarApp: any

    beforeEach(async () => {
        // Mock DOM elements
        const mockCanvas = document.createElement('canvas')
        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas)
        vi.spyOn(mockCanvas, 'getBoundingClientRect').mockReturnValue({
            width: 800,
            height: 600,
            top: 0,
            left: 0,
            bottom: 600,
            right: 800,
            x: 0,
            y: 0,
            toJSON: () => ({})
        })

        // Import the class after mocks are set up
        const module = await import('../../../src/core/SteamBrickAndMortarApp')
        SteamBrickAndMortarApp = module.SteamBrickAndMortarApp
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('Application Architecture', () => {
        it('should instantiate with coordinator pattern', () => {
            const app = new SteamBrickAndMortarApp()
            expect(app).toBeInstanceOf(SteamBrickAndMortarApp)
            expect(app.getIsInitialized()).toBe(false)
        })

        it('should accept custom configuration', () => {
            const config = {
                scene: { antialias: false },
                steam: { maxGames: 50 },
                input: { speed: 0.2 }
            }
            
            const app = new SteamBrickAndMortarApp(config)
            expect(app).toBeInstanceOf(SteamBrickAndMortarApp)
        })

        it('should provide access to core managers', () => {
            const app = new SteamBrickAndMortarApp()
            
            expect(app.getSceneManager()).toBeDefined()
            expect(app.getSteamIntegration()).toBeDefined()
            expect(app.getWebXRCoordinator()).toBeDefined()
            expect(app.getWebXRManager()).toBeDefined()
        })
    })

    describe('Coordinator Integration', () => {
        it('should demonstrate coordinator-based architecture', () => {
            const app = new SteamBrickAndMortarApp()
            
            // Verify coordinator methods are available
            expect(app.getPerformanceStats()).toBeDefined()
            expect(app.getCurrentPerformanceStats()).toBeDefined()
            
            // Verify coordinator delegation
            expect(typeof app.togglePerformanceMonitor).toBe('function')
        })

        it('should handle disposal without initialization', () => {
            const app = new SteamBrickAndMortarApp()
            
            // Should not throw when disposing uninitialized app
            expect(() => app.dispose()).not.toThrow()
            expect(app.getIsInitialized()).toBe(false)
        })
    })

    describe('Public API', () => {
        it('should provide performance monitoring interface', () => {
            const app = new SteamBrickAndMortarApp()
            
            const stats = app.getPerformanceStats()
            expect(stats).toBeDefined()
            
            const currentStats = app.getCurrentPerformanceStats()
            expect(currentStats).toBeDefined()
            
            // Should not throw when toggling performance monitor
            expect(() => app.togglePerformanceMonitor()).not.toThrow()
        })

        it('should maintain coordinator access for testing', () => {
            const app = new SteamBrickAndMortarApp()
            
            // Verify all coordinator access methods exist
            expect(app.getSceneManager).toBeDefined()
            expect(app.getSteamIntegration).toBeDefined()
            expect(app.getWebXRCoordinator).toBeDefined()
            expect(app.getWebXRManager).toBeDefined()
            expect(app.getIsInitialized).toBeDefined()
        })
    })

    describe('Configuration Validation', () => {
        it('should apply default configuration when none provided', () => {
            const app = new SteamBrickAndMortarApp()
            expect(app).toBeDefined()
            expect(app.getIsInitialized()).toBe(false)
        })

        it('should handle partial configuration objects', () => {
            const partialConfig = {
                scene: { antialias: false }
                // Missing steam and input configs
            }
            
            const app = new SteamBrickAndMortarApp(partialConfig)
            expect(app).toBeDefined()
        })
    })
})
