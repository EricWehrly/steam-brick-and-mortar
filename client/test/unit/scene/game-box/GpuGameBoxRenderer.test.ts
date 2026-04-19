/**
 * GpuGameBoxRenderer — unit tests
 *
 * GpuGameBoxRenderer is now a thin coordinator: it constructs
 * LodArtworkOrchestratorDebug (via fromAppSettings) and InstancedLabelRenderer,
 * and provides placeGame() / clearPlacements() / dispose().
 *
 * The LodDistanceManager lifecycle tests that previously lived here have moved:
 * LodDistanceManager is now owned by LodArtworkOrchestratorDebug and
 * self-subscribes in its own constructor. Tests for that contract belong in
 * LodArtworkOrchestratorDebug tests.
 *
 * TD: add LodArtworkOrchestratorDebug-level test for AllBatchesComplete → LOD start.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// ---- mocks ----

vi.mock('../../../../src/core/AppSettings', () => ({
    AppSettings: { get: vi.fn().mockReturnValue(0.5) },
    Setting: new Proxy({}, { get: (_t, k) => k }),
}))

vi.mock('../../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            registerEventHandler: vi.fn(),
            emit: vi.fn(),
        }),
    },
}))

const mockPlaceInstance = vi.fn(() => 0)
const mockPrefetchArtwork = vi.fn(() => Promise.resolve('prefetched'))
const mockClearPlacements = vi.fn()
const mockOrchestratorDispose = vi.fn()

vi.mock('../../../../src/scene/game-box/instancing/LodArtworkOrchestratorDebug', () => {
    class MockOrchestrator {
        placeInstance = mockPlaceInstance
        prefetchArtwork = mockPrefetchArtwork
        clearPlacements = mockClearPlacements
        dispose = mockOrchestratorDispose
        getInstanceCount = vi.fn(() => 0)
        static fromAppSettings(_maxGames?: number) { return new MockOrchestrator() }
    }
    return { LodArtworkOrchestratorDebug: MockOrchestrator }
})

const mockAddLabelInstance = vi.fn(() => true)
const mockLabelClear = vi.fn()
const mockLabelDispose = vi.fn()

vi.mock('../../../../src/scene/game-box/instancing/InstancedLabelRenderer', () => ({
    InstancedLabelRenderer: vi.fn().mockImplementation(function() {
        this.addLabelInstance = mockAddLabelInstance
        this.clear = mockLabelClear
        this.dispose = mockLabelDispose
    }),
}))

import { GpuGameBoxRenderer } from '../../../../src/scene/game-box/GpuGameBoxRenderer'

const makeGame = (appid: number) => ({
    appid,
    name: `Game ${appid}`,
    playtime_forever: 0,
    img_icon_url: '',
    img_logo_url: '',
})

describe('GpuGameBoxRenderer', () => {
    let renderer: GpuGameBoxRenderer

    beforeEach(() => {
        vi.clearAllMocks()
        renderer = new GpuGameBoxRenderer(100)
    })

    it('constructs without throwing', () => {
        expect(renderer).toBeDefined()
    })

    it('placeGame: uses artwork instance when atlas hit (placeInstance returns ≥ 0)', () => {
        mockPlaceInstance.mockReturnValueOnce(0)
        renderer.placeGame(makeGame(1) as any, new THREE.Vector3(), new THREE.Quaternion())
        expect(mockPlaceInstance).toHaveBeenCalledTimes(1)
        expect(mockAddLabelInstance).not.toHaveBeenCalled()
    })

    it('placeGame: falls through to label when atlas miss (placeInstance returns -1)', () => {
        mockPlaceInstance.mockReturnValueOnce(-1)
        renderer.placeGame(makeGame(1) as any, new THREE.Vector3(), new THREE.Quaternion())
        expect(mockPlaceInstance).toHaveBeenCalledTimes(1)
        expect(mockAddLabelInstance).toHaveBeenCalledTimes(1)
    })

    it('clearPlacements: clears both artwork and label renderers', () => {
        renderer.clearPlacements()
        expect(mockClearPlacements).toHaveBeenCalledTimes(1)
        expect(mockLabelClear).toHaveBeenCalledTimes(1)
    })

    it('dispose: disposes both renderers', () => {
        renderer.dispose()
        expect(mockOrchestratorDispose).toHaveBeenCalledTimes(1)
        expect(mockLabelDispose).toHaveBeenCalledTimes(1)
    })
})
