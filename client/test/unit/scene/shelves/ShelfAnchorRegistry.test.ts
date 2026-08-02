import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { ShelfAnchorRegistry } from '../../../../src/scene/shelves/ShelfAnchorRegistry'
import { StorePropsEventTypes, type ShelfReadyEvent, type ShelfUnitRepositionRequestedEvent } from '../../../../src/types/InteractionEvents'

function emitShelfReady(shelfIndex: number, position: THREE.Vector3, rotationY: number, sectionIndex = 0): void {
    EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        shelfIndex, sectionIndex, position, rotationY,
    })
}

function emitReposition(shelfIndex: number, position: THREE.Vector3, rotationY: number): void {
    EventManager.getInstance().emit<ShelfUnitRepositionRequestedEvent>(StorePropsEventTypes.ShelfUnitRepositionRequested, {
        shelfIndex, position, rotationY,
    })
}

describe('ShelfAnchorRegistry', () => {
    let registry: ShelfAnchorRegistry

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        ShelfAnchorRegistry.resetInstance()
        registry = ShelfAnchorRegistry.getInstance()
    })

    describe('resolve()', () => {
        it('returns null for a shelf that has never been published', () => {
            expect(registry.resolve(0, { x: 0, y: 0, z: 0 })).toBeNull()
        })

        it('composes a zero-rotation shelf with a local offset by plain addition', () => {
            emitShelfReady(0, new THREE.Vector3(3, 0, -5), 0)

            const resolved = registry.resolve(0, { x: 0.5, y: 1.2, z: -0.1 })

            expect(resolved).not.toBeNull()
            expect(resolved!.position.x).toBeCloseTo(3.5)
            expect(resolved!.position.y).toBeCloseTo(1.2)
            expect(resolved!.position.z).toBeCloseTo(-5.1)
            expect(resolved!.rotationY).toBe(0)
        })

        // Characterization test: independently re-derives the expected X/Z via
        // Vector3.applyAxisAngle (a different THREE.js code path than the implementation's
        // Quaternion.setFromAxisAngle().applyQuaternion()) rather than hand-computed trig, so it
        // cross-checks the composition logic without re-deriving rotation matrices by hand. Pins
        // the exact math UserPropPlacer.positionModelOnShelf() used before this extraction: only
        // x/z rotate with the shelf's yaw, y is always a plain additive offset.
        it('rotates the local X/Z offset by the shelf yaw, leaving Y purely additive', () => {
            emitShelfReady(0, new THREE.Vector3(5, 0, -10), Math.PI / 2)
            const localOffset = { x: 0.85, y: 1.25, z: 0 }

            const resolved = registry.resolve(0, localOffset)

            const expectedXZ = new THREE.Vector3(localOffset.x, 0, localOffset.z)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
            expect(resolved).not.toBeNull()
            expect(resolved!.position.x).toBeCloseTo(5 + expectedXZ.x)
            expect(resolved!.position.y).toBeCloseTo(0 + localOffset.y)
            expect(resolved!.position.z).toBeCloseTo(-10 + expectedXZ.z)
            expect(resolved!.rotationY).toBe(Math.PI / 2)
        })

        it('reflects a ShelfUnitRepositionRequested for the same index', () => {
            emitShelfReady(2, new THREE.Vector3(0, 0, 0), 0)
            emitReposition(2, new THREE.Vector3(10, 0, 10), Math.PI)

            const resolved = registry.resolve(2, { x: 0, y: 0, z: 0 })

            expect(resolved!.position.x).toBeCloseTo(10)
            expect(resolved!.position.z).toBeCloseTo(10)
            expect(resolved!.rotationY).toBe(Math.PI)
        })
    })

    describe('getAll()', () => {
        it('reflects every shelf published so far', () => {
            emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)
            emitShelfReady(1, new THREE.Vector3(2, 0, 0), 0)

            expect(registry.getAll().size).toBe(2)
            expect(registry.getAll().get(1)?.position.x).toBeCloseTo(2)
        })

        it('drops everything on a fresh layout wave (shelfIndex 0 arriving again)', () => {
            emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)
            emitShelfReady(1, new THREE.Vector3(2, 0, 0), 0)

            emitShelfReady(0, new THREE.Vector3(99, 0, 99), 0)

            expect(registry.getAll().size).toBe(1)
            expect(registry.getAll().has(1)).toBe(false)
        })
    })

    describe('attach()', () => {
        it('positions the object immediately when the shelf is already known', () => {
            emitShelfReady(0, new THREE.Vector3(4, 0, -2), 0)
            const object3D = new THREE.Object3D()

            registry.attach(0, { x: 1, y: 0, z: 0 }, object3D)

            expect(object3D.position.x).toBeCloseTo(5)
            expect(object3D.position.z).toBeCloseTo(-2)
        })

        it('does not throw and leaves the object unpositioned when the shelf is not yet known', () => {
            const object3D = new THREE.Object3D()
            expect(() => registry.attach(5, { x: 1, y: 0, z: 0 }, object3D)).not.toThrow()
            expect(object3D.position.x).toBe(0)
        })

        it('re-applies once the shelf it was attached to becomes known', () => {
            const object3D = new THREE.Object3D()
            registry.attach(5, { x: 1, y: 0, z: 0 }, object3D)

            emitShelfReady(5, new THREE.Vector3(7, 0, 0), 0)

            expect(object3D.position.x).toBeCloseTo(8)
        })

        it('follows a shelf through a liminal recycle (ShelfUnitRepositionRequested)', () => {
            emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)
            const object3D = new THREE.Object3D()
            registry.attach(0, { x: 0, y: 0, z: 0 }, object3D)

            emitReposition(0, new THREE.Vector3(50, 0, -50), Math.PI)

            expect(object3D.position.x).toBeCloseTo(50)
            expect(object3D.position.z).toBeCloseTo(-50)
            expect(object3D.rotation.y).toBeCloseTo(Math.PI)
        })

        it('honors a custom applyTransform, for composition beyond a plain yaw match', () => {
            emitShelfReady(0, new THREE.Vector3(0, 0, 0), Math.PI / 2)
            const object3D = new THREE.Object3D()
            const upright = new THREE.Euler(Math.PI / 2, 0, 0)

            registry.attach(0, { x: 0, y: 0, z: 0 }, object3D, (obj, transform) => {
                obj.position.copy(transform.position)
                const shelfQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), transform.rotationY)
                const uprightQuat = new THREE.Quaternion().setFromEuler(upright)
                obj.quaternion.multiplyQuaternions(shelfQuat, uprightQuat)
            })

            const expectedQuat = new THREE.Quaternion()
                .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
                .multiply(new THREE.Quaternion().setFromEuler(upright))
            expect(object3D.quaternion.angleTo(expectedQuat)).toBeCloseTo(0, 5)
        })

        it('drops the attachment on a fresh layout wave — a stale object no longer auto-repositions', () => {
            emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)
            const object3D = new THREE.Object3D()
            registry.attach(0, { x: 0, y: 0, z: 0 }, object3D)
            expect(object3D.position.x).toBeCloseTo(0)

            // Fresh wave — same index reused with a different position.
            emitShelfReady(0, new THREE.Vector3(999, 0, 999), 0)

            expect(object3D.position.x).not.toBeCloseTo(999)
        })

        it('supports multiple independent attachments on the same shelf', () => {
            emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)
            const left = new THREE.Object3D()
            const right = new THREE.Object3D()

            registry.attach(0, { x: -1, y: 0, z: 0 }, left)
            registry.attach(0, { x: 1, y: 0, z: 0 }, right)
            emitReposition(0, new THREE.Vector3(10, 0, 0), 0)

            expect(left.position.x).toBeCloseTo(9)
            expect(right.position.x).toBeCloseTo(11)
        })
    })
})
