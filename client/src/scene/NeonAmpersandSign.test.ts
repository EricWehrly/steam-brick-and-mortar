import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Mock Three.js heavy constructors to keep tests fast
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof THREE>()
    return {
        ...actual,
        MeshStandardMaterial: vi.fn().mockImplementation(function () {
            return {
                dispose: vi.fn(),
            }
        }),
        Mesh: vi.fn().mockImplementation(function (geo: any, mat: any) {
            return { geometry: geo, material: mat, isObject3D: true }
        }),
        PointLight: vi.fn().mockImplementation(function () {
            return {
                position: { set: vi.fn() },
                isObject3D: true,
                isLight: true,
            }
        }),
        Group: vi.fn().mockImplementation(function () {
            const children: any[] = []
            return {
                add: vi.fn((child: any) => children.push(child)),
                children,
                position: { copy: vi.fn() },
                scale: { setScalar: vi.fn() },
                traverse: vi.fn((cb: (o: any) => void) => children.forEach(cb)),
                isObject3D: true,
            }
        }),
    }
})

vi.mock('three/examples/jsm/loaders/FontLoader.js', () => ({
    FontLoader: vi.fn().mockImplementation(function () {
        return {
            load: vi.fn((url, onLoad) => {
                onLoad({ isFont: true })
            }),
        }
    }),
}))

vi.mock('three/examples/jsm/geometries/TextGeometry.js', () => ({
    TextGeometry: vi.fn().mockImplementation(function () {
        return {
            center: vi.fn(),
            dispose: vi.fn(),
        }
    }),
}))

import { NeonAmpersandSign, type NeonAmpersandConfig } from './NeonAmpersandSign'

describe('NeonAmpersandSign', () => {
    let config: NeonAmpersandConfig

    beforeEach(() => {
        config = {
            color: 0xff6600,
            position: new THREE.Vector3(1, 2, 3),
            scale: 1.5,
        }
        vi.clearAllMocks()
    })

    it('creates a Group as the mesh property', () => {
        const sign = new NeonAmpersandSign(config)
        expect(sign.mesh).toBeDefined()
        expect(THREE.Group).toHaveBeenCalledTimes(1)
    })

    it('positions the group at the given position', () => {
        const sign = new NeonAmpersandSign(config)
        expect(sign.mesh.position.copy).toHaveBeenCalledWith(config.position)
    })

    it('applies the scale from config', () => {
        const sign = new NeonAmpersandSign(config)
        expect(sign.mesh.scale.setScalar).toHaveBeenCalledWith(1.5)
    })

    it('dispose() can be called without throwing', () => {
        const sign = new NeonAmpersandSign(config)
        expect(() => sign.dispose()).not.toThrow()
    })
})
