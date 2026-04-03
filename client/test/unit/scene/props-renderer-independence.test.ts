/**
 * Props Renderer Independence Test
 * 
 * Verifies that store props renderers work independently via event system.
 * 
 * Migration: Updated to use event system instead of deleted StorePropsRenderer facade
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager, EventSource, type BaseInteractionEvent } from '../../../src/core/EventManager'
import { StorePropsEventTypes } from '../../../src/scene/props/PropsEvents'
import type { PropsConfig } from '../../../src/scene/IStorePropsRenderer'

// Import props module to ensure handlers register themselves
import '../../../src/scene/props'

describe('Store Props Renderer Independence - Event System', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let mockEventHandler: (event: CustomEvent<BaseInteractionEvent>) => void

    beforeEach(() => {
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        
        // Mock event handler to track events
        mockEventHandler = vi.fn()
        
        // Register mock handler for store props events
        // Cast needed: Vitest 4 Mock type includes constructor signature, incompatible with plain function type
        eventManager.registerEventHandler(StorePropsEventTypes.SetupCompleted, mockEventHandler)
    })

    afterEach(() => {
        // Clean up event handlers
        eventManager.deregisterEventHandler(StorePropsEventTypes.SetupCompleted, mockEventHandler)
    })

    describe('Event Handler Independence', () => {
        it('should initialize event handlers without external dependencies', async () => {
            // Given: Event system is set up
            expect(eventManager).toBeDefined()
            
            // When: We request store props setup
            const config: PropsConfig = {
                enableShelves: true,
                enableGameBoxes: false,
                enableSignage: false
            }
            
            eventManager.emit(StorePropsEventTypes.SetupRequest, {
                config,
                source: EventSource.System,
                timestamp: Date.now()
            })
            
            // Then: Event should be processed (no dependency errors)
            expect(() => eventManager.emit(StorePropsEventTypes.ClearRequest, {
                source: EventSource.System,
                timestamp: Date.now()
            })).not.toThrow()
        })
    })

    describe('Event Cleanup Independence', () => {
        it('should handle event cleanup independently', () => {
            // Given: Mock handler for clear events
            const clearHandler = vi.fn()
            eventManager.registerEventHandler(StorePropsEventTypes.ClearRequest, clearHandler)
            
            // When: We emit clear request
            eventManager.emit(StorePropsEventTypes.ClearRequest, {
                source: EventSource.System,
                timestamp: Date.now()
            })
            
            // Then: Should not throw any errors
            expect(clearHandler).toHaveBeenCalled()
            
            // Cleanup
            eventManager.deregisterEventHandler(StorePropsEventTypes.ClearRequest, clearHandler)
            expect(() => eventManager.deregisterEventHandler(StorePropsEventTypes.ClearRequest, clearHandler)).not.toThrow()
        })
    })
})