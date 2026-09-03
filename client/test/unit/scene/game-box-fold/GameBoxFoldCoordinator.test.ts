import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../../src/core/data/DataTypes'
import { EventManager } from '../../../../src/core/EventManager'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'
import { GameEventTypes, InputEventTypes, type GameSelectedEvent } from '../../../../src/types/InteractionEvents'
import type { XRControllerSource, XRControllerState } from '../../../../src/webxr/XRControllerManager'

const fakeModelInstances: Array<{
    group: THREE.Group
    playOpen: ReturnType<typeof vi.fn>
    playClose: ReturnType<typeof vi.fn>
    onFullyClosed: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    setContent: ReturnType<typeof vi.fn>
    setHeaderImage: ReturnType<typeof vi.fn>
    getPanelRoots: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    fullyClosedCallback: (() => void) | null
    /** The Play handler the coordinator hands the store panel at construction - the only way this
     *  class can be asked to launch a game now that hit-testing lives inside uikit. */
    playHandler: (() => void) | null
}> = []

vi.mock('../../../../src/scene/game-box-fold/GameBoxFoldModel', () => ({
    // Must be a real function (not an arrow) - the real class is invoked with `new`.
    GameBoxFoldModel: vi.fn().mockImplementation(function (onPlay: () => void) {
        const instance = {
            group: new THREE.Group(),
            playOpen: vi.fn(),
            playClose: vi.fn(),
            onFullyClosed: vi.fn((cb: () => void) => { instance.fullyClosedCallback = cb }),
            update: vi.fn(),
            setContent: vi.fn(),
            setHeaderImage: vi.fn(),
            getPanelRoots: vi.fn(() => []),
            dispose: vi.fn(),
            fullyClosedCallback: null as (() => void) | null,
            playHandler: onPlay as (() => void) | null
        }
        fakeModelInstances.push(instance)
        return instance
    })
}))

const fakePixels = new Uint8ClampedArray(4)
const getPixelsAtSize = vi.fn().mockResolvedValue({ pixels: fakePixels, width: 1, height: 1, fromCache: false })
const getArtwork = vi.fn(() => ({ getPixelsAtSize }))

vi.mock('../../../../src/scene/game-box/instancing/GameArtworkProvider', () => ({
    GameArtworkProvider: { getInstance: () => ({ getArtwork }) },
    ARTWORK_DIMENSIONS: { header: { width: 1, height: 1 } }
}))

import {
    GameBoxFoldCoordinator, MODEL_FACING_ROTATION_Y,
    FLATSCREEN_TILT_PITCH_DEGREES,
    OPEN_BOX_SAFE_FOV_FRACTION, CAMERA_ANCHOR_DISTANCE_MARGIN, VR_CAMERA_ANCHOR_DISTANCE_MARGIN,
    MIN_CAMERA_ANCHOR_DISTANCE, MAX_CAMERA_ANCHOR_DISTANCE
} from '../../../../src/scene/game-box-fold/GameBoxFoldCoordinator'
import { OPEN_BOX_HALF_WIDTH } from '../../../../src/scene/game-box-fold/GameBoxFoldDimensions'
import { GameBoxFoldModel } from '../../../../src/scene/game-box-fold/GameBoxFoldModel'

function selectGame(appid: number): void {
    EventManager.getInstance().emit<GameSelectedEvent>(GameEventTypes.Selected, { appid })
}

