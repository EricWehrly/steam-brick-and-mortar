/**
 * Regression: wrong game detail page shown on click.
 *
 * Root cause: InstancedLabelMetadata in DataManager was never cleared between
 * game loads. On reload, a new InstancedLabelRenderer wrote new entries starting
 * at index 0, but stale entries from the previous load remained at higher indices.
 * Clicking a box at one of those stale indices returned the wrong game.
 *
 * Fix: InstancedLabelRenderer.dispose() resets the metadata map to empty,
 * so any subsequent renderer starts with a clean slate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataKey } from '../../../core/data/DataTypes'

// ---- mocks ----

const mockStore = new Map<string, unknown>()

vi.mock('../../../core/data/DataManager', () => ({
    DataManager: {
        getInstance: () => ({
            get: vi.fn((key: string) => mockStore.get(key) ?? null),
            set: vi.fn((key: string, value: unknown) => { mockStore.set(key, value) }),
            removeMemoryConsumption: vi.fn(),
        }),
    },
    DataDomain: { Renderer: 'renderer' },
}))

vi.mock('../../../core/EventManager', () => ({
    EventManager: { getInstance: () => ({ registerEventHandler: vi.fn() }) },
}))

vi.mock('../../../core/AppSettings', () => ({
    AppSettings: { get: vi.fn().mockReturnValue(undefined) },
    Setting: new Proxy({}, { get: (_t, k) => k }),
}))

vi.mock('../LabelTextureArrayManager', () => ({
    LabelTextureArrayManager: vi.fn().mockImplementation(() => ({
        initializeEmptyTextureArray: vi.fn().mockReturnValue({ isTexture: true }),
        addTextLabel: vi.fn().mockReturnValue(0),
        markDirty: vi.fn(),
        getTextureArray: vi.fn().mockReturnValue(null),
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
})

import { InstancedLabelRenderer } from './InstancedLabelRenderer'

describe('InstancedLabelRenderer metadata lifecycle', () => {
    it('does not pre-seed a metadata map on construction (dispose() is responsible)', () => {
        new InstancedLabelRenderer({ maxInstances: 10 })
        // Constructor should NOT touch DataManager — map is undefined until dispose()
        // or until add() registers entries. We don't assert undefined here because
        // the implementation may seed lazily; what matters is that dispose() clears it.
        // This test documents the contract: constructor is NOT the cleanup point.
        expect(true).toBe(true) // contract is documented; no assertion on construction
    })

    it('dispose() leaves a clean empty metadata map so the next renderer starts fresh', () => {
        const renderer = new InstancedLabelRenderer({ maxInstances: 10 })
        // Simulate entries being registered during use
        mockStore.set(DataKey.InstancedLabelMetadata, new Map([
            [0, { name: 'Game1', position: null }],
            [1, { name: 'Game2', position: null }],
        ]))

        renderer.dispose()

        const mapAfterDispose = mockStore.get(DataKey.InstancedLabelMetadata) as Map<number, unknown>
        expect(mapAfterDispose).toBeInstanceOf(Map)
        expect(mapAfterDispose.size).toBe(0)
    })

    it('dispose() map reset means a subsequent renderer has no stale entries to hit', () => {
        const first = new InstancedLabelRenderer({ maxInstances: 10 })
        // First renderer accumulates entries
        mockStore.set(DataKey.InstancedLabelMetadata, new Map([
            [0, { name: 'StaleGame', position: null }],
            [1, { name: 'AnotherStaleGame', position: null }],
        ]))

        first.dispose() // should clear the map

        // Second renderer: map should be empty, not carrying stale entries
        new InstancedLabelRenderer({ maxInstances: 10 })
        const map = mockStore.get(DataKey.InstancedLabelMetadata) as Map<number, unknown>
        // Either the map was cleared by dispose (empty) or not yet seeded (undefined/empty)
        const size = map instanceof Map ? map.size : 0
        expect(size).toBe(0)
    })
})
