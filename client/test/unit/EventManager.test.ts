/**
 * Unit tests for EventManager - Core event system singleton
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventManager, EventSource } from '../../src/core/EventManager'
import { SteamEventTypes } from '../../src/types/InteractionEvents'

describe('EventManager Unit Tests', () => {
    let eventManager: EventManager
    
    beforeEach(() => {
        eventManager = EventManager.getInstance()
    })

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = EventManager.getInstance()
            const instance2 = EventManager.getInstance()
            expect(instance1).toBe(instance2)
        })
    })

    describe('Event Emission', () => {
        it('should emit events with proper structure', () => {
            const mockHandler = vi.fn()
            const eventType = SteamEventTypes.LoadGames
            const testDetail = { vanityUrl: 'testuser', timestamp: Date.now(), source: EventSource.UI }
            
            eventManager.registerEventHandler(eventType, mockHandler)
            eventManager.emit(eventType, testDetail)
            
            expect(mockHandler).toHaveBeenCalledTimes(1)
            const receivedEvent = mockHandler.mock.calls[0][0]
            expect(receivedEvent.type).toBe(eventType)
            expect(receivedEvent.detail.vanityUrl).toBe('testuser')
        })

        it('should handle multiple handlers', () => {
            const mockHandler1 = vi.fn()
            const mockHandler2 = vi.fn()
            const eventType = SteamEventTypes.LoadGames
            const testDetail = { vanityUrl: 'test', timestamp: Date.now(), source: EventSource.UI }
            
            eventManager.registerEventHandler(eventType, mockHandler1)
            eventManager.registerEventHandler(eventType, mockHandler2)
            eventManager.emit(eventType, testDetail)
            
            expect(mockHandler1).toHaveBeenCalledTimes(1)
            expect(mockHandler2).toHaveBeenCalledTimes(1)
        })

        it('should deregister handlers', () => {
            const mockHandler = vi.fn()
            const eventType = SteamEventTypes.LoadGames
            const testDetail = { vanityUrl: 'test', timestamp: Date.now(), source: EventSource.UI }
            
            eventManager.registerEventHandler(eventType, mockHandler)
            eventManager.deregisterEventHandler(eventType, mockHandler)
            eventManager.emit(eventType, testDetail)
            
            expect(mockHandler).toHaveBeenCalledTimes(0)
        })
    })
})