function cancel(): void {
    EventManager.getInstance().emit(InputEventTypes.CancelPressed, {})
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

        // Stubbed so "Play navigates to steam://run/..." can assert against it without jsdom's
        // real (unimplemented) navigation logging noise.
        originalLocation = window.location
        Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true })
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

    it('holds the flatscreen (zero-controller) box at a slight pitch, not square to the camera - '
        + 'a dead-on angle read as flat/2D rather than a real object. Pitch only, deliberately no '
        + 'yaw - see FLATSCREEN_TILT_PITCH_DEGREES\' own comment for why a yaw was tried and '
        + 'dropped', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        const model = fakeModelInstances[0]
        expect(model.group.rotation.y).toBeCloseTo(MODEL_FACING_ROTATION_Y)
        expect(model.group.rotation.x).toBeCloseTo(THREE.MathUtils.degToRad(FLATSCREEN_TILT_PITCH_DEGREES))
    })

    it('keeps the box\'s top edge level under its real rotation - MODEL_FACING_ROTATION_Y\'s own '
        + '180-degree yaw combined with the flatscreen pitch - even though THREE\'s default Euler '
        + 'order would roll a level edge once any yaw and any pitch are both nonzero (verified '
        + 'empirically, not assumed); rotation.order must be \'YXZ\' (pitch first) to prevent that '
        + '(direct request, 2026-09-02, screenshot markup: "held at an angle on an axis I expect '
        + 'to be flat")', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        const model = fakeModelInstances[0]
        expect(model.group.rotation.order).toBe('YXZ')

        // The model's own local X axis is the box's top-edge direction (BoxGeometry's width axis) -
        // confirm it actually stays level (zero world-Y component) under the real combined rotation,
        // not just that .order is set to the right string.
        model.group.updateMatrixWorld(true)
        const edgeStart = new THREE.Vector3(-1, 0, 0).applyMatrix4(model.group.matrixWorld)
        const edgeEnd = new THREE.Vector3(1, 0, 0).applyMatrix4(model.group.matrixWorld)
        expect(edgeEnd.y - edgeStart.y).toBeCloseTo(0, 5)
    })

    it('holds the open box further from a real PerspectiveCamera than the FOV-fit calculation '
        + 'alone would - CAMERA_ANCHOR_DISTANCE_MARGIN adds reserve distance on top of the tightest fit', () => {
        const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100)
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        const verticalFovRad = THREE.MathUtils.degToRad(camera.fov)
        const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * camera.aspect)
        const tightestFitDistance = OPEN_BOX_HALF_WIDTH / (OPEN_BOX_SAFE_FOV_FRACTION * Math.tan(horizontalFovRad / 2))

        const actualDistance = -fakeModelInstances[0].group.position.z
        expect(actualDistance).toBeCloseTo(tightestFitDistance + CAMERA_ANCHOR_DISTANCE_MARGIN)
    })

    it('uses VR_CAMERA_ANCHOR_DISTANCE_MARGIN instead when camera-anchored with a single connected '
        + 'controller (VR) - flatscreen and VR share the same camera-anchor path but not the same '
        + 'reserve distance (direct request, 2026-09-02, round six: VR still read as "too close" '
        + 'after a flatscreen-only "closer" request had reduced the shared margin)', () => {
        const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100)
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

        const verticalFovRad = THREE.MathUtils.degToRad(camera.fov)
        const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * camera.aspect)
        const tightestFitDistance = OPEN_BOX_HALF_WIDTH / (OPEN_BOX_SAFE_FOV_FRACTION * Math.tan(horizontalFovRad / 2))

        const actualDistance = -fakeModelInstances[0].group.position.z
        expect(actualDistance).toBeCloseTo(tightestFitDistance + VR_CAMERA_ANCHOR_DISTANCE_MARGIN)
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
        expect(wideDistance).toBeGreaterThanOrEqual(MIN_CAMERA_ANCHOR_DISTANCE)
        expect(narrowDistance).toBeLessThanOrEqual(MAX_CAMERA_ANCHOR_DISTANCE)
    })

    it('falls back to a fixed distance when the published MainCamera is not a real PerspectiveCamera (no fov/aspect to compute from)', () => {
        const camera = new THREE.Object3D()
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(1)

        expect(fakeModelInstances[0].group.position.z).toBeCloseTo(-0.7)
    })

    it('builds rating/playtime/genres/tags content from full game data - Steam genres and top '
        + 'community tags kept as separate sections (not merged), tags deduped and capped at '
        + 'MAX_TAGS_SHOWN', () => {
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
            genres: ['Action', 'Indie'],
            tags: ['Action', 'Co-op', 'FPS', 'Multiplayer', 'Mining', 'Difficult']
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

    it('de-duplicates Steam category descriptions - the raw list sometimes repeats an entry verbatim', () => {
        DataManager.getInstance().set('steam.games', [{
            appid: 6,
            name: 'Mudborne',
            categories: [
                { description: 'Single-player' }, { description: 'Steam Achievements' },
                { description: 'Single-player' }, { description: 'steam achievements' }
            ]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }] as any, { domain: DataDomain.SteamIntegration })

        coordinator = new GameBoxFoldCoordinator()
        selectGame(6)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content = fakeModelInstances[0].setContent.mock.calls[0][0] as any
        expect(content.categories).toEqual(['Single-player', 'Steam Achievements'])
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
        // Reset to baseline, not a stray flatscreen tilt from some earlier summon this session.
        expect(model.group.rotation.y).toBeCloseTo(MODEL_FACING_ROTATION_Y)
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

    it('does not apply the flatscreen tilt when camera-anchored in VR with a single connected '
        + 'controller - that framing is flatscreen-only', () => {
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
        expect(model.group.rotation.y).toBeCloseTo(MODEL_FACING_ROTATION_Y)
        expect(model.group.rotation.x).toBeCloseTo(0)
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
        + "panel's disc - the store panel rasterizes it into a canvas itself, so there's no "
        + 'THREE texture (and no DataTexture flipY quirk) to build here', async () => {
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

    it('the Play handler it hands the store panel launches steam://run/<appid> for whatever is currently summoned', () => {
        coordinator = new GameBoxFoldCoordinator()
        const model = fakeModelInstances[0]

        selectGame(2)
        model.playHandler?.()

        expect(window.location.href).toBe('steam://run/2')
    })

    it('the Play handler is inert while nothing is summoned', () => {
        coordinator = new GameBoxFoldCoordinator()

        fakeModelInstances[0].playHandler?.()

        expect(window.location.href).toBe('')
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
