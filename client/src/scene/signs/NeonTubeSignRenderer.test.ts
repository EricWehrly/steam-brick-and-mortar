import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// ─── Mock Three.js heavy constructors ─────────────────────────────────────────

vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof THREE>()
    return {
        ...actual,
        Color: vi.fn().mockImplementation(function () { return {} }),
        MeshStandardMaterial: vi.fn().mockImplementation(function () {
            return { dispose: vi.fn() }
        }),
        Mesh: vi.fn().mockImplementation(function (geo: unknown, mat: unknown) {
            return { geometry: geo, material: mat, isObject3D: true, isMesh: true }
        }),
        Group: vi.fn().mockImplementation(function () {
            const children: object[] = []
            return {
                add: vi.fn((child: object) => children.push(child)),
                remove: vi.fn(),
                children,
                position: {
                    copy: vi.fn(),
                    clone: vi.fn().mockReturnValue(new actual.Vector3()),
                },
                rotation: { y: 0 },
                scale: { setScalar: vi.fn() },
                traverse: vi.fn(function (cb: (o: object) => void) {
                    children.forEach(cb)
                }),
                isObject3D: true,
            }
        }),
        CatmullRomCurve3: vi.fn().mockImplementation(function () { return {} }),
        TubeGeometry: vi.fn().mockImplementation(function () { return { dispose: vi.fn() } }),
    }
})

// ─── Mock NeonGeometryWorker ──────────────────────────────────────────────────

const mockBuildTubes = vi.fn()
const mockWorkerDispose = vi.fn()

vi.mock('./NeonGeometryWorker', () => ({
    NeonGeometryWorker: vi.fn().mockImplementation(function () {
        return {
            buildTubes: mockBuildTubes,
            dispose:    mockWorkerDispose,
        }
    }),
}))

// ─── Mock EventManager ────────────────────────────────────────────────────────

const mockEmit = vi.fn()
vi.mock('../../core/EventManager', () => ({
    EventManager: {
        getInstance: vi.fn(() => ({ emit: mockEmit })),
    },
}))

// ─── Mock Vite ?worker import (NeonGeometryWorker imports it) ─────────────────

vi.mock('../../utils/workers/neon-geometry.worker?worker', () => ({ default: function () {} }))

import { NeonTubeSignRenderer } from './NeonTubeSignRenderer'
import type { SignRequest } from './ISignRenderer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScene() {
    return {
        add:    vi.fn(),
        remove: vi.fn(),
    } as unknown as THREE.Scene
}

function makeRequest(overrides?: Partial<SignRequest>): SignRequest {
    return {
        label:    'test-sign',
        position: new THREE.Vector3(1, 2, 3),
        text:     'steam',
        ...overrides,
    }
}

function makeTubeData() {
    return {
        tubes:   [new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0])],
        offsetX: 0,
        offsetY: 0,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NeonTubeSignRenderer', () => {
    let renderer: NeonTubeSignRenderer

    beforeEach(() => {
        vi.clearAllMocks()
        mockBuildTubes.mockResolvedValue(makeTubeData())
        renderer = new NeonTubeSignRenderer()
    })

    it('adds the group to the scene immediately on setSign()', () => {
        const scene = makeScene()
        renderer.setSign(makeRequest(), scene)
        expect(scene.add).toHaveBeenCalledOnce()
    })

    it('returns the group object3D from setSign()', () => {
        const scene = makeScene()
        const obj = renderer.setSign(makeRequest(), scene)
        expect(obj).toBeDefined()
    })

    it('adds tube meshes to the group after worker resolves', async () => {
        const scene = makeScene()
        const group = renderer.setSign(makeRequest(), scene) as THREE.Object3D & { children: object[] }
        // Wait for the async build
        await vi.waitFor(() => expect(mockBuildTubes).toHaveResolved())
        await Promise.resolve() // one more tick for mesh population
        expect((group as { children: object[] }).children.length).toBeGreaterThan(0)
    })

    it('emits PointLightRequested after geometry is built', async () => {
        const scene = makeScene()
        renderer.setSign(makeRequest(), scene)
        await vi.waitFor(() => expect(mockEmit).toHaveBeenCalled())
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe('lighting:point-light-requested')
        expect(payload.color).toBe(0xff6600)
    })

    it('removeSign() removes the group from the scene', () => {
        const scene = makeScene()
        renderer.setSign(makeRequest(), scene)
        const removed = renderer.removeSign('test-sign', scene)
        expect(removed).toBe(true)
        expect(scene.remove).toHaveBeenCalledOnce()
    })

    it('removeSign() returns false for unknown label', () => {
        const scene = makeScene()
        expect(renderer.removeSign('no-such-label', scene)).toBe(false)
    })

    it('setSign() replaces an existing sign with the same label', () => {
        const scene = makeScene()
        renderer.setSign(makeRequest(), scene)
        renderer.setSign(makeRequest({ text: 'updated' }), scene)
        // scene.remove was called once (old sign), scene.add was called twice
        expect(scene.add).toHaveBeenCalledTimes(2)
        expect(scene.remove).toHaveBeenCalledTimes(1)
    })

    it('dispose() removes all signs and terminates the worker', () => {
        const scene = makeScene()
        renderer.setSign(makeRequest({ label: 'a' }), scene)
        renderer.setSign(makeRequest({ label: 'b' }), scene)
        renderer.dispose(scene)
        expect(scene.remove).toHaveBeenCalledTimes(2)
        expect(mockWorkerDispose).toHaveBeenCalledOnce()
    })

    it('does not crash if worker rejects (error path)', async () => {
        mockBuildTubes.mockRejectedValueOnce(new Error('font error'))
        const scene = makeScene()
        renderer.setSign(makeRequest(), scene)
        // Should not throw; error is caught internally
        await vi.waitFor(() => expect(mockBuildTubes).toHaveBeenCalled())
        // Group was still added to scene
        expect(scene.add).toHaveBeenCalledOnce()
    })
})
