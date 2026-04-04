/**
 * EventManager: default-handler footgun tests
 *
 * registerDefaultHandler() is a FALLBACK mechanism, not a subscription mechanism.
 * It is silently skipped when a normal handler already exists for the same event type.
 *
 * The correct pattern for side-effect observers (e.g. LightingRenderer, SharedMaterialManager)
 * is registerEventHandler() with no options. These tests document and protect against
 * the footgun of using registerDefaultHandler() for side-effect observation.
 *
 * Design intent:
 *   - registerDefaultHandler   → "handle this if nobody else will" (LegacyStorePropsHandler)
 *   - registerEventHandler     → "always handle this, alongside others" (LightingRenderer, etc.)
 *
 * If any of these tests fail, EventManager semantics have changed and callers that
 * rely on the silent-skip behavior (LegacyStorePropsHandler) may now fire when they
 * shouldn't — and vice versa.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventManager, type BaseInteractionEvent } from '../../../src/core/EventManager'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Fresh EventManager for each test — resets singleton state */
function freshEventManager(): EventManager {
    // @ts-ignore — reset singleton so tests are isolated
    EventManager['instance'] = undefined
    return EventManager.getInstance()
}

/** Registers a plain normal handler to simulate "primary handler already registered" */
function registerNormalHandler(em: EventManager, eventType: string): ReturnType<typeof vi.fn> {
    const handler = vi.fn()
    em.registerEventHandler(eventType, handler)
    return handler
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('EventManager: registerDefaultHandler is a fallback, not a subscription', () => {
    let em: EventManager

    beforeEach(() => {
        em = freshEventManager()
    })

    // ── Core contract ──────────────────────────────────────────────────────────

    it('default handler fires when NO normal handler exists', () => {
        const observer = vi.fn()
        em.registerDefaultHandler('test:event', observer)

        em.emit<BaseInteractionEvent>('test:event', {})

        expect(observer).toHaveBeenCalledOnce()
    })

    it('default handler is silently skipped when a normal handler already exists', () => {
        const primaryHandler = registerNormalHandler(em, 'test:event')
        const observer = vi.fn()

        em.registerDefaultHandler('test:event', observer)

        em.emit<BaseInteractionEvent>('test:event', {})

        expect(primaryHandler).toHaveBeenCalledOnce()
        expect(observer).not.toHaveBeenCalled()
    })

    it('default handler is silently skipped regardless of registration order relative to emit', () => {
        // Register normal handler, then default, then emit — same result
        registerNormalHandler(em, 'test:order')
        const lateDefault = vi.fn()
        em.registerDefaultHandler('test:order', lateDefault)

        em.emit<BaseInteractionEvent>('test:order', {})

        expect(lateDefault).not.toHaveBeenCalled()
    })

    // ── The footgun scenario ───────────────────────────────────────────────────

    it('[FOOTGUN] side-effect observer using registerDefaultHandler is silently lost when primary handler exists', () => {
        /**
         * This is the exact failure mode that broke LightingRenderer.
         *
         * An observer that *must* run on every event (lighting setup, material prewarm,
         * analytics, etc.) MUST use registerEventHandler(), not registerDefaultHandler().
         *
         * If this test starts failing (observer suddenly IS called), it means EventManager
         * semantics changed and the fallback contract is broken — audit all callers.
         */
        registerNormalHandler(em, 'store-props:setup-request')

        const sideEffectObserver = vi.fn() // e.g. LightingRenderer.setupBasicLighting
        em.registerDefaultHandler('store-props:setup-request', sideEffectObserver)

        em.emit<BaseInteractionEvent>('store-props:setup-request', {})

        expect(sideEffectObserver).not.toHaveBeenCalled()
    })

    it('[CORRECT PATTERN] side-effect observer using registerEventHandler always fires', () => {
        /**
         * Multiple normal handlers all fire — this is the right model for observers.
         */
        const primaryHandler = registerNormalHandler(em, 'store-props:setup-request')
        const lightingObserver = vi.fn()
        const materialObserver = vi.fn()

        em.registerEventHandler('store-props:setup-request', lightingObserver)
        em.registerEventHandler('store-props:setup-request', materialObserver)

        em.emit<BaseInteractionEvent>('store-props:setup-request', {})

        expect(primaryHandler).toHaveBeenCalledOnce()
        expect(lightingObserver).toHaveBeenCalledOnce()
        expect(materialObserver).toHaveBeenCalledOnce()
    })

    // ── Default handler eviction ───────────────────────────────────────────────

    it('default handler is evicted when a normal handler registers after it', () => {
        /**
         * Default handlers are not permanent — they are replaced the moment any
         * normal handler registers for the same event. This ensures the fallback
         * (LegacyStorePropsHandler) doesn't run alongside the primary (GpuStorePropsEventHandler).
         */
        const fallback = vi.fn()
        em.registerDefaultHandler('test:eviction', fallback)

        // Primary handler arrives later
        const primary = vi.fn()
        em.registerEventHandler('test:eviction', primary)

        em.emit<BaseInteractionEvent>('test:eviction', {})

        expect(primary).toHaveBeenCalledOnce()
        expect(fallback).not.toHaveBeenCalled() // evicted
    })

    it('multiple default handlers are all evicted when a normal handler registers', () => {
        const fallback1 = vi.fn()
        const fallback2 = vi.fn()
        em.registerDefaultHandler('test:multi-eviction', fallback1)
        em.registerDefaultHandler('test:multi-eviction', fallback2)

        const primary = vi.fn()
        em.registerEventHandler('test:multi-eviction', primary)

        em.emit<BaseInteractionEvent>('test:multi-eviction', {})

        expect(primary).toHaveBeenCalledOnce()
        expect(fallback1).not.toHaveBeenCalled()
        expect(fallback2).not.toHaveBeenCalled()
    })

    // ── Isolation: distinct event types don't interfere ───────────────────────

    it('default handler on event A is not affected by normal handler on event B', () => {
        registerNormalHandler(em, 'test:event-b')
        const defaultOnA = vi.fn()
        em.registerDefaultHandler('test:event-a', defaultOnA)

        em.emit<BaseInteractionEvent>('test:event-a', {})

        expect(defaultOnA).toHaveBeenCalledOnce()
    })
})
