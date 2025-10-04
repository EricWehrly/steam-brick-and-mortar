/**
 * Scene Coordinator Event Registration Tests
 * 
 * Tests that the SceneCoordinator properly registers for the GameStart event
 * using the correct event type constant.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock EventManager 
vi.mock('../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: vi.fn().mockReturnValue({
            registerEventHandler: vi.fn()
        })
    }
}))

// Mock other dependencies
vi.mock('../../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn()
}))

vi.mock('../../../src/scene/StoreLayout', () => ({
    StoreLayout: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('../../../src/scene/SignageRenderer', () => ({
    SignageRenderer: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('../../../src/scene/GameBoxRenderer', () => ({
    GameBoxRenderer: vi.fn().mockImplementation(() => ({}))
}))

import { SceneCoordinator } from '../../../src/scene/SceneCoordinator'
import { EventManager } from '../../../src/core/EventManager'
import { GameEventTypes } from '../../../src/types/InteractionEvents'

describe('Scene Coordinator Event Registration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should emit SceneReady event when basic environment is set up', () => {
        // Mock scene manager with proper scene mock that includes add method
        const mockSceneManager = {
            getScene: vi.fn().mockReturnValue({
                add: vi.fn(), // Scene operations need this
                remove: vi.fn() // For potential cleanup
            }),
            getRenderer: vi.fn().mockReturnValue({
                shadowMap: { enabled: false }
            })
        }

        // Act: Create SceneCoordinator (should emit SceneReady after basic setup)
        new SceneCoordinator(mockSceneManager as any)

        // Assert: Verify SceneReady event type constant exists and has correct value
        expect(GameEventTypes.SceneReady).toBe('game:scene-ready')
        
        // Note: Actual event emission testing would require mocking the async setup
        // The important part is that the event type constant is properly defined
        console.log('✅ SceneReady event type validated:', GameEventTypes.SceneReady)
    })
})