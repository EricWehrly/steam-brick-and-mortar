/**
 * GameStart Event Implvi.mock('../../../src/scene/SceneCoordinator', () => ({
    SceneCoordinator: vi.fn().mockImplementation(() => ({
        setupCompleteScene: vi.fn().mockResolvedValue(undefined),
        updatePerformanceData: vi.fn(),
        getPerformanceStats: vi.fn().mockReturnValue({}),
        getGameBoxRenderer: vi.fn().mockReturnValue({
            updatePerformanceData: vi.fn()
        }),
        getStoreLayout: vi.fn().mockReturnValue({
            dispose: vi.fn()
        }),
        dispose: vi.fn()
    }))
}))
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
        setupSceneAsPrerequisite: vi.fn().mockResolvedValue(undefined),
        updatePerformanceData: vi.fn(),
        getPerformanceStats: vi.fn().mockReturnValue({}),
        getGameBoxRenderer: vi.fn().mockReturnValue({
            updatePerformanceData: vi.fn()
        }),
        getStoreLayout: vi.fn().mockReturnValue({
            generateStore: vi.fn().mockResolvedValue(undefined)
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
        dispose: vi.fn(),
        steam: {
            showError: vi.fn(),
            updateCacheStats: vi.fn(),
            updateProgress: vi.fn(),
            showProgress: vi.fn(),
            showSteamStatus: vi.fn()
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
        getInstance: vi.fn(),
        // Static convenience methods
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn()
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
import { EventManager, EventSource } from '../../../src/core/EventManager'
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
        
        // Simulate SceneReady event emission (since SceneCoordinator is mocked)
        eventManager.emit(GameEventTypes.SceneReady, {
            source: EventSource.System,
            timestamp: Date.now(),
            sceneStats: {
                environmentObjectCount: 5,
                lightsReady: true,
                basicNavigationReady: true
            }
        })
        
        // Wait for async prerequisite events to complete
        await new Promise(resolve => setTimeout(resolve, 50))
        
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
        
        // Act: Initialize the application
        await app.init()
        
        // Simulate multiple SceneReady event emissions to test idempotency
        const sceneReadyEvent = {
            source: EventSource.System,
            timestamp: Date.now(),
            sceneStats: {
                environmentObjectCount: 5,
                lightsReady: true,
                basicNavigationReady: true
            }
        }
        
        // Emit SceneReady multiple times - GameStart should only emit once
        eventManager.emit(GameEventTypes.SceneReady, sceneReadyEvent)
        eventManager.emit(GameEventTypes.SceneReady, sceneReadyEvent) // Duplicate
        eventManager.emit(GameEventTypes.SceneReady, sceneReadyEvent) // Duplicate
        
        // Wait for async prerequisite events to complete
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Assert: Verify GameStart event was emitted only once despite multiple SceneReady events
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
        
        // Simulate SceneReady event emission (since SceneCoordinator is mocked)
        eventManager.emit(GameEventTypes.SceneReady, {
            source: EventSource.System,
            timestamp: Date.now(),
            sceneStats: {
                environmentObjectCount: 5,
                lightsReady: true,
                basicNavigationReady: true
            }
        })
        
        // Wait for async prerequisite events to complete
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Assert: Verify proper event structure
        expect(capturedEvent).not.toBeNull()
        expect(capturedEvent!.timestamp).toBeTypeOf('number')
        expect(capturedEvent!.source).toBe('system')
        
        // Test that it has BaseInteractionEvent properties
        expect(typeof capturedEvent!.timestamp).toBe('number')
        expect(typeof capturedEvent!.source).toBe('string')
    })

    it('should use matching event type constants for registration and emission', async () => {
        // This test ensures we don't accidentally use string literals that don't match the constants
        // Since registration happens in SceneCoordinator constructor (tested separately),
        // we focus on verifying emission uses the correct constant
        const spyEmit = vi.spyOn(eventManager, 'emit')
        
        // Act: Initialize the application
        await app.init()
        
        // Simulate SceneReady event emission (since SceneCoordinator is mocked)
        eventManager.emit(GameEventTypes.SceneReady, {
            source: EventSource.System,
            timestamp: Date.now(),
            sceneStats: {
                environmentObjectCount: 5,
                lightsReady: true,
                basicNavigationReady: true
            }
        })
        
        // Wait for async prerequisite events to complete
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Assert: Verify that emission uses the correct event type constant
        expect(spyEmit).toHaveBeenCalledWith(
            GameEventTypes.Start, 
            expect.any(Object)
        )
        
        // Verify the constant value matches what registration should use
        expect(GameEventTypes.Start).toBe('game:start')
    })
})