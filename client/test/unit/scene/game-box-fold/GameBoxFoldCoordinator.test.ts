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
    playOpen: ReturnType<typeof vi.fn>
    playClose: ReturnType<typeof vi.fn>
    onFullyClosed: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    setContent: ReturnType<typeof vi.fn>
    setCoverTexture: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    fullyClosedCallback: (() => void) | null
}> = []

vi.mock('../../../../src/scene/game-box-fold/GameBoxFoldModel', () => ({
    // Must be a real function (not an arrow) - the real class is invoked with `new`.
    GameBoxFoldModel: vi.fn().mockImplementation(function () {
        const instance = {
            group: new THREE.Group(),
            playOpen: vi.fn(),
            playClose: vi.fn(),
            onFullyClosed: vi.fn((cb: () => void) => { instance.fullyClosedCallback = cb }),
            update: vi.fn(),
            setContent: vi.fn(),
            setCoverTexture: vi.fn(),
            dispose: vi.fn(),
            fullyClosedCallback: null as (() => void) | null
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
        expect(model.playOpen).toHaveBeenCalledTimes(1)
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

    it('selecting a second game while one is open plays close, waits for it to finish, then '
        + 'reopens with the new content - re-texturing the still-open box in place gave no visible '
        + 'feedback that the selection had even registered', () => {
        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]

        selectGame(1)
        expect(model.setContent).toHaveBeenCalledTimes(1)
        expect(model.playOpen).toHaveBeenCalledTimes(1)

        selectGame(2)
        // Not re-textured yet - still waiting on the close animation to finish.
        expect(model.setContent).toHaveBeenCalledTimes(1)
        expect(model.playClose).toHaveBeenCalledTimes(1)

        // Simulate GameBoxFoldModel's real mixer firing 'finished' after playClose() completes.
        model.fullyClosedCallback?.()

        expect(GameBoxFoldModel).toHaveBeenCalledTimes(1) // still the same pre-warmed instance
        expect(model.setContent).toHaveBeenCalledTimes(2)
        expect(model.setContent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Portal 3' }))
        expect(model.playOpen).toHaveBeenCalledTimes(2)
    })

    it('a CancelPressed that arrives while a switch is queued discards the pending switch - stays '
        + 'closed instead of reopening with the game that was queued', () => {
        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]

        selectGame(1)
        selectGame(2) // queues game 2, plays close on game 1
        cancel()

        model.fullyClosedCallback?.()

        expect(model.setContent).toHaveBeenCalledTimes(1) // never re-textured for game 2
        expect(model.playOpen).toHaveBeenCalledTimes(1) // never reopened
        expect(model.group.visible).toBe(false)
    })

    it('builds the cover texture with flipY explicitly overridden to true - THREE.DataTexture\'s own '
        + 'constructor defaults it to false (confirmed by reading DataTexture.js directly), which is '
        + 'wrong for this standard top-down decoded-image pixel source and rendered the art upside '
        + 'down - see the source comment for the full story', async () => {
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        await Promise.resolve()
        await Promise.resolve()

        const model = fakeModelInstances[0]
        expect(model.setCoverTexture).toHaveBeenCalled()
        const texture = model.setCoverTexture.mock.calls.at(-1)?.[0] as THREE.DataTexture
        expect(texture).toBeInstanceOf(THREE.DataTexture)
        expect(texture.flipY).toBe(true)
        expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    })

    it('CancelPressed while nothing is summoned is a no-op', () => {
        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]

        expect(() => cancel()).not.toThrow()
        expect(model.group.visible).toBe(false)
        expect(model.playClose).not.toHaveBeenCalled()
    })

    it('CancelPressed while something is summoned plays the close animation', () => {
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const model = fakeModelInstances[0]

        cancel()

        expect(model.playClose).toHaveBeenCalledTimes(1)
    })

    it('registers a fully-closed callback that hides/detaches the model and clears the current appid, '
        + 'so re-selecting afterward parents the model again', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]
        expect(model.onFullyClosed).toHaveBeenCalledTimes(1)

        selectGame(1)
        expect(model.group.visible).toBe(true)
        expect(camera.children).toContain(model.group)

        // Simulate GameBoxFoldModel's real mixer firing 'finished' after playClose() completes.
        model.fullyClosedCallback?.()

        expect(model.group.visible).toBe(false)
        expect(camera.children).not.toContain(model.group)
    })

    it('drives the model\'s animation every frame via update(), converting ms to seconds', () => {
        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const frameCallback = (RenderLoopRegistry.getInstance() as any).callbacks.get('GameBoxFoldCoordinator')
        frameCallback(0, 16)

        expect(model.update).toHaveBeenCalledWith(0.016)
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
