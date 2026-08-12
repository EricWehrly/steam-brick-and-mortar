import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../../src/core/data/DataTypes'
import { EventManager } from '../../../../src/core/EventManager'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'
import { GameEventTypes, InputEventTypes, type GameSelectedEvent } from '../../../../src/types/InteractionEvents'
import type { XRControllerRaySource } from '../../../../src/webxr/XRControllerManager'

const fakeModelInstances: Array<{
    group: THREE.Group
    setOpenAmount: ReturnType<typeof vi.fn>
    setContent: ReturnType<typeof vi.fn>
    setCoverTexture: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
}> = []

vi.mock('../../../../src/scene/game-box-fold/GameBoxFoldModel', () => ({
    // Must be a real function (not an arrow) - the real class is invoked with `new`.
    GameBoxFoldModel: vi.fn().mockImplementation(function () {
        const instance = {
            group: new THREE.Group(),
            setOpenAmount: vi.fn(),
            setContent: vi.fn(),
            setCoverTexture: vi.fn(),
            dispose: vi.fn()
        }
        fakeModelInstances.push(instance)
        return instance
    })
}))

const fakePixels = new Uint8ClampedArray(4)
const getPixelsAtSize = vi.fn().mockResolvedValue({ pixels: fakePixels, width: 1, height: 1, fromCache: false })

vi.mock('../../../../src/scene/game-box/instancing/GameArtworkProvider', () => ({
    GameArtworkProvider: { getInstance: () => ({ getArtwork: () => ({ getPixelsAtSize }) }) },
    ARTWORK_DIMENSIONS: { library: { width: 1, height: 1 } }
}))

import { GameBoxFoldCoordinator } from '../../../../src/scene/game-box-fold/GameBoxFoldCoordinator'
import { GameBoxFoldModel } from '../../../../src/scene/game-box-fold/GameBoxFoldModel'

function selectGame(appid: number): void {
    EventManager.getInstance().emit<GameSelectedEvent>(GameEventTypes.Selected, { appid })
}

function cancel(): void {
    EventManager.getInstance().emit(InputEventTypes.CancelPressed, {})
}

describe('GameBoxFoldCoordinator', () => {
    let coordinator: GameBoxFoldCoordinator

    beforeEach(() => {
        DataManager.resetInstance()
        fakeModelInstances.length = 0
        vi.mocked(GameBoxFoldModel).mockClear()

        DataManager.getInstance().set('steam.games', [
            { appid: 1, name: 'Half-Life 3', playtime_forever: 120 },
            { appid: 2, name: 'Portal 3', playtime_forever: 60 }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any, { domain: DataDomain.SteamIntegration })
    })

    afterEach(() => {
        coordinator?.dispose()
        RenderLoopRegistry.dispose()
        DataManager.resetInstance()
    })

    it('pre-warms exactly one GameBoxFoldModel at construction', () => {
        coordinator = new GameBoxFoldCoordinator()
        expect(GameBoxFoldModel).toHaveBeenCalledTimes(1)
    })

    it('selecting while no XR controller grip is available parents the model to the camera', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        const model = fakeModelInstances[0]
        expect(camera.children).toContain(model.group)
        expect(model.setContent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Half-Life 3' }))
        expect(model.group.visible).toBe(true)
    })

    it('selecting while an XR controller grip is available parents the model to the grip instead', () => {
        const camera = new THREE.Object3D()
        const grip = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        DataManager.getInstance().set<XRControllerRaySource>(DataKey.XRControllerRaySource, {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => grip
        }, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        const model = fakeModelInstances[0]
        expect(grip.children).toContain(model.group)
        expect(camera.children).not.toContain(model.group)
    })

    it('selecting a second game while one is open re-textures the same model instance, not a new one', () => {
        coordinator = new GameBoxFoldCoordinator()

        selectGame(1)
        selectGame(2)

        expect(GameBoxFoldModel).toHaveBeenCalledTimes(1)
        const model = fakeModelInstances[0]
        expect(model.setContent).toHaveBeenCalledTimes(2)
        expect(model.setContent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Portal 3' }))
    })

    it('builds the cover texture with flipY=false - THREE.DataTexture defaults to true, which '
        + 'rendered the artwork upside down (THREE.DataArrayTexture, what the shelf uses for the '
        + 'same pixel source, explicitly defaults it to false instead)', async () => {
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        await Promise.resolve()
        await Promise.resolve()

        const model = fakeModelInstances[0]
        expect(model.setCoverTexture).toHaveBeenCalled()
        const texture = model.setCoverTexture.mock.calls.at(-1)?.[0] as THREE.DataTexture
        expect(texture).toBeInstanceOf(THREE.DataTexture)
        expect(texture.flipY).toBe(false)
        expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    })

    it('CancelPressed while nothing is summoned is a no-op', () => {
        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]

        expect(() => cancel()).not.toThrow()
        expect(model.group.visible).toBe(false)
    })

    it('dispose() frees the model and unregisters from the render loop', () => {
        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]
        const unregisterSpy = vi.spyOn(RenderLoopRegistry.getInstance(), 'unregister')

        coordinator.dispose()

        expect(model.dispose).toHaveBeenCalledTimes(1)
        expect(unregisterSpy).toHaveBeenCalledWith('GameBoxFoldCoordinator')
    })
})
