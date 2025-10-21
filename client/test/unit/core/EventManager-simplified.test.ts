/**
 * Tests for the simplified EventManager API
 * 
 * This test demonstrates the new unified approach where registerEventHandler
 * can handle default, override, and standard registration through options.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventManager, EventSource, type BaseInteractionEvent } from '../../../src/core/EventManager'

interface TestEvent extends BaseInteractionEvent {
    message: string
}

describe('EventManager Simplified API', () => {
    let eventManager: EventManager
    let mockHandler1: ReturnType<typeof vi.fn>
    let mockHandler2: ReturnType<typeof vi.fn>
    let mockHandler3: ReturnType<typeof vi.fn>

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        mockHandler1 = vi.fn()
        mockHandler2 = vi.fn()
        mockHandler3 = vi.fn()
        
        // Clear any existing handlers
        eventManager.dispose()
        eventManager = EventManager.getInstance()
    })

    describe('Standard Registration (Default Behavior)', () => {
        it('should allow multiple handlers for the same event', () => {
            eventManager.registerEventHandler('test:event', mockHandler1)
            eventManager.registerEventHandler('test:event', mockHandler2)
            
            eventManager.emit<TestEvent>('test:event', { 
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).toHaveBeenCalledOnce()
            expect(mockHandler2).toHaveBeenCalledOnce()
        })
    })

    describe('Default Handler Registration', () => {
        it('should register handler when no others exist', () => {
            eventManager.registerEventHandler('test:default', mockHandler1, { isDefault: true })
            
            eventManager.emit<TestEvent>('test:default', {
                message: 'test',
                timestamp: Date.now(), 
                source: EventSource.System
            })

            expect(mockHandler1).toHaveBeenCalledOnce()
        })

        it('should skip default handler when normal handlers already exist', () => {
            // Register a normal handler first
            eventManager.registerEventHandler('test:default', mockHandler1)
            
            // Try to register a default handler - should be skipped
            eventManager.registerEventHandler('test:default', mockHandler2, { isDefault: true })
            
            eventManager.emit<TestEvent>('test:default', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).toHaveBeenCalledOnce()
            expect(mockHandler2).not.toHaveBeenCalled()
        })

        it('should allow default handler to register when no normal handlers exist', () => {
            // Register a default handler when nothing exists
            eventManager.registerEventHandler('test:default', mockHandler1, { isDefault: true })
            
            // Register another default handler - should also work
            eventManager.registerEventHandler('test:default', mockHandler2, { isDefault: true })
            
            eventManager.emit<TestEvent>('test:default', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).toHaveBeenCalledOnce()
            expect(mockHandler2).toHaveBeenCalledOnce()
        })

        it('should replace default handlers when normal handler registers later', () => {
            // Register default handlers first
            eventManager.registerEventHandler('test:default', mockHandler1, { isDefault: true })
            eventManager.registerEventHandler('test:default', mockHandler2, { isDefault: true })
            
            // Register normal handler - should replace defaults
            eventManager.registerEventHandler('test:default', mockHandler3)
            
            eventManager.emit<TestEvent>('test:default', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).not.toHaveBeenCalled()
            expect(mockHandler2).not.toHaveBeenCalled()
            expect(mockHandler3).toHaveBeenCalledOnce()
        })
    })

    describe('Override Handler Registration', () => {
        it('should replace only default handlers, not normal handlers', () => {
            // Register default handlers first
            eventManager.registerEventHandler('test:override', mockHandler1, { isDefault: true })
            eventManager.registerEventHandler('test:override', mockHandler2, { isDefault: true })
            
            // Register override handler - should replace only defaults
            eventManager.registerEventHandler('test:override', mockHandler3, { isOverride: true })
            
            eventManager.emit<TestEvent>('test:override', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).not.toHaveBeenCalled()
            expect(mockHandler2).not.toHaveBeenCalled()
            expect(mockHandler3).toHaveBeenCalledOnce()
        })

        it('should not affect normal handlers when overriding', () => {
            // Register normal handlers first
            eventManager.registerEventHandler('test:override', mockHandler1)
            eventManager.registerEventHandler('test:override', mockHandler2)
            
            // Register override handler - should NOT replace normal handlers
            eventManager.registerEventHandler('test:override', mockHandler3, { isOverride: true })
            
            eventManager.emit<TestEvent>('test:override', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).toHaveBeenCalledOnce()
            expect(mockHandler2).toHaveBeenCalledOnce()
            expect(mockHandler3).toHaveBeenCalledOnce()
        })
    })

    describe('Once Option Integration', () => {
        it('should work with once option', () => {
            eventManager.registerEventHandler('test:once', mockHandler1, { once: true })
            
            // Emit twice
            eventManager.emit<TestEvent>('test:once', {
                message: 'first',
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            eventManager.emit<TestEvent>('test:once', {
                message: 'second', 
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Should only be called once
            expect(mockHandler1).toHaveBeenCalledOnce()
        })

        it('should work with default and once options combined', () => {
            // Register standard handler first
            eventManager.registerEventHandler('test:default-once', mockHandler1)
            
            // Try to register default+once handler - should be skipped
            eventManager.registerEventHandler('test:default-once', mockHandler2, { 
                isDefault: true, 
                once: true 
            })
            
            eventManager.emit<TestEvent>('test:default-once', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).toHaveBeenCalledOnce()
            expect(mockHandler2).not.toHaveBeenCalled()
        })
    })

    describe('Backward Compatibility', () => {
        it('should support old registerDefaultHandler method', () => {
            eventManager.registerDefaultHandler('test:legacy-default', mockHandler1)
            
            eventManager.emit<TestEvent>('test:legacy-default', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).toHaveBeenCalledOnce()
        })

        it('should support old registerReplacementHandler method', () => {
            // Register default handler first
            eventManager.registerEventHandler('test:legacy-replacement', mockHandler1, { isDefault: true })
            
            // Use legacy replacement method - should replace defaults only
            eventManager.registerOverrideHandler('test:legacy-replacement', mockHandler2)
            
            eventManager.emit<TestEvent>('test:legacy-replacement', {
                message: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            expect(mockHandler1).not.toHaveBeenCalled()
            expect(mockHandler2).toHaveBeenCalledOnce()
        })
    })
})