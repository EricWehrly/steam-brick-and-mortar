/**
 * ShelfAnchorRegistry
 *
 * Object3D.add() for shelves that don't have an Object3D to add to — shelf units are
 * GPU-instanced (InstancedMeshManager), so there is no per-shelf scene-graph node a prop can
 * literally be parented to. This registry is the shelf half of the placement-anchor design (the
 * room half is ordinary Three.js parenting onto RoomManager's roomGroup); see
 * docs/plans/placement-anchor-system-plan.md.
 *
 * Owns the single authoritative shelfIndex -> transform map, kept current from both ShelfReady
 * (a fresh layout wave) and ShelfUnitRepositionRequested (liminal's treadmill recycling one unit
 * in place). A caller that wants a prop to ride a shelf indefinitely — including through liminal
 * recycling — attaches it once via attach(); the registry re-applies the transform whenever that
 * shelf's position changes, for as long as the attachment lives. resolve() is the same
 * composition math without an attachment, for callers that only need a position right now
 * (instanced game boxes, which have no Object3D to hand over).
 *
 * onReshaped/offReshaped (a subscription for dependents that need to do more than move — appear,
 * disappear, re-render) is deliberately not built here. Nothing in the current migration
 * (UserPropPlacer) needs it; it's Story 4b's addition, once a real caller exists to shape it
 * against.
 */

import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import {
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type ShelfUnitRepositionRequestedEvent,
} from '../../types/InteractionEvents'

const Y_AXIS = new THREE.Vector3(0, 1, 0)

export interface ShelfTransform {
    readonly position: THREE.Vector3
    readonly rotationY: number
}

export interface ShelfLocalOffset {
    readonly x: number
    readonly y: number
    readonly z: number
}

/** Applies a resolved shelf transform to an attached object. Default is a plain yaw match —
 *  callers needing a different composition (e.g. an additional upright rotation on top of the
 *  shelf's facing) pass their own. */
export type ShelfTransformApplier = (object3D: THREE.Object3D, transform: ShelfTransform) => void

const defaultApplier: ShelfTransformApplier = (object3D, transform) => {
    object3D.position.copy(transform.position)
    object3D.rotation.y = transform.rotationY
}

interface Attachment {
    readonly object3D: THREE.Object3D
    readonly localOffset: ShelfLocalOffset
    readonly applyTransform: ShelfTransformApplier
}

export class ShelfAnchorRegistry {
    private static instance: ShelfAnchorRegistry | null = null

    private readonly shelvesByIndex = new Map<number, ShelfTransform>()
    private readonly attachmentsByShelfIndex = new Map<number, Attachment[]>()

    public static getInstance(): ShelfAnchorRegistry {
        if (!ShelfAnchorRegistry.instance) {
            ShelfAnchorRegistry.instance = new ShelfAnchorRegistry()
        }
        return ShelfAnchorRegistry.instance
    }

    private constructor() {
        EventManager.getInstance().registerEventHandler<ShelfReadyEvent>(
            StorePropsEventTypes.ShelfReady,
            this.handleShelfReady.bind(this)
        )
        EventManager.getInstance().registerEventHandler<ShelfUnitRepositionRequestedEvent>(
            StorePropsEventTypes.ShelfUnitRepositionRequested,
            this.handleShelfUnitRepositionRequested.bind(this)
        )
    }

    private handleShelfReady(event: CustomEvent<ShelfReadyEvent>): void {
        const { shelfIndex, position, rotationY } = event.detail
        // ShelfLayoutCoordinator emits a contiguous wave per run starting at index 0 — the same
        // "fresh wave" signal every other shelf-anchored consumer already keys off of (see
        // UserPropPlacer.handleShelfReady, SceneSignManager). A shelf index from the old layout
        // means something different in the new one, so attachments left over from it must not
        // silently reapply against it.
        if (shelfIndex === 0) {
            this.shelvesByIndex.clear()
            this.attachmentsByShelfIndex.clear()
        }
        this.setShelfTransform(shelfIndex, position as THREE.Vector3, rotationY)
    }

    private handleShelfUnitRepositionRequested(event: CustomEvent<ShelfUnitRepositionRequestedEvent>): void {
        const { shelfIndex, position, rotationY } = event.detail
        this.setShelfTransform(shelfIndex, position as THREE.Vector3, rotationY)
    }

    private setShelfTransform(shelfIndex: number, position: THREE.Vector3, rotationY: number): void {
        this.shelvesByIndex.set(shelfIndex, { position: position.clone(), rotationY })
        this.reapplyAttachments(shelfIndex)
    }

    /** Composes a shelf's current transform with a local offset. Null if the shelf is unknown
     *  (not yet published, or dropped by a fresh layout wave). */
    public resolve(shelfIndex: number, localOffset: ShelfLocalOffset): ShelfTransform | null {
        const shelf = this.shelvesByIndex.get(shelfIndex)
        if (!shelf) return null

        const shelfQuat = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, shelf.rotationY)
        const rotatedXZ = new THREE.Vector3(localOffset.x, 0, localOffset.z).applyQuaternion(shelfQuat)

        return {
            position: new THREE.Vector3(
                shelf.position.x + rotatedXZ.x,
                shelf.position.y + localOffset.y,
                shelf.position.z + rotatedXZ.z,
            ),
            rotationY: shelf.rotationY,
        }
    }

    /** Registers object3D at localOffset on shelfIndex, applying the transform immediately (if
     *  the shelf is already known) and again every time that shelf's transform changes —
     *  including a liminal recycle — for as long as this registry instance lives. */
    public attach(
        shelfIndex: number,
        localOffset: ShelfLocalOffset,
        object3D: THREE.Object3D,
        applyTransform: ShelfTransformApplier = defaultApplier
    ): void {
        const entries = this.attachmentsByShelfIndex.get(shelfIndex) ?? []
        entries.push({ object3D, localOffset, applyTransform })
        this.attachmentsByShelfIndex.set(shelfIndex, entries)
        this.applyOne({ object3D, localOffset, applyTransform }, shelfIndex)
    }

    /** All shelves currently known, for callers that need to reason over the whole set (e.g.
     *  UserPropPlacer's weighted shelf selection) rather than a single index. */
    public getAll(): ReadonlyMap<number, ShelfTransform> {
        return this.shelvesByIndex
    }

    private reapplyAttachments(shelfIndex: number): void {
        const entries = this.attachmentsByShelfIndex.get(shelfIndex)
        if (!entries) return
        for (const entry of entries) {
            this.applyOne(entry, shelfIndex)
        }
    }

    private applyOne(entry: Attachment, shelfIndex: number): void {
        const resolved = this.resolve(shelfIndex, entry.localOffset)
        if (!resolved) return
        entry.applyTransform(entry.object3D, resolved)
    }

    /** Test-only — mirrors DataManager's resetInstance() convention. */
    public static resetInstance(): void {
        ShelfAnchorRegistry.instance = null
    }
}
