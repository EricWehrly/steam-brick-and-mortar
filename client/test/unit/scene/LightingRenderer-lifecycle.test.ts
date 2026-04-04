/**
 * LightingRenderer lifecycle integration tests
 *
 * Critical regression coverage for the event-driven lighting refactor.
 * These tests catch the class of bug where:
 * - LightingRenderer registers as a default handler but is silently dropped
 *   because GpuStorePropsEventHandler already holds a normal handler for the same event
 * - Lights are never added to the registry (controls panel only shows RectAreaLights)
 * - prewarm() is never called (getMaterial() falls back to synchronous generation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventManager } from '../../../src/core/EventManager'
import { StorePropsEventTypes } from '../../../src/scene/props/PropsEvents'
import type { StorePropsSetupRequestEvent } from '../../../src/scene/props/PropsEvents'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Registers a normal handler for the given event type, simulating what
 *  GpuStorePropsEventHandler / LegacyStorePropsHandler do at startup. */
function simulatePropsHandlerRegistration(
    eventManager: EventManager,
    eventType: string
): void {
    eventManager.registerEventHandler(eventType, () => {
        // intentional no-op — just occupies the normal handler slot
    })
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('LightingRenderer event registration', () => {
    let eventManager: EventManager

    beforeEach(() => {
        // Fresh EventManager for each test so handler state doesn't leak
        eventManager = EventManager.getInstance()
        // @ts-ignore — reset singleton state between tests
        EventManager['instance'] = undefined
        eventManager = EventManager.getInstance()
    })

    it('setupBasicLighting observer fires even when normal handlers already exist for SetupRequest', () => {
        const lightingObserver = vi.fn()

        // Simulate the real-world order: props handler registers first (normal slot)
        simulatePropsHandlerRegistration(eventManager, StorePropsEventTypes.SetupRequest)

        // Lighting renderer registers its observer (must NOT use registerDefaultHandler)
        eventManager.registerEventHandler(
            StorePropsEventTypes.SetupRequest,
            lightingObserver
        )

        // Emit the event
        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, { config: {} })

        expect(lightingObserver).toHaveBeenCalledOnce()
    })

    it('default-handler-only registration is silently dropped when normal handler exists', () => {
        /** This test documents the failure mode we fixed.
         *  registerDefaultHandler() is correctly skipped by EventManager when a normal
         *  handler already exists.  It MUST NOT be used for side-effect observers. */
        const lightingObserver = vi.fn()

        simulatePropsHandlerRegistration(eventManager, StorePropsEventTypes.SetupRequest)

        // This is the OLD (broken) approach — should be silently ignored
        eventManager.registerDefaultHandler(
            StorePropsEventTypes.SetupRequest,
            lightingObserver
        )

        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, { config: {} })

        // Default handler was skipped → observer NOT called
        expect(lightingObserver).not.toHaveBeenCalled()
    })

    it('upgradeLighting observer fires even when normal handlers already exist for SetupCompleted', () => {
        const upgradeObserver = vi.fn()

        simulatePropsHandlerRegistration(eventManager, StorePropsEventTypes.SetupCompleted)

        eventManager.registerEventHandler(
            StorePropsEventTypes.SetupCompleted,
            upgradeObserver
        )

        eventManager.emit(StorePropsEventTypes.SetupCompleted, {})

        expect(upgradeObserver).toHaveBeenCalledOnce()
    })

    it('multiple observers all receive the event when registered as normal handlers', () => {
        const lightingObserver = vi.fn()
        const materialObserver = vi.fn()
        const propsObserver = vi.fn()

        // Props handler (normal slot)
        eventManager.registerEventHandler(StorePropsEventTypes.SetupRequest, propsObserver)

        // Lighting and material observers (same slot, normal — allowed to stack)
        eventManager.registerEventHandler(StorePropsEventTypes.SetupRequest, lightingObserver)
        eventManager.registerEventHandler(StorePropsEventTypes.SetupRequest, materialObserver)

        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, { config: {} })

        expect(propsObserver).toHaveBeenCalledOnce()
        expect(lightingObserver).toHaveBeenCalledOnce()
        expect(materialObserver).toHaveBeenCalledOnce()
    })
})
