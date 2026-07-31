import * as THREE from 'three'

/**
 * Returns the camera's true world position - never read camera.position directly for distance/
 * culling/targeting math. The camera is parented under a movement rig (see SceneManager's
 * cameraRig doc comment), so camera.position is a LOCAL offset (always identity today), not a
 * world position. getWorldPosition() resolves correctly through any parent transform regardless
 * of nesting, in both desktop and VR modes.
 *
 * Pass `target` to reuse a scratch Vector3 in hot paths instead of allocating one per call.
 */
export function getCameraWorldPosition(camera: THREE.Camera, target = new THREE.Vector3()): THREE.Vector3 {
    return camera.getWorldPosition(target)
}
