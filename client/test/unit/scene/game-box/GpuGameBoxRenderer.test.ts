/**
 * GpuGameBoxRenderer — unit tests
 *
 * GpuGameBoxRenderer is now a thin coordinator: it constructs
 * LodArtworkOrchestratorDebug (via fromAppSettings) and InstancedLabelRenderer,
 * and wires placement-resolved handling plus dispose().
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
import { GameRenderEventTypes, type PlacementResolvedEvent } from '../../../../src/types/InteractionEvents'

const mockRegisterEventHandler = vi.fn()
const mockDeregisterEventHandler = vi.fn()
const mockEmitEvent = vi.fn()

// ---- mocks ----

vi.mock('../../../../src/core/AppSettings', () => ({
    AppSettings: { get: vi.fn().mockReturnValue(0.5) },
    Setting: new Proxy({}, { get: (_t, k) => k }),
}))

vi.mock('../../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            registerEventHandler: mockRegisterEventHandler,
            deregisterEventHandler: mockDeregisterEventHandler,
            emit: mockEmitEvent,
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

    function emitPlacementResolved(appid: number): void {
        const registration = mockRegisterEventHandler.mock.calls.find(
            (call: unknown[]) => call[0] === GameRenderEventTypes.PlacementResolved
        )
        expect(registration).toBeTruthy()

        const handler = registration?.[1] as (event: CustomEvent<PlacementResolvedEvent>) => void
        handler(
            new CustomEvent(GameRenderEventTypes.PlacementResolved, {
                detail: {
                    appid,
                    game: makeGame(appid) as any,
                    position: new THREE.Vector3(),
                    rotation: new THREE.Quaternion(),
                },
            })
        )
    }

    it('placement hook: uses artwork instance when atlas hit (placeInstance returns ≥ 0)', () => {
        mockPlaceInstance.mockReturnValueOnce(0)
        emitPlacementResolved(1)
        expect(mockPlaceInstance).toHaveBeenCalledTimes(1)
        expect(mockAddLabelInstance).not.toHaveBeenCalled()
    })

    it('placement hook: falls through to label when atlas miss (placeInstance returns -1)', () => {
        mockPlaceInstance.mockReturnValueOnce(-1)
        emitPlacementResolved(1)
        expect(mockPlaceInstance).toHaveBeenCalledTimes(1)
        expect(mockAddLabelInstance).toHaveBeenCalledTimes(1)
    })

    it('does not subscribe directly to PlacementRunResetRequested', () => {
        const resetRegistrations = mockRegisterEventHandler.mock.calls.filter(
            (call: unknown[]) => call[0] === GameRenderEventTypes.PlacementRunResetRequested
        )
        const rendererOwnedRegistration = resetRegistrations.find(
            (call: unknown[]) => String((call[1] as Function)?.name ?? '').includes('handlePlacementRunResetRequested')
        )
        expect(rendererOwnedRegistration).toBeFalsy()
    })

    it('dispose: disposes both renderers', () => {
        renderer.dispose()
        expect(mockOrchestratorDispose).toHaveBeenCalledTimes(1)
        expect(mockLabelDispose).toHaveBeenCalledTimes(1)
    })
})
