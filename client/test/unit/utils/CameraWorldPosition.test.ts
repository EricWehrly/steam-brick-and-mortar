import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { getCameraWorldPosition } from '../../../src/utils/CameraWorldPosition'

describe('getCameraWorldPosition', () => {
    it('returns the camera\'s own position when it has no parent', () => {
        const camera = new THREE.PerspectiveCamera()
        camera.position.set(1, 2, 3)
        camera.updateMatrixWorld()

        expect(getCameraWorldPosition(camera)).toEqual(new THREE.Vector3(1, 2, 3))
    })

    // This is the actual scenario this utility exists for - see SceneManager's cameraRig doc
    // comment. camera.position alone would read (0,0,0) here, which is wrong; every consumer
    // that needs world position (LOD/distance culling, spotlight targeting) must go through this
    // function instead of reading camera.position directly.
    it('resolves through a parent rig to the true world position', () => {
        const rig = new THREE.Group()
        rig.position.set(10, 1.6, -5)
        const camera = new THREE.PerspectiveCamera()
        rig.add(camera)
        rig.updateMatrixWorld()

        expect(camera.position).toEqual(new THREE.Vector3(0, 0, 0))
        expect(getCameraWorldPosition(camera)).toEqual(new THREE.Vector3(10, 1.6, -5))
    })

    it('reuses a supplied target vector instead of allocating a new one', () => {
        const rig = new THREE.Group()
        rig.position.set(1, 2, 3)
        const camera = new THREE.PerspectiveCamera()
        rig.add(camera)
        rig.updateMatrixWorld()

        const target = new THREE.Vector3()
        const result = getCameraWorldPosition(camera, target)

        expect(result).toBe(target)
        expect(target).toEqual(new THREE.Vector3(1, 2, 3))
    })
})
