import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { BlockLetterSignRenderer } from './BlockLetterSignRenderer'
import type { SignRequest } from './ISignRenderer'

vi.mock('three/examples/jsm/loaders/FontLoader.js', () => ({
    FontLoader: vi.fn().mockImplementation(function () {
        return {
            load: vi.fn((_url: string, onLoad: (font: unknown) => void) => {
                onLoad({ isFont: true })
            }),
        }
    }),
}))

vi.mock('three/examples/jsm/geometries/TextGeometry.js', () => ({
    TextGeometry: vi.fn().mockImplementation(function () {
        let boundingBox: THREE.Box3 | null = null
        return {
            computeBoundingBox: vi.fn(function () {
                boundingBox = new THREE.Box3(
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(1, 0.5, 0.1)
                )
            }),
            get boundingBox() { return boundingBox },
            translate: vi.fn(),
            dispose: vi.fn(),
        }
    }),
}))

function makeRequest(uniqueIdentifier = 'test-sign', overrides: Partial<SignRequest> = {}): SignRequest {
    return {
        uniqueIdentifier,
        position: new THREE.Vector3(0, 2, -5),
        text: 'GAME',
        style: { color: 0xff0000 },
        ...overrides,
    }
}

describe('BlockLetterSignRenderer', () => {
    let renderer: BlockLetterSignRenderer
    let scene: THREE.Scene

    beforeEach(() => {
        vi.useFakeTimers()
        renderer = new BlockLetterSignRenderer()
        scene = new THREE.Scene()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns a THREE.Group immediately', () => {
        const object = renderer.setSign(makeRequest(), scene)
        expect(object).toBeInstanceOf(THREE.Group)
    })

    it('adds the group to the scene', () => {
        renderer.setSign(makeRequest('a'), scene)
        expect(scene.children.length).toBe(1)
    })

    it('positions the group at the requested position', () => {
        const position = new THREE.Vector3(3, 1, -2)
        const object = renderer.setSign(makeRequest('b', { position }), scene)
        expect((object as THREE.Group).position.x).toBeCloseTo(3)
    })

    it('applies facingY rotation', () => {
        const object = renderer.setSign(makeRequest('c', { facingY: Math.PI }), scene)
        expect((object as THREE.Group).rotation.y).toBeCloseTo(Math.PI)
    })

    it('applies scale', () => {
        const object = renderer.setSign(makeRequest('d', { scale: 2.0 }), scene)
        expect((object as THREE.Group).scale.x).toBeCloseTo(2.0)
    })

    it('removeSign removes the group from the scene', async () => {
        renderer.setSign(makeRequest('e'), scene)
        await Promise.resolve()
        renderer.removeSign('e', scene)
        expect(scene.children.length).toBe(0)
    })

    it('removeSign returns false for unknown uniqueIdentifier', () => {
        expect(renderer.removeSign('nonexistent', scene)).toBe(false)
    })

    it('setSign on existing uniqueIdentifier removes old group first', () => {
        renderer.setSign(makeRequest('f'), scene)
        renderer.setSign(makeRequest('f', { position: new THREE.Vector3(9, 9, 9) }), scene)
        expect(scene.children.length).toBe(1)
    })

    it('dispose removes all groups', async () => {
        renderer.setSign(makeRequest('g'), scene)
        renderer.setSign(makeRequest('h'), scene)
        await Promise.resolve()
        renderer.dispose(scene)
        expect(scene.children.length).toBe(0)
    })

    it('does not throw if removeSign is called after dispose', () => {
        renderer.setSign(makeRequest('i'), scene)
        renderer.dispose(scene)
        expect(() => renderer.removeSign('i', scene)).not.toThrow()
    })
})
