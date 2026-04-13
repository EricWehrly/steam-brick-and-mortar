import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../src/core/EventManager'
import { GameEventTypes, StorePropsEventTypes, type ShelfReadyEvent } from '../../../src/types/InteractionEvents'
import type { GamesSortEvent } from '../../../src/types/EnvironmentEvents'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

// ─── Scene / DataManager mock ─────────────────────────────────────────────────

const mockScene = new THREE.Scene()

vi.mock('../../../src/core/data/DataManager', () => ({
    DataManager: {
        getInstance: () => ({
            get: () => mockScene,
            getOrThrow: () => mockScene,
        }),
    },
}))

// ─── CanvasSignRenderer spy ───────────────────────────────────────────────────
// We spy at the CanvasSignRenderer level so we can assert the SignRequest that
// SceneSignManager passes through — including the resolved text value.

const canvasSetSignSpy = vi.fn()
const canvasRemoveSignSpy = vi.fn().mockReturnValue(true)
const canvasClearAllSpy = vi.fn()
const canvasDisposeSpy = vi.fn()

vi.mock('../../../src/scene/signs/CanvasSignRenderer', () => ({
    CanvasSignRenderer: vi.fn().mockImplementation(function () {
        return {
            setSign: canvasSetSignSpy,
            removeSign: canvasRemoveSignSpy,
            clearAll: canvasClearAllSpy,
            dispose: canvasDisposeSpy,
        }
    }),
}))

// ─── NeonTubeSignRenderer stub ────────────────────────────────────────────────

const neonSetSignSpy = vi.fn()
const neonRemoveSignSpy = vi.fn().mockReturnValue(false)
const neonClearAllSpy = vi.fn()
const neonDisposeSpy = vi.fn()

vi.mock('../../../src/scene/signs/NeonTubeSignRenderer', () => ({
    NeonTubeSignRenderer: vi.fn().mockImplementation(function () {
        return {
            setSign: neonSetSignSpy,
            removeSign: neonRemoveSignSpy,
            clearAll: neonClearAllSpy,
            dispose: neonDisposeSpy,
        }
    }),
}))

// ─── SignageRenderer stub (used internally by CanvasSignRenderer in prod) ─────

vi.mock('../../../src/scene/SignageRenderer', () => ({
    SignageRenderer: class {
        createSign() { return new THREE.Mesh() }
        dispose() {}
    },
}))

import { SceneSignManager } from '../../../src/scene/SceneSignManager'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    mesh.position.set(0, 0, 0)
    return mesh
}

describe('SceneSignManager — text resolution', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        mockScene.clear()
        vi.clearAllMocks()
        canvasSetSignSpy.mockImplementation(() => makeMesh())
        neonSetSignSpy.mockImplementation(() => new THREE.Group())
    })

    it('passes uniqueIdentifier as text when descriptor.text is omitted (canvas)', () => {
        const manager = new SceneSignManager()

        manager.placeSign('category', {
            uniqueIdentifier: 'Action',
            anchorPosition: new THREE.Vector3(0, 2, -5),
        })

        const [request] = canvasSetSignSpy.mock.calls[0]
        expect(request.text).toBe('Action')

        manager.dispose()
    })

    it('passes explicit text when provided, ignores uniqueIdentifier (canvas)', () => {
        const manager = new SceneSignManager()

        manager.placeSign('category', {
            uniqueIdentifier: 'section-42',
            text: 'RPGs & Adventures',
            anchorPosition: new THREE.Vector3(0, 2, -5),
        })

        const [request] = canvasSetSignSpy.mock.calls[0]
        expect(request.text).toBe('RPGs & Adventures')

        manager.dispose()
    })

    it('passes uniqueIdentifier as text when descriptor.text is omitted (ceiling)', () => {
        const manager = new SceneSignManager()

        manager.placeSign('ceiling', {
            uniqueIdentifier: 'Recently Played',
            anchorPosition: new THREE.Vector3(0, 3.5, -6),
            mount: { style: 'ceiling', signFacingY: 0 },
        })

        const [request] = canvasSetSignSpy.mock.calls[0]
        expect(request.text).toBe('Recently Played')

        manager.dispose()
    })

    it('passes uniqueIdentifier as text when descriptor.text is omitted (neon-tube)', () => {
        const manager = new SceneSignManager()

        manager.placeSign('neon-tube', {
            uniqueIdentifier: 'steam',
            anchorPosition: new THREE.Vector3(0, 4, -6),
        })

        const [request] = neonSetSignSpy.mock.calls[0]
        expect(request.text).toBe('steam')

        manager.dispose()
    })

    it('passes explicit text to neon renderer when provided', () => {
        const manager = new SceneSignManager()

        manager.placeSign('neon-tube', {
            uniqueIdentifier: 'entrance-neon',
            text: 'OPEN',
            anchorPosition: new THREE.Vector3(0, 4, -6),
        })

        const [request] = neonSetSignSpy.mock.calls[0]
        expect(request.text).toBe('OPEN')

        manager.dispose()
    })
})

