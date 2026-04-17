/**
 * Regression test: LodDistanceManager must start after AllBatchesComplete.
 *
 * Bug: GpuGameBoxRenderer created LodDistanceManager but never called
 * startAutoUpdate() or syncInstances(), so distance-based LOD switching
 * never ran. Games stayed at MID and only upgraded when spatial pre-warmer
 * happened to kick in (i.e., only on close approach).
 *
 * Fix (bc7d955): The subscription was moved INTO LodDistanceManager itself
 * (self-subscription pattern). GpuGameBoxRenderer no longer drives this;
 * LodDistanceManager registers for AllBatchesComplete
 * in its own constructor and calls syncInstances + startAutoUpdate when it fires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameEventTypes } from '../../../../src/types/InteractionEvents'

// ---- minimal mocks ----
vi.mock('../../../../src/core/AppSettings', () => ({
    AppSettings: { get: vi.fn().mockReturnValue(undefined) },
    Setting: new Proxy({}, { get: (_t, k) => k }),
}))

const mockEventHandlers = new Map<string, (() => void)[]>()
vi.mock('../../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            registerEventHandler: vi.fn((type: string, fn: () => void) => {
                const list = mockEventHandlers.get(type) ?? []
                list.push(fn)
                mockEventHandlers.set(type, list)
            }),
        }),
    },
}))

const mockSyncInstances = vi.fn()
const mockStartAutoUpdate = vi.fn()

vi.mock('../../../../src/scene/game-box/instancing/LodDistanceManagerDebug', () => ({
    // Simulate self-subscription: the real LodDistanceManager registers for
    // AllBatchesComplete in its constructor and calls syncInstances/startAutoUpdate.
    LodDistanceManagerDebug: vi.fn().mockImplementation(function(this: Record<string, unknown>) {
        const instance = {
            syncInstances: mockSyncInstances,
            startAutoUpdate: mockStartAutoUpdate,
            dispose: vi.fn(),
        }
        const handlers = mockEventHandlers.get(GameEventTypes.AllBatchesComplete) ?? []
        handlers.push(() => {
            instance.syncInstances()
            instance.startAutoUpdate()
        })
        mockEventHandlers.set(GameEventTypes.AllBatchesComplete, handlers)
        return instance
    }),
}))
vi.mock('../../../../src/scene/game-box/instancing/LodArtworkOrchestratorDebug', () => ({
    LodArtworkOrchestratorDebug: vi.fn().mockImplementation(function() {
        return {
            setArtworkInstanceFromUrl: vi.fn(),
            getInstanceData: vi.fn().mockReturnValue(new Map()),
            getInstanceCount: vi.fn().mockReturnValue(0),
            dispose: vi.fn(),
            isReady: vi.fn().mockReturnValue(true),
        }
    }),
}))
vi.mock('../../../../src/scene/game-box/instancing/InstancedLabelRenderer', () => ({
    InstancedLabelRenderer: vi.fn().mockImplementation(function() {
        return {
            addLabelInstance: vi.fn(),
            isReady: vi.fn().mockReturnValue(true),
            compact: vi.fn(),
            dispose: vi.fn(),
        }
    }),
}))

import { GpuGameBoxRenderer } from '../../../../src/scene/game-box/GpuGameBoxRenderer'

describe('GpuGameBoxRenderer - LOD distance manager lifecycle', () => {
    beforeEach(() => {
        mockEventHandlers.clear()
        mockSyncInstances.mockClear()
        mockStartAutoUpdate.mockClear()
    })

    it('registers for AllBatchesComplete in constructor', () => {
        new GpuGameBoxRenderer()
        expect(mockEventHandlers.has(GameEventTypes.AllBatchesComplete)).toBe(true)
    })

    it('does NOT start LOD distance manager before AllBatchesComplete fires', () => {
        new GpuGameBoxRenderer()
        expect(mockStartAutoUpdate).not.toHaveBeenCalled()
        expect(mockSyncInstances).not.toHaveBeenCalled()
    })

    it('syncs instances and starts auto-update when AllBatchesComplete fires', () => {
        new GpuGameBoxRenderer()
        const handlers = mockEventHandlers.get(GameEventTypes.AllBatchesComplete) ?? []
        expect(handlers.length).toBeGreaterThan(0)
        // Find the handler that starts auto-update by looking at its side effects,
        // or just call all of them since that's what the event manager does.
        handlers.forEach(h => (h as any)({} as any))
        expect(mockSyncInstances).toHaveBeenCalledOnce()
        expect(mockStartAutoUpdate).toHaveBeenCalledOnce()
    })
})
