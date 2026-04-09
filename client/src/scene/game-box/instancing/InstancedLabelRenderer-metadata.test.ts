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
import { DataKey } from '../../../core/data/DataTypes'

// ---- mocks ----

const mockStore = new Map<string, unknown>()

vi.mock('../../../core/data/DataManager', () => ({
    DataManager: {
        getInstance: () => ({
            get: vi.fn((key: string) => mockStore.get(key) ?? null),
            set: vi.fn((key: string, value: unknown) => { mockStore.set(key, value) }),
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
})
