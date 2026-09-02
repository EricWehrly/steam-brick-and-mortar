import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../../src/core/data/DataTypes'
import { EventManager } from '../../../../src/core/EventManager'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'
import {
    GameEventTypes, InputEventTypes,
    type GameSelectedEvent, type SceneCanvasClickEvent, type SceneCanvasWheelEvent
} from '../../../../src/types/InteractionEvents'
import type { XRControllerSource, XRControllerState } from '../../../../src/webxr/XRControllerManager'

// Real (empty-geometry) THREE.Mesh instances shared between the model mock's
// getInteractiveMeshes() and the intersectObjects() stubs below, so "which mesh got hit" can be
// asserted by reference equality the same way the real raycastAgainstBox() does.
const fakeStoreMesh = new THREE.Mesh()
const fakeIdentityMesh = new THREE.Mesh()
const fakeDebugMesh = new THREE.Mesh()

const fakeModelInstances: Array<{
    group: THREE.Group
    playOpen: ReturnType<typeof vi.fn>
    playClose: ReturnType<typeof vi.fn>
    onFullyClosed: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    setContent: ReturnType<typeof vi.fn>
    setHeaderImage: ReturnType<typeof vi.fn>
    getInteractiveMeshes: ReturnType<typeof vi.fn>
    isContentFaceHit: ReturnType<typeof vi.fn>
    isPointInPlayButton: ReturnType<typeof vi.fn>
    isPointInCacheEntry: ReturnType<typeof vi.fn>
    scrollDebugPanel: ReturnType<typeof vi.fn>
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
            setHeaderImage: vi.fn(),
            getInteractiveMeshes: vi.fn(() => ({ store: fakeStoreMesh, identity: fakeIdentityMesh, debug: fakeDebugMesh })),
            isContentFaceHit: vi.fn(() => true),
            isPointInPlayButton: vi.fn(() => false),
            isPointInCacheEntry: vi.fn(() => true),
            scrollDebugPanel: vi.fn(),
            dispose: vi.fn(),
            fullyClosedCallback: null as (() => void) | null
        }
        fakeModelInstances.push(instance)
        return instance
    }),
    PANEL_CANVAS_SIZE: 512,
    // Real value (see GameBoxFoldModel.ts) - GameBoxFoldCoordinator's computeCameraAnchorDistance()
    // divides by this, so leaving it unmocked/undefined here would silently NaN the whole
    // camera-anchor-distance calculation rather than fail loudly.
    OPEN_BOX_HALF_WIDTH: 0.45
}))

const fakePixels = new Uint8ClampedArray(4)
const getPixelsAtSize = vi.fn().mockResolvedValue({ pixels: fakePixels, width: 1, height: 1, fromCache: false })
const getArtwork = vi.fn(() => ({ getPixelsAtSize }))

vi.mock('../../../../src/scene/game-box/instancing/GameArtworkProvider', () => ({
    GameArtworkProvider: { getInstance: () => ({ getArtwork }) },
    ARTWORK_DIMENSIONS: { header: { width: 1, height: 1 } }
}))

import { GameBoxFoldCoordinator } from '../../../../src/scene/game-box-fold/GameBoxFoldCoordinator'
import { GameBoxFoldModel } from '../../../../src/scene/game-box-fold/GameBoxFoldModel'

function selectGame(appid: number): void {
    EventManager.getInstance().emit<GameSelectedEvent>(GameEventTypes.Selected, { appid })
}

function cancel(): void {
    EventManager.getInstance().emit(InputEventTypes.CancelPressed, {})
}

function click(button = 0, ndcX = 0, ndcY = 0): void {
    EventManager.getInstance().emit<SceneCanvasClickEvent>(InputEventTypes.SceneCanvasClick, {
        clientX: 0, clientY: 0, button, ndcX, ndcY
    })
}

function wheel(deltaY: number, ndcX = 0, ndcY = 0): void {
    EventManager.getInstance().emit<SceneCanvasWheelEvent>(InputEventTypes.SceneCanvasWheel, { ndcX, ndcY, deltaY })
}

/** Stubs THREE.Raycaster.intersectObjects for one call to report a hit on the given mesh, uv at
 *  its center. raycastAgainstBox() only reads .object/.uv/.face.materialIndex off the result. */
function stubRaycastHit(mesh: THREE.Mesh): void {
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValueOnce([
        { object: mesh, uv: new THREE.Vector2(0.5, 0.5), face: { materialIndex: 0 } } as unknown as THREE.Intersection
    ])
}

function stubRaycastMiss(): void {
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValueOnce([])
}

