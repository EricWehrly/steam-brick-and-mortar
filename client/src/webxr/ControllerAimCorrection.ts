/**
 * The one place a controller's raw WebXR targetRaySpace direction (local -Z) gets adjusted into
 * "where the player actually means to point." Every consumer that turns a controller into a ray -
 * shelf-box selection (XRControllerManager.getPrimaryControllerRay()) and uikit panel interaction
 * (VRControllerPointer) - imports this instead of each carrying its own correction, so the two
 * can never silently disagree about which way the controller is aiming.
 *
 * WebXR's reported targetRaySpace direction commonly points noticeably above the physical barrel
 * for Touch-style controllers (Oculus Touch/PICO Connect - see InputProfile.ts's VR profile
 * comment) - an uncorrected beam reads as aiming up and away rather than forward. Pitching the
 * direction down compensates.
 *
 * The -15 degree value was tuned against one scenario (a menu floating ~0.9m in front of the
 * camera) and has NOT been re-verified for the game box's own scenarios (held close in-hand in
 * VR, or the box's flatscreen anchor), which may want a different correction once someone can
 * test in a headset. Until then this is the single value both raycasts share, so at least they
 * can't drift apart from each other even if the value itself still needs tuning.
 *
 * // TD: vr-uikit-menu-sync-recheck
 */

import * as THREE from 'three'

const PITCH_CORRECTION_DEGREES = -15

export const CONTROLLER_AIM_DIRECTION = new THREE.Vector3(0, 0, -1)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(PITCH_CORRECTION_DEGREES))