describe('SceneSignManager — mount math', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        mockScene.clear()
        vi.clearAllMocks()
        canvasSetSignSpy.mockImplementation(() => makeMesh())
        neonSetSignSpy.mockImplementation(() => new THREE.Group())
    })

    it('applies frontOffset along signFacingY', () => {
        const manager = new SceneSignManager()
        const anchor = new THREE.Vector3(10, 2, -5)
        const signFacingY = Math.PI / 2
        const frontOffset = 0.3

        manager.placeSign('category', {
            uniqueIdentifier: 'Played This Week',
            anchorPosition: anchor,
            mount: { style: 'above-shelf', yOffset: 0.2, frontOffset, signFacingY },
        })

        const [request] = canvasSetSignSpy.mock.calls[0]
        expect(request.position.x).toBeCloseTo(anchor.x + Math.sin(signFacingY) * frontOffset, 6)
        expect(request.position.y).toBeCloseTo(anchor.y + 0.2, 6)
        expect(request.position.z).toBeCloseTo(anchor.z + Math.cos(signFacingY) * frontOffset, 6)
        expect(request.facingY).toBeCloseTo(signFacingY, 6)

        manager.dispose()
    })

    it('routes canvas kinds through canvasRenderer and neon kinds through neonRenderer', () => {
        const manager = new SceneSignManager()
        const anchor = new THREE.Vector3(0, 2, -5)

        manager.placeSign('category', { uniqueIdentifier: 'RPG', anchorPosition: anchor })
        manager.placeSign('neon-tube', { uniqueIdentifier: 'neon-entrance', anchorPosition: anchor })

        expect(canvasSetSignSpy).toHaveBeenCalledOnce()
        expect(neonSetSignSpy).toHaveBeenCalledOnce()

        manager.dispose()
    })
})

describe('SceneSignManager — lifecycle', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        mockScene.clear()
        vi.clearAllMocks()
        canvasSetSignSpy.mockImplementation(() => makeMesh())
        neonSetSignSpy.mockImplementation(() => new THREE.Group())
    })

    it('places recently-played ceiling sign and neon entrance on GamesSort', () => {
        const manager = new SceneSignManager()

        const game: SteamGameData = {
            appid: 42,
            name: 'Half-Life 3',
            playtime_forever: 120,
            rtime_last_played: Math.floor(Date.now() / 1000) - 3600,
            img_icon_url: '',
            img_logo_url: '',
        } as SteamGameData

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
            sortedGames: [game],
            buckets: new Map([[1, 'Played Today']]),
        })

        // Canvas ceiling sign only � neon entrance sign is disabled pending stroke-skeleton rendering
        expect(canvasSetSignSpy).toHaveBeenCalledOnce()
        expect(neonSetSignSpy).not.toHaveBeenCalled()

        // The ceiling sign text should be 'Recently Played'
        const [ceilingRequest] = canvasSetSignSpy.mock.calls[0]
        expect(ceilingRequest.text).toBe('Recently Played')

        manager.dispose()
    })

    it('places a bucket sign on ShelfReady when recently-played data is present', () => {
        const manager = new SceneSignManager()

        const game: SteamGameData = {
            appid: 42,
            name: 'Half-Life 3',
            playtime_forever: 120,
            rtime_last_played: Math.floor(Date.now() / 1000) - 3600,
            img_icon_url: '',
            img_logo_url: '',
        } as SteamGameData

        EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
            sortedGames: [game],
            buckets: new Map([[1, 'Played Today']]),
        })

        vi.clearAllMocks()
        canvasSetSignSpy.mockImplementation(() => makeMesh())

        EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
            batchIndex: 0,
            position: new THREE.Vector3(0, 0, -5),
            rotationY: 0,
        })

        expect(canvasSetSignSpy).toHaveBeenCalled()

        manager.dispose()
    })
})
