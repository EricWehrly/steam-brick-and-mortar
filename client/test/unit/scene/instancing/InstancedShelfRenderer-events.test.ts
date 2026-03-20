/**
 * Unit tests for InstancedShelfRenderer event emission
 * 
 * Tests specifically for RendererReady event behavior (Phase 3 refactoring)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InstancedShelfRenderer } from '../../../../src/scene/instancing/InstancedShelfRenderer'
import { EventManager } from '../../../../src/core/EventManager'
import { StorePropsEventTypes } from '../../../../src/types/InteractionEvents'

describe('InstancedShelfRenderer Events', () => {
    let renderer: InstancedShelfRenderer
    let eventManager: EventManager
    let rendererReadyEmitted: boolean

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        rendererReadyEmitted = false
        
        // Listen for RendererReady before creating renderer
        eventManager.registerEventHandler(
            StorePropsEventTypes.RendererReady,
            (event) => {
                if (event.detail.rendererType === 'shelf') {
                    rendererReadyEmitted = true
                }
            }
        )
        
        renderer = new InstancedShelfRenderer({
            maxShelfUnits: 10
        })
    })

    afterEach(() => {
        renderer?.dispose()
    })

    describe('RendererReady Event', () => {
        it('should emit RendererReady event after initialize() completes', async () => {
            expect(rendererReadyEmitted).toBe(false)
            
            await renderer.initialize()
            
            expect(rendererReadyEmitted).toBe(true)
        })

        it('should have rendererType: shelf in event payload', async () => {
            let eventDetail: any = null
            
            eventManager.registerEventHandler(
                StorePropsEventTypes.RendererReady,
                (event) => {
                    eventDetail = event.detail
                }
            )
            
            await renderer.initialize()
            
            expect(eventDetail).not.toBeNull()
            expect(eventDetail.rendererType).toBe('shelf')
        })

        it('should set isReady() to true before emitting event', async () => {
            let wasReadyWhenEventFired = false
            
            eventManager.registerEventHandler(
                StorePropsEventTypes.RendererReady,
                () => {
                    wasReadyWhenEventFired = renderer.isReady()
                }
            )
            
            await renderer.initialize()
            
            expect(wasReadyWhenEventFired).toBe(true)
        })

        it('should allow awaiting initialize() promise', async () => {
            expect(renderer.isReady()).toBe(false)
            
            await renderer.initialize()
            
            expect(renderer.isReady()).toBe(true)
        })

        // TODO: Test error case - what happens if initialize() fails?
        // Should it still emit RendererReady? Should it emit a different error event?
        
        // TODO: Test re-initialization - what happens if initialize() is called twice?
        // Should it emit RendererReady again or be idempotent?
    })

    describe('Backward Compatibility', () => {
        it('should support legacy isReady() polling', async () => {
            expect(renderer.isReady()).toBe(false)
            
            await renderer.initialize()
            
            expect(renderer.isReady()).toBe(true)
        })

        it('should work with both event listeners and promise awaiting', async () => {
            let eventFired = false
            
            eventManager.registerEventHandler(
                StorePropsEventTypes.RendererReady,
                () => { eventFired = true }
            )
            
            await renderer.initialize()
            
            expect(eventFired).toBe(true)
            expect(renderer.isReady()).toBe(true)
        })
    })
})
