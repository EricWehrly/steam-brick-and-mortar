/**
 * Regression test: LodDistanceManager must start after AllBatchesComplete.
 *
 * Bug: GpuGameBoxRenderer created LodDistanceManager but never called
 * startAutoUpdate() or syncInstances(), so distance-based LOD switching
 * never ran. Games stayed at MID and only upgraded when spatial pre-warmer
 * happened to kick in (i.e., only on close approach).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameEventTypes } from '../../types/InteractionEvents'

// ---- minimal mocks ----
vi.mock('../../core/AppSettings', () => ({
    AppSettings: { get: vi.fn().mockReturnValue(undefined) },
    Setting: new Proxy({}, { get: (_t, k) => k }),
}))

const mockEventHandlers = new Map<string, (() => void)[]>()
vi.mock('../../core/EventManager', () => ({
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

vi.mock('./instancing/LodDistanceManagerDebug', () => ({
    LodDistanceManagerDebug: vi.fn().mockImplementation(function() {
        return {
            syncInstances: mockSyncInstances,
            startAutoUpdate: mockStartAutoUpdate,
            dispose: vi.fn(),
        }
    }),
}))
vi.mock('./instancing/LodArtworkOrchestratorDebug', () => ({
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
vi.mock('./instancing/InstancedLabelRenderer', () => ({
    InstancedLabelRenderer: vi.fn().mockImplementation(function() {
        return {
            addLabelInstance: vi.fn(),
            isReady: vi.fn().mockReturnValue(true),
            dispose: vi.fn(),
        }
    }),
}))

import { GpuGameBoxRenderer } from './GpuGameBoxRenderer'

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
        expect(handlers).toHaveLength(1)
        handlers[0]()
        expect(mockSyncInstances).toHaveBeenCalledOnce()
        expect(mockStartAutoUpdate).toHaveBeenCalledOnce()
    })
})
