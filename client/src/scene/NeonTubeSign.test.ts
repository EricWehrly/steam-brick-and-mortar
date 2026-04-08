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
        Mesh: vi.fn().mockImplementation(function (geo: any, mat: any) {
            return { geometry: geo, material: mat, isObject3D: true }
        }),
        Group: vi.fn().mockImplementation(function () {
            const children: any[] = []
            return {
                add: vi.fn((child: any) => children.push(child)),
                children,
                position: { 
                    copy: vi.fn(),
                    clone: vi.fn().mockReturnValue(new THREE.Vector3())
                },
                scale: { setScalar: vi.fn() },
                traverse: vi.fn(function(this: any, cb: (o: any) => void) {
                    children.forEach(cb)
                }),
                isObject3D: true,
            }
        }),
        CatmullRomCurve3: vi.fn().mockImplementation(function() {
            return {}
        }),
        TubeGeometry: vi.fn().mockImplementation(function() {
            return { dispose: vi.fn() }
        }),
    }
})

vi.mock('three/examples/jsm/loaders/FontLoader.js', () => ({
    FontLoader: vi.fn().mockImplementation(function () {
        return {
            load: vi.fn((_url: string, onLoad: (f: any) => void) => {
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
                        }
                    ])
                })
            }),
        }
    }),
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
        // Wait for the async buildSign (FontLoader.load + requestIdleCallback/setTimeout)
        // In this mock setup, onLoad is called synchronously, but buildSign is via setTimeout(0)
        // so we need to wait a tick.
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(sign.mesh.children.length).toBeGreaterThan(0)
                const isTubeMesh = sign.mesh.children.some((c: any) => c.geometry)
                expect(isTubeMesh).toBe(true)
                resolve()
            }, 0)
        })
    })

    it('does not add a PointLight to the group (avoids shadow map recalculation hitch)', () => {
        const sign = new NeonTubeSign(config)
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                // No PointLight should be added ΓÇö lighting must go through LightingRenderer
                const hasLight = sign.mesh.children.some((c: any) => c.isLight)
                expect(hasLight).toBe(false)
                resolve()
            }, 0)
        })
    })

    it('dispose() can be called without throwing', () => {
        const sign = new NeonTubeSign(config)
        expect(() => sign.dispose()).not.toThrow()
    })
})

