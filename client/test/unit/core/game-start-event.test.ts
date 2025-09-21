/**
 * GameStart Event Implementation Test
 * 
 * Tests that the GameStart event is properly emitted after the render loop
 * is established and the application is ready for interaction.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// =============================================================================
// MOCK SETUP - All mocks must be at top level before imports
// =============================================================================

// Scene and rendering mocks
vi.mock('../../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn().mockImplementation(() => ({
        getRenderer: vi.fn().mockReturnValue({}),
        getCamera: vi.fn().mockReturnValue({}),
        getScene: vi.fn().mockReturnValue({
            getObjectByName: vi.fn().mockReturnValue(null),
            children: [],
            add: vi.fn()
        }),
        startRenderLoop: vi.fn(),
        dispose: vi.fn()
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

// WebXR mocks
vi.mock('../../../src/webxr/WebXRCoordinator', () => ({
    WebXRCoordinator: vi.fn().mockImplementation(() => ({
        setupWebXR: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/webxr/WebXREventHandler', () => ({
    WebXREventHandler: vi.fn().mockImplementation(() => ({
        dispose: vi.fn()
    }))
}))

// UI mocks
vi.mock('../../../src/ui/UICoordinator', () => ({
    UICoordinator: vi.fn().mockImplementation(() => ({
        setupUI: vi.fn().mockResolvedValue(undefined),
        setSteamWorkflowManager: vi.fn(),
        dispose: vi.fn(),
        steam: {
            showError: vi.fn(),
            updateCacheStats: vi.fn(),
            updateProgress: vi.fn(),
            showProgress: vi.fn(),
            showSteamStatus: vi.fn(),
            checkOfflineAvailability: vi.fn()
        },
        webxr: {
            updateWebXRSessionState: vi.fn(),
            updateWebXRSupport: vi.fn()
        },
        system: {
            enableCacheActions: vi.fn(),
            disableCacheActions: vi.fn(),
            updateRenderStats: vi.fn(),
            togglePerformanceMonitor: vi.fn(),
            getCurrentPerformanceStats: vi.fn().mockReturnValue({}),
            dispose: vi.fn()
        }
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

vi.mock('../../../src/ui/ToastManager', () => ({
    ToastManager: {
        getInstance: vi.fn().mockReturnValue({
            success: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            dispose: vi.fn()
        })
    }
}))

// Steam integration mocks
vi.mock('../../../src/steam-integration/SteamIntegration', () => ({
    SteamIntegration: vi.fn().mockImplementation(() => ({
        loadGamesForUser: vi.fn().mockResolvedValue(undefined),
        clearCache: vi.fn(),
        getCacheStats: vi.fn().mockReturnValue({}),
        getImageCacheStats: vi.fn().mockReturnValue({}),
        clearImageCache: vi.fn(),
        hasOfflineData: vi.fn().mockReturnValue(false),
        refreshData: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/steam-integration/SteamWorkflowManager', () => ({
    SteamWorkflowManager: vi.fn().mockImplementation(() => ({
        dispose: vi.fn()
    }))
}))

// Core component mocks
vi.mock('../../../src/core/SteamGameManager', () => ({
    SteamGameManager: vi.fn().mockImplementation(() => ({
        dispose: vi.fn()
    }))
}))

vi.mock('../../../src/core/DebugStatsProvider', () => ({
    DebugStatsProvider: vi.fn().mockImplementation(() => ({
        dispose: vi.fn()
    }))
}))

// =============================================================================
// IMPORTS - After all mocks are set up
// =============================================================================

import { SteamBrickAndMortarApp } from '../../../src/core/SteamBrickAndMortarApp'
import { EventManager } from '../../../src/core/EventManager'
import { GameEventTypes, type GameStartEvent } from '../../../src/types/InteractionEvents'

describe('GameStart Event Implementation', () => {
    let app: SteamBrickAndMortarApp
    let eventManager: EventManager
    
    beforeEach(() => {
        // Create app instance
        app = new SteamBrickAndMortarApp()
        
        // Get the singleton EventManager
        eventManager = EventManager.getInstance()
    })

    afterEach(async () => {
        if (app) {
            await app.dispose()
        }
    })

    it('should emit GameStart event after successful initialization', async () => {
        // Arrange: Set up event listener
        const gameStartEvents: GameStartEvent[] = []
        
        eventManager.registerEventHandler<GameStartEvent>(GameEventTypes.Start, (event) => {
            gameStartEvents.push(event.detail)
        })
        
        // Act: Initialize the application
        await app.init()
        
        // Assert: Verify GameStart event was emitted
        expect(gameStartEvents).toHaveLength(1)
        
        const gameStartEvent = gameStartEvents[0]
        expect(gameStartEvent.timestamp).toBeTypeOf('number')
        expect(gameStartEvent.source).toBe('system')
        expect(gameStartEvent.timestamp).toBeGreaterThan(0)
    })

    it('should emit GameStart event only once during initialization', async () => {
        // Arrange: Set up event listener
        const gameStartEvents: GameStartEvent[] = []
        
        eventManager.registerEventHandler<GameStartEvent>(GameEventTypes.Start, (event) => {
            gameStartEvents.push(event.detail)
        })
        
        // Act: Initialize the application multiple times
        await app.init()
        await app.init() // Should not emit again due to idempotency
        
        // Assert: Verify GameStart event was emitted only once
        expect(gameStartEvents).toHaveLength(1)
    })

    it('should emit GameStart event with proper type information', async () => {
        // Arrange: Set up typed event listener
        let capturedEvent: GameStartEvent | null = null
        
        eventManager.registerEventHandler<GameStartEvent>(GameEventTypes.Start, (event) => {
            capturedEvent = event.detail
        })
        
        // Act: Initialize the application
        await app.init()
        
        // Assert: Verify proper event structure
        expect(capturedEvent).not.toBeNull()
        expect(capturedEvent!.timestamp).toBeTypeOf('number')
        expect(capturedEvent!.source).toBe('system')
        
        // Test that it has BaseInteractionEvent properties
        expect(typeof capturedEvent!.timestamp).toBe('number')
        expect(typeof capturedEvent!.source).toBe('string')
    })
})