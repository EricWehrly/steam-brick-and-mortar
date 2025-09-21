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

    it('should register for GameStart event using correct event type constant', () => {
        // Mock scene manager
        const mockSceneManager = {
            getScene: vi.fn().mockReturnValue({})
        }

        // Act: Create SceneCoordinator (should register event handler in constructor)
        new SceneCoordinator(mockSceneManager as any)

        // Assert: Verify registration uses the correct constant
        const eventManager = EventManager.getInstance()
        expect(eventManager.registerEventHandler).toHaveBeenCalledWith(
            GameEventTypes.Start,
            expect.any(Function)
        )

        // Verify the constant value for additional safety
        expect(GameEventTypes.Start).toBe('game:start')
    })
})