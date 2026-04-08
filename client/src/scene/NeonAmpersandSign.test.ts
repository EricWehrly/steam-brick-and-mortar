import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Mock Three.js heavy constructors to keep tests fast
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof THREE>()
    return {
        ...actual,
        TubeGeometry: vi.fn().mockImplementation(() => ({
            dispose: vi.fn(),
        })),
        MeshStandardMaterial: vi.fn().mockImplementation(() => ({
            dispose: vi.fn(),
        })),
        Mesh: vi.fn().mockImplementation(function (geo: unknown, mat: unknown) {
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
            const children: unknown[] = []
            return {
                add: vi.fn((child: unknown) => children.push(child)),
                children,
                position: { copy: vi.fn() },
                scale: { setScalar: vi.fn() },
                traverse: vi.fn((cb: (o: unknown) => void) => children.forEach(cb)),
                isObject3D: true,
            }
        }),
    }
})

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

    it('creates a tube with the ampersand geometry', () => {
        new NeonAmpersandSign(config)
        expect(THREE.TubeGeometry).toHaveBeenCalledTimes(1)
    })

    it('adds a PointLight by default', () => {
        new NeonAmpersandSign(config)
        expect(THREE.PointLight).toHaveBeenCalledWith(config.color, 1.5, 2.0)
    })

    it('skips PointLight when addLight is false', () => {
        new NeonAmpersandSign({ ...config, addLight: false })
        expect(THREE.PointLight).not.toHaveBeenCalled()
    })

    it('uses color for both material color and emissive', () => {
        new NeonAmpersandSign(config)
        const matCall = vi.mocked(THREE.MeshStandardMaterial).mock.calls[0][0] as Record<string, unknown>
        expect(matCall?.color).toBe(config.color)
    })

    it('dispose() calls geometry.dispose and material.dispose', () => {
        const sign = new NeonAmpersandSign(config)
        const mockMesh = { geometry: { dispose: vi.fn() }, material: { dispose: vi.fn() } }
        vi.mocked(sign.mesh.traverse).mockImplementation((cb) => cb(mockMesh as unknown as THREE.Object3D))
        Object.defineProperty(THREE.Mesh, Symbol.hasInstance, { value: () => true })
        sign.dispose()
        // Traverse was called
        expect(sign.mesh.traverse).toHaveBeenCalled()
    })
})
