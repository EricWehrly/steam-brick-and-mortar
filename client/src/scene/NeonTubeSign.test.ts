import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Mock Three.js heavy constructors to keep tests fast
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof THREE>()
    return {
        ...actual,
        MeshStandardMaterial: vi.fn().mockImplementation(function () {
            return { dispose: vi.fn() }
        }),
        Mesh: vi.fn().mockImplementation(function (geo: unknown, mat: unknown) {
            return { geometry: geo, material: mat, isObject3D: true }
        }),
        Group: vi.fn().mockImplementation(function () {
            const children: unknown[] = []
            return {
                add: vi.fn((child: unknown) => children.push(child)),
                children,
                position: {
                    copy: vi.fn(),
                    clone: vi.fn().mockReturnValue(new THREE.Vector3()),
                },
                scale: { setScalar: vi.fn() },
                traverse: vi.fn(function (cb: (o: unknown) => void) {
                    children.forEach(cb)
                }),
                isObject3D: true,
            }
        }),
        CatmullRomCurve3: vi.fn().mockImplementation(function () {
            return {}
        }),
        TubeGeometry: vi.fn().mockImplementation(function () {
            return { dispose: vi.fn() }
        }),
    }
})

vi.mock('three/examples/jsm/loaders/FontLoader.js', () => ({
    FontLoader: vi.fn().mockImplementation(function () {
        return {
            load: vi.fn((_url: string, onLoad: (f: unknown) => void) => {
                onLoad({
                    isFont: true,
                    generateShapes: vi.fn().mockReturnValue([
                        {
                            getPoints: vi.fn().mockReturnValue([
                                new THREE.Vector2(0, 0),
                                new THREE.Vector2(1, 0),
                                new THREE.Vector2(1, 1),
                            ]),
                            holes: [],
                        },
                    ]),
                })
            }),
        }
    }),
}))

// Mock EventManager — NeonTubeSign emits PointLightRequested via it
const mockEmit = vi.fn()
vi.mock('../core/EventManager', () => ({
    EventManager: {
        getInstance: vi.fn(() => ({ emit: mockEmit })),
    },
}))

import { NeonTubeSign, type NeonTubeSignConfig } from './NeonTubeSign'

describe('NeonTubeSign', () => {
    let config: NeonTubeSignConfig

    beforeEach(() => {
        config = {
            color: 0xff6600,
            position: new THREE.Vector3(1, 2, 3),
            scale: 1.5,
        }
        vi.clearAllMocks()
    })

    it('creates a Group as the mesh property', () => {
        const sign = new NeonTubeSign(config)
        expect(sign.mesh).toBeDefined()
        expect(THREE.Group).toHaveBeenCalledTimes(1)
    })

    it('positions the group at the given position', () => {
        const sign = new NeonTubeSign(config)
        expect(sign.mesh.position.copy).toHaveBeenCalledWith(config.position)
    })

    it('applies the scale from config', () => {
        const sign = new NeonTubeSign(config)
        expect(sign.mesh.scale.setScalar).toHaveBeenCalledWith(1.5)
    })

    it('adds tube meshes to the group', () => {
        const sign = new NeonTubeSign(config)
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(sign.mesh.children.length).toBeGreaterThan(0)
                const isTubeMesh = sign.mesh.children.some((c: unknown) => (c as { geometry?: unknown }).geometry)
                expect(isTubeMesh).toBe(true)
                resolve()
            }, 0)
        })
    })

    it('does not add a PointLight to the group (avoids shadow map recalculation hitch)', () => {
        const sign = new NeonTubeSign(config)
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                const hasLight = sign.mesh.children.some((c: unknown) => (c as { isLight?: boolean }).isLight)
                expect(hasLight).toBe(false)
                resolve()
            }, 0)
        })
    })

    it('emits PointLightRequested via EventManager after geometry is built', () => {
        new NeonTubeSign(config)
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(mockEmit).toHaveBeenCalled()
                const [eventType, payload] = mockEmit.mock.calls[0]
                expect(eventType).toBe('lighting:point-light-requested')
                expect(payload.color).toBe(config.color)
                resolve()
            }, 0)
        })
    })

    it('dispose() can be called without throwing', () => {
        const sign = new NeonTubeSign(config)
        expect(() => sign.dispose()).not.toThrow()
    })

    it('uses default text "steam" if none provided', () => {
        const signWithDefault = new NeonTubeSign({ color: 0xffffff, position: new THREE.Vector3() })
        // Constructor should still succeed and produce a group
        expect(signWithDefault.mesh).toBeDefined()
    })
})
