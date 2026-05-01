/**
 * Regression: wrong game detail page shown on click.
 *
 * Root cause: InstancedLabelMetadata in DataManager was never cleared between
 * game loads. On reload, a new InstancedLabelRenderer wrote new entries starting
 * at index 0, but stale entries from the previous load remained at higher indices.
 * Clicking a box at one of those stale indices returned the wrong game.
 *
 * Fix: InstancedLabelRenderer initialises a fresh metadata map in DataManager
 * on construction, and reset() also clears it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { DataKey } from '../../../../../src/core/data/DataTypes'
import { GameRenderEventTypes } from '../../../../../src/types/InteractionEvents'

// ---- mocks ----

const mockStore = new Map<string, unknown>()
const mockHandlers = new Map<string, Array<(event: CustomEvent<unknown>) => void>>()

vi.mock('../../../../../src/core/data/DataManager', () => ({
    DataManager: {
        getInstance: () => ({
            get: vi.fn((key: string) => mockStore.get(key) ?? null),
            set: vi.fn((key: string, value: unknown) => { mockStore.set(key, value) }),
            addMemoryConsumption: vi.fn(),
            removeMemoryConsumption: vi.fn(),
        }),
    },
    DataDomain: { Renderer: 'renderer' },
}))

vi.mock('../../../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            registerEventHandler: vi.fn((eventType: string, handler: (event: CustomEvent<unknown>) => void) => {
                const handlers = mockHandlers.get(eventType) ?? []
                handlers.push(handler)
                mockHandlers.set(eventType, handlers)
            }),
            deregisterEventHandler: vi.fn((eventType: string, handler: (event: CustomEvent<unknown>) => void) => {
                const handlers = mockHandlers.get(eventType)
                if (!handlers) return
                const nextHandlers = handlers.filter((h) => h !== handler)
                if (nextHandlers.length === 0) {
                    mockHandlers.delete(eventType)
                    return
                }
                mockHandlers.set(eventType, nextHandlers)
            }),
            emit: vi.fn((eventType: string, detail: unknown) => {
                const handlers = mockHandlers.get(eventType) ?? []
                for (const handler of handlers) {
                    handler({ detail } as CustomEvent<unknown>)
                }
            }),
        }),
    },
}))

vi.mock('../../../core/AppSettings', () => ({
    AppSettings: { get: vi.fn().mockReturnValue(undefined) },
    Setting: new Proxy({}, { get: (_t, k) => k }),
}))

vi.mock('../LabelTextureArrayManager', () => ({
    LabelTextureArrayManager: vi.fn().mockImplementation(() => ({
        texture: { isTexture: true },
        addTextLabel: vi.fn().mockReturnValue(0),
        flushToGpu: vi.fn(),
        compact: vi.fn().mockReturnValue({ isTexture: true }),
        getStats: vi.fn().mockReturnValue({ textureSize: 128, allocatedLayers: 32, usedLayers: 0, memoryEstimate: '0 MB' }),
        dispose: vi.fn(),
    })),
}))

vi.mock('../../SceneLayers', () => ({
    SceneLayer: { Interactable: 1 },
}))

// Stub THREE minimally — we only need the matrix math to work
vi.mock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three')
    return actual
})

beforeEach(() => {
    mockStore.clear()
    mockHandlers.clear()
})

import { InstancedLabelRenderer } from '../../../../../src/scene/game-box/instancing/InstancedLabelRenderer'

describe('InstancedLabelRenderer metadata lifecycle', () => {
    it('registers a fresh metadata map in DataManager on construction', () => {
        new InstancedLabelRenderer({ maxInstances: 10 })
        const map = mockStore.get(DataKey.InstancedLabelMetadata)
        expect(map).toBeInstanceOf(Map)
        expect((map as Map<unknown, unknown>).size).toBe(0)
    })

    it('fresh constructor replaces stale metadata from a previous renderer instance', () => {
        // Simulate first load: old renderer left stale data
        const staleMap = new Map([[0, { name: 'OldGame', position: null }]])
        mockStore.set(DataKey.InstancedLabelMetadata, staleMap)

        // New renderer constructs → must replace stale map with fresh one
        new InstancedLabelRenderer({ maxInstances: 10 })
        const map = mockStore.get(DataKey.InstancedLabelMetadata) as Map<unknown, unknown>
        expect(map).not.toBe(staleMap)   // must be a new map object
        expect(map.size).toBe(0)          // must be empty
    })

    it('updates visible instance count immediately when placing a label', () => {
        const renderer = new InstancedLabelRenderer({ maxInstances: 10 })

        const added = renderer.addLabelInstance(
            new THREE.Vector3(1, 2, 3),
            'Test Game',
            123
        )

        expect(added).toBe(true)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meshCount = ((renderer as any).instancedMesh?.count ?? -1)
        expect(meshCount).toBe(1)
    })

    it('restores label capacity on placement run reset', () => {
        const renderer = new InstancedLabelRenderer({ maxInstances: 4 })

        const pos = new THREE.Vector3(0, 0, 0)
        expect(renderer.addLabelInstance(pos, 'A', 1)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'B', 2)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'C', 3)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'D', 4)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'E', 5)).toBe(false)

        const resetHandlers = mockHandlers.get(GameRenderEventTypes.PlacementRunResetRequested)
        expect(resetHandlers?.length).toBeGreaterThan(0)
        for (const handler of resetHandlers ?? []) {
            handler({ detail: {} } as CustomEvent<unknown>)
        }

        expect(renderer.addLabelInstance(pos, 'E', 5)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'F', 6)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'G', 7)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'H', 8)).toBe(true)
        expect(renderer.addLabelInstance(pos, 'I', 9)).toBe(false)
    })
})
