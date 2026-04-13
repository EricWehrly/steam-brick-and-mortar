import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../src/core/EventManager'
import { RoomEventTypes, type RoomResizedEvent } from '../../../src/types/InteractionEvents'

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

const neonSetSignSpy = vi.fn()
vi.mock('../../../src/scene/signs/NeonTubeSignRenderer', () => ({
    NeonTubeSignRenderer: vi.fn().mockImplementation(function () {
        return { setSign: neonSetSignSpy, removeSign: vi.fn().mockReturnValue(false), clearAll: vi.fn(), dispose: vi.fn() }
    }),
}))

const blockSetSignSpy = vi.fn()
vi.mock('../../../src/scene/signs/BlockLetterSignRenderer', () => ({
    BlockLetterSignRenderer: vi.fn().mockImplementation(function () {
        return { setSign: blockSetSignSpy, removeSign: vi.fn().mockReturnValue(false), clearAll: vi.fn(), dispose: vi.fn() }
    }),
}))

vi.mock('../../../src/scene/SignageRenderer', () => ({
    SignageRenderer: class {
        createSign() { return new THREE.Mesh() }
        dispose() {}
    },
}))

import { SceneSignManager } from '../../../src/scene/SceneSignManager'

function makeMesh(): THREE.Mesh {
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
}

// ─── Text resolution ──────────────────────────────────────────────────────────

describe('SceneSignManager — text resolution', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        mockScene.clear()
        vi.clearAllMocks()
        canvasSetSignSpy.mockImplementation(() => makeMesh())
        neonSetSignSpy.mockImplementation(() => new THREE.Group())
        blockSetSignSpy.mockImplementation(() => new THREE.Group())
    })

    it('passes uniqueIdentifier as text when descriptor.text is omitted (canvas)', () => {
        const manager = new SceneSignManager()
        manager.placeSign('canvas', { uniqueIdentifier: 'Action', anchorPosition: new THREE.Vector3(0, 2, -5) })
        expect(canvasSetSignSpy.mock.calls[0][0].text).toBe('Action')
        manager.dispose()
    })

    it('passes explicit text when provided (canvas)', () => {
        const manager = new SceneSignManager()
        manager.placeSign('canvas', { uniqueIdentifier: 'section-42', text: 'RPGs & Adventures', anchorPosition: new THREE.Vector3(0, 2, -5) })
        expect(canvasSetSignSpy.mock.calls[0][0].text).toBe('RPGs & Adventures')
        manager.dispose()
    })

    it('passes uniqueIdentifier as text for neon-tube', () => {
        const manager = new SceneSignManager()
        manager.placeSign('neon-tube', { uniqueIdentifier: 'steam', anchorPosition: new THREE.Vector3(0, 4, -6) })
        expect(neonSetSignSpy.mock.calls[0][0].text).toBe('steam')
        manager.dispose()
    })

    it('passes explicit text to neon renderer', () => {
        const manager = new SceneSignManager()
        manager.placeSign('neon-tube', { uniqueIdentifier: 'entrance-neon', text: 'OPEN', anchorPosition: new THREE.Vector3(0, 4, -6) })
        expect(neonSetSignSpy.mock.calls[0][0].text).toBe('OPEN')
        manager.dispose()
    })
})

// ─── Mount math ───────────────────────────────────────────────────────────────

describe('SceneSignManager — mount math', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        mockScene.clear()
        vi.clearAllMocks()
        canvasSetSignSpy.mockImplementation(() => makeMesh())
        neonSetSignSpy.mockImplementation(() => new THREE.Group())
        blockSetSignSpy.mockImplementation(() => new THREE.Group())
    })

    it('applies frontOffset along signFacingY for above-shelf mount', () => {
        const manager = new SceneSignManager()
        const anchor = new THREE.Vector3(10, 2, -5)
        const signFacingY = Math.PI / 2
        const frontOffset = 0.3

        manager.placeSign('canvas', {
            uniqueIdentifier: 'Played This Week',
            anchorPosition: anchor,
            mount: { style: 'above-shelf', yOffset: 0.2, frontOffset, signFacingY },
        })

        const request = canvasSetSignSpy.mock.calls[0][0]
        expect(request.position.x).toBeCloseTo(anchor.x + Math.sin(signFacingY) * frontOffset, 6)
        expect(request.position.y).toBeCloseTo(anchor.y + 0.2, 6)
        expect(request.position.z).toBeCloseTo(anchor.z + Math.cos(signFacingY) * frontOffset, 6)
        expect(request.facingY).toBeCloseTo(signFacingY, 6)

        manager.dispose()
    })

    it('routes canvas and neon to their respective renderers', () => {
        const manager = new SceneSignManager()
        const anchor = new THREE.Vector3(0, 2, -5)
        manager.placeSign('canvas', { uniqueIdentifier: 'RPG', anchorPosition: anchor })
        manager.placeSign('neon-tube', { uniqueIdentifier: 'neon-entrance', anchorPosition: anchor })
        expect(canvasSetSignSpy).toHaveBeenCalledOnce()
        expect(neonSetSignSpy).toHaveBeenCalledOnce()
        manager.dispose()
    })
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('SceneSignManager — lifecycle', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        mockScene.clear()
        vi.clearAllMocks()
        canvasSetSignSpy.mockImplementation(() => makeMesh())
        neonSetSignSpy.mockImplementation(() => new THREE.Group())
        blockSetSignSpy.mockImplementation(() => new THREE.Group())
    })

    it('places block letter sign on RoomResized', () => {
        const manager = new SceneSignManager()
        EventManager.getInstance().emit<RoomResizedEvent>(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 3.2 },
        })
        expect(blockSetSignSpy).toHaveBeenCalledOnce()
        const request = blockSetSignSpy.mock.calls[0][0]
        expect(request.text).toBe('STEAM LIBRARY')
        expect(request.uniqueIdentifier).toBe('steam-library-title')
        manager.dispose()
    })

    it('does not place canvas signs on RoomResized (those are data-driven via ShelfSectionPlanner)', () => {
        const manager = new SceneSignManager()
        EventManager.getInstance().emit<RoomResizedEvent>(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 3.2 },
        })
        expect(canvasSetSignSpy).not.toHaveBeenCalled()
        manager.dispose()
    })
})
