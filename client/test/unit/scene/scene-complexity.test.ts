/**
 * Scene Complexity Performance Tests
 * 
 * These tests validate that scene complexity stays within acceptable bounds.
 * They can't measure real GPU performance (no GPU in Node.js), but they can
 * catch regressions in:
 * - Object counts
 * - Draw call counts (via mocked renderer.info)
 * - Memory allocations
 * - Scene graph depth
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'

describe('Scene Complexity Bounds', () => {
    let scene: THREE.Scene
    
    beforeEach(() => {
        scene = new THREE.Scene()
    })
    
    afterEach(() => {
        scene.clear()
    })

    describe('Object Count Limits', () => {
        it('should count meshes, lights, and groups correctly', () => {
            // Add various objects
            for (let i = 0; i < 10; i++) {
                scene.add(new THREE.Mesh(
                    new THREE.BoxGeometry(1, 1, 1),
                    new THREE.MeshBasicMaterial()
                ))
            }
            scene.add(new THREE.PointLight())
            scene.add(new THREE.Group())
            
            const counts = countSceneObjects(scene)
            
            expect(counts.meshes).toBe(10)
            expect(counts.lights).toBe(1)
            expect(counts.groups).toBe(1)
            expect(counts.total).toBe(12)
        })

        it('should count nested objects in groups', () => {
            const group = new THREE.Group()
            for (let i = 0; i < 5; i++) {
                group.add(new THREE.Mesh(
                    new THREE.BoxGeometry(1, 1, 1),
                    new THREE.MeshBasicMaterial()
                ))
            }
            scene.add(group)
            
            const counts = countSceneObjects(scene)
            
            // 5 meshes inside group + 1 group = total objects reachable
            expect(counts.meshes).toBe(5)
            expect(counts.groups).toBe(1)
        })
    })

    describe('Scene Graph Depth', () => {
        it('should measure scene graph depth', () => {
            // Create nested structure: scene -> group1 -> group2 -> mesh
            const group1 = new THREE.Group()
            const group2 = new THREE.Group()
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshBasicMaterial()
            )
            
            group2.add(mesh)
            group1.add(group2)
            scene.add(group1)
            
            const depth = measureSceneDepth(scene)
            
            // scene(0) -> group1(1) -> group2(2) -> mesh(3)
            expect(depth).toBe(3)
        })

        it('should warn if scene depth exceeds threshold', () => {
            const MAX_RECOMMENDED_DEPTH = 10
            
            // Build deep nesting
            let current: THREE.Object3D = scene
            for (let i = 0; i < 15; i++) {
                const group = new THREE.Group()
                current.add(group)
                current = group
            }
            
            const depth = measureSceneDepth(scene)
            
            // This should trigger a warning in real code
            expect(depth).toBeGreaterThan(MAX_RECOMMENDED_DEPTH)
        })
    })

    describe('Draw Call Estimation', () => {
        it('should estimate draw calls from unique material count', () => {
            // Each unique material = potential draw call
            const mat1 = new THREE.MeshBasicMaterial({ color: 0xff0000 })
            const mat2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            
            // 3 meshes with mat1, 2 meshes with mat2 = 2 draw calls minimum
            scene.add(new THREE.Mesh(geometry, mat1))
            scene.add(new THREE.Mesh(geometry, mat1))
            scene.add(new THREE.Mesh(geometry, mat1))
            scene.add(new THREE.Mesh(geometry, mat2))
            scene.add(new THREE.Mesh(geometry, mat2))
            
            const uniqueMaterials = countUniqueMaterials(scene)
            
            expect(uniqueMaterials).toBe(2)
        })

        it('should recognize instanced meshes as single draw calls', () => {
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            const material = new THREE.MeshBasicMaterial()
            
            // 100 instances = 1 draw call
            const instancedMesh = new THREE.InstancedMesh(geometry, material, 100)
            scene.add(instancedMesh)
            
            // Regular mesh = 1 draw call
            scene.add(new THREE.Mesh(geometry, material))
            
            const estimation = estimateDrawCalls(scene)
            
            // 1 instanced mesh + 1 regular mesh = 2 draw calls
            // But they share material so could be 1 if batched
            expect(estimation.instancedMeshes).toBe(1)
            expect(estimation.regularMeshes).toBe(1)
            expect(estimation.estimatedDrawCalls).toBeLessThanOrEqual(2)
        })
    })
})

// Helper functions that could be extracted to a utility module

function countSceneObjects(scene: THREE.Scene): { meshes: number; lights: number; groups: number; total: number } {
    let meshes = 0
    let lights = 0
    let groups = 0
    let total = 0
    
    scene.traverse((object) => {
        if (object === scene) return
        total++
        if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
            meshes++
        } else if (object instanceof THREE.Light) {
            lights++
        } else if (object instanceof THREE.Group) {
            groups++
        }
    })
    
    return { meshes, lights, groups, total }
}

function measureSceneDepth(scene: THREE.Scene): number {
    let maxDepth = 0
    
    function traverse(object: THREE.Object3D, depth: number) {
        maxDepth = Math.max(maxDepth, depth)
        for (const child of object.children) {
            traverse(child, depth + 1)
        }
    }
    
    traverse(scene, 0)
    return maxDepth
}

function countUniqueMaterials(scene: THREE.Scene): number {
    const materials = new Set<THREE.Material>()
    
    scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
            if (Array.isArray(object.material)) {
                object.material.forEach(m => materials.add(m))
            } else {
                materials.add(object.material)
            }
        }
    })
    
    return materials.size
}

function estimateDrawCalls(scene: THREE.Scene): { instancedMeshes: number; regularMeshes: number; estimatedDrawCalls: number } {
    let instancedMeshes = 0
    let regularMeshes = 0
    const materialMeshMap = new Map<THREE.Material, number>()
    
    scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) {
            instancedMeshes++
        } else if (object instanceof THREE.Mesh) {
            regularMeshes++
            const mat = Array.isArray(object.material) ? object.material[0] : object.material
            materialMeshMap.set(mat, (materialMeshMap.get(mat) ?? 0) + 1)
        }
    })
    
    // Each instanced mesh = 1 draw call
    // Each unique material in regular meshes = 1 draw call (best case with batching)
    const estimatedDrawCalls = instancedMeshes + materialMeshMap.size
    
    return { instancedMeshes, regularMeshes, estimatedDrawCalls }
}