describe('GameBoxFoldCoordinator', () => {
    let coordinator: GameBoxFoldCoordinator
    let originalLocation: Location

    beforeEach(() => {
        DataManager.resetInstance()
        fakeModelInstances.length = 0
        vi.mocked(GameBoxFoldModel).mockClear()

        DataManager.getInstance().set('steam.games', [
            { appid: 1, name: 'Half-Life 3', playtime_forever: 120 },
            { appid: 2, name: 'Portal 3', playtime_forever: 60 }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any, { domain: DataDomain.SteamIntegration })

        // Stubbed so "clicking Play navigates to steam://run/..." can assert against it without
        // jsdom's real (unimplemented) navigation logging noise.
        originalLocation = window.location
        Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true })

        // vi.spyOn returns the SAME mock across tests for a given prototype method - reset its
        // call history/queued mockReturnValueOnce values so one test's stubs can't leak into the
        // next (or, via an unreached early-return, into a later call within the same test).
        vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReset()
    })

    afterEach(() => {
        coordinator?.dispose()
        RenderLoopRegistry.dispose()
        DataManager.resetInstance()
        Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true })
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

    it('holds the open box further from a real PerspectiveCamera at a narrower aspect ratio, so the same physical-width open spread keeps fitting a narrower horizontal FOV', () => {
        const wideCamera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100)
        DataManager.getInstance().set(DataKey.MainCamera, wideCamera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const wideDistance = -fakeModelInstances[0].group.position.z
        coordinator.dispose()
        fakeModelInstances.length = 0

        DataManager.resetInstance()
        DataManager.getInstance().set('steam.games', [
            { appid: 1, name: 'Half-Life 3', playtime_forever: 120 }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any, { domain: DataDomain.SteamIntegration })
        const narrowCamera = new THREE.PerspectiveCamera(70, 9 / 16, 0.1, 100)
        DataManager.getInstance().set(DataKey.MainCamera, narrowCamera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const narrowDistance = -fakeModelInstances[0].group.position.z

        expect(narrowDistance).toBeGreaterThan(wideDistance)
        // Both stay within the sanity clamp, not runaway near/far values.
        expect(wideDistance).toBeGreaterThanOrEqual(0.5)
        expect(narrowDistance).toBeLessThanOrEqual(1.4)
    })

    it('falls back to a fixed distance when the published MainCamera is not a real PerspectiveCamera (no fov/aspect to compute from)', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        expect(fakeModelInstances[0].group.position.z).toBeCloseTo(-0.7)
    })

    it('builds rating/playtime/tags content from full game data - genres then top community '
        + 'tags, deduped and capped at MAX_TAGS_SHOWN - the sections carried over from '
        + 'BinderGameDetailPanel', () => {
        DataManager.getInstance().set('steam.games', [{
            appid: 3,
            name: 'Deep Rock Galactic',
            playtime_forever: 600,
            playtime_2weeks: 120,
            userscore: 97,
            genres: [{ description: 'Action' }, { description: 'Indie' }],
            steamspy_top_tags: ['Action', 'Co-op', 'FPS', 'Multiplayer', 'Mining', 'Difficult']
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }] as any, { domain: DataDomain.SteamIntegration })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(3)

        const model = fakeModelInstances[0]
        expect(model.setContent).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Deep Rock Galactic',
            rating: '97% · Overwhelmingly Positive',
            playtimeHours: 10,
            recentPlaytimeHours: 2,
            tags: ['Action', 'Indie', 'Co-op', 'FPS', 'Multiplayer', 'Mining']
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content = model.setContent.mock.calls[0][0] as any
        expect(JSON.parse(content.debugJson)).toMatchObject({ appid: 3, name: 'Deep Rock Galactic' })
    })

    it('passes Steam category descriptions through as plain text', () => {
        DataManager.getInstance().set('steam.games', [{
            appid: 4,
            name: 'Portal 2',
            playtime_forever: 60,
            categories: [{ description: 'Co-op' }, { description: 'Steam Achievements' }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }] as any, { domain: DataDomain.SteamIntegration })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(4)

        expect(fakeModelInstances[0].setContent).toHaveBeenCalledWith(expect.objectContaining({
            categories: ['Co-op', 'Steam Achievements']
        }))
    })

    it('omits rating (not "Unrated") when userscore is genuinely missing, alongside undefined playtime/empty tags, for a game with no metadata beyond name', () => {
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1) // fixture game 1 has no userscore/genres/tags/playtime_2weeks

        const model = fakeModelInstances[0]
        expect(model.setContent).toHaveBeenCalledWith(expect.objectContaining({
            rating: undefined,
            recentPlaytimeHours: undefined,
            tags: []
        }))
    })

    it('shows "Unrated" when userscore is really 0 (Steam confirms no reviews), distinct from missing data', () => {
        DataManager.getInstance().set('steam.games', [{
            appid: 5,
            name: 'Brand New Release',
            userscore: 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }] as any, { domain: DataDomain.SteamIntegration })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(5)

        expect(fakeModelInstances[0].setContent).toHaveBeenCalledWith(expect.objectContaining({
            rating: 'Unrated'
        }))
    })

    it('selecting with two connected XR controllers parents the model to the primary grip instead', () => {
        const camera = new THREE.Object3D()
        const grip = new THREE.Object3D()
        const connectedControllers: XRControllerState[] = [
            { index: 0, handedness: 'left', targetRaySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace, triggerValue: 0 },
            { index: 1, handedness: 'right', targetRaySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace, triggerValue: 0 }
        ]
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        DataManager.getInstance().set<XRControllerSource>(DataKey.XRControllerSource, {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => grip,
            getConnectedControllers: () => connectedControllers
        }, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        const model = fakeModelInstances[0]
        expect(grip.children).toContain(model.group)
        expect(camera.children).not.toContain(model.group)
    })

    it('selecting with only one connected XR controller camera-anchors instead of grip-anchoring - '
        + 'a lone controller needs to stay free for pointing/interacting, not glued to the box', () => {
        const camera = new THREE.Object3D()
        const grip = new THREE.Object3D()
        const connectedControllers: XRControllerState[] = [
            { index: 0, handedness: 'right', targetRaySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace, triggerValue: 0 }
        ]
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        DataManager.getInstance().set<XRControllerSource>(DataKey.XRControllerSource, {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => grip,
            getConnectedControllers: () => connectedControllers
        }, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        const model = fakeModelInstances[0]
        expect(camera.children).toContain(model.group)
        expect(grip.children).not.toContain(model.group)
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

    it('fetches header (not library) format art and hands the model plain pixels for the store '
        + "panel's disc - GameBoxFoldModel rasterizes it into a canvas itself, so there's no "
        + 'THREE texture (and no DataTexture flipY quirk) to build here anymore', async () => {
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        await Promise.resolve()
        await Promise.resolve()

        expect(getArtwork).toHaveBeenLastCalledWith(1, 'Half-Life 3', 'header', expect.anything())

        const model = fakeModelInstances[0]
        expect(model.setHeaderImage).toHaveBeenLastCalledWith({ pixels: fakePixels, width: 1, height: 1 })
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

    it('clicking the Play button (button 0, hit on the store mesh, within the button rect) launches steam://run/<appid>', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const model = fakeModelInstances[0]
        model.isPointInPlayButton.mockReturnValue(true)

        stubRaycastHit(fakeStoreMesh)
        click(0)

        expect(window.location.href).toBe('steam://run/1')
    })

    it('does not launch when the hit is on the store mesh but outside the Play button rect', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        fakeModelInstances[0].isPointInPlayButton.mockReturnValue(false)

        stubRaycastHit(fakeStoreMesh)
        click(0)

        expect(window.location.href).toBe('')
    })

    it('does not launch on a non-primary button - never even reaches the raycaster', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        fakeModelInstances[0].isPointInPlayButton.mockReturnValue(true)
        const intersectSpy = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects')

        click(2) // right-click, not the primary button SceneClickGameBoxRaycast itself also gates on

        expect(intersectSpy).not.toHaveBeenCalled()
        expect(window.location.href).toBe('')
    })

    it('does not launch on a raycast miss', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        fakeModelInstances[0].isPointInPlayButton.mockReturnValue(true)

        stubRaycastMiss()
        click(0)

        expect(window.location.href).toBe('')
    })

    it('does not launch when the hit lands on one of the store mesh\'s five blank faces', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const model = fakeModelInstances[0]
        model.isPointInPlayButton.mockReturnValue(true)
        model.isContentFaceHit.mockReturnValue(false)

        stubRaycastHit(fakeStoreMesh)
        click(0)

        expect(window.location.href).toBe('')
    })

    it('a click before any game is summoned never reaches the raycaster', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        const intersectSpy = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects')

        click(0)

        expect(intersectSpy).not.toHaveBeenCalled()
        expect(window.location.href).toBe('')
    })

    it('scrolling over the debug panel forwards deltaY to scrollDebugPanel()', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const model = fakeModelInstances[0]

        stubRaycastHit(fakeDebugMesh)
        wheel(240)

        expect(model.scrollDebugPanel).toHaveBeenCalledWith(240)
    })

    it('scrolling over the store or identity panel does not touch the debug panel', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const model = fakeModelInstances[0]

        stubRaycastHit(fakeStoreMesh)
        wheel(100)
        stubRaycastHit(fakeIdentityMesh)
        wheel(100)

        expect(model.scrollDebugPanel).not.toHaveBeenCalled()
    })

    it('scrolling over the debug panel but outside the cache-entry viewport does not scroll it', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)
        const model = fakeModelInstances[0]
        model.isPointInCacheEntry.mockReturnValue(false)

        stubRaycastHit(fakeDebugMesh)
        wheel(240)

        expect(model.scrollDebugPanel).not.toHaveBeenCalled()
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
