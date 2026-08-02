/**
 * UserPropPlacer's shelf-cap prop placement, migrated onto ShelfAnchorRegistry
 * (docs/plans/placement-anchor-system-plan.md). Exercises placeOnShelf/attachModelToShelf
 * directly rather than through the async GLB-load path (placeModel), which is unrelated to the
 * anchoring change under test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { DataManager, DataDomain } from '../../../../src/core/data'
import { ShelfAnchorRegistry } from '../../../../src/scene/shelves/ShelfAnchorRegistry'
import { UserPropPlacer } from '../../../../src/scene/props/UserPropPlacer'
import { StorePropsEventTypes, type ShelfReadyEvent, type ShelfUnitRepositionRequestedEvent } from '../../../../src/types/InteractionEvents'
import { UIEventTypes } from '../../../../src/types/InteractionEvents'
import type { LayoutRequestedEvent } from '../../../../src/types/EnvironmentEvents'

function emitShelfReady(shelfIndex: number, position: THREE.Vector3, rotationY = 0): void {
    EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        shelfIndex, sectionIndex: 0, position, rotationY,
    })
}

function emitReposition(shelfIndex: number, position: THREE.Vector3, rotationY = 0): void {
    EventManager.getInstance().emit<ShelfUnitRepositionRequestedEvent>(StorePropsEventTypes.ShelfUnitRepositionRequested, {
        shelfIndex, position, rotationY,
    })
}

function emitLayoutRequested(): void {
    EventManager.getInstance().emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, { layoutMode: 'row' as any })
}

function makeFakeModel(): THREE.Group {
    const group = new THREE.Group()
    return group
}

describe('UserPropPlacer — shelf anchoring', () => {
    let placer: UserPropPlacer

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        ShelfAnchorRegistry.resetInstance()
        ;(UserPropPlacer as unknown as { instance: UserPropPlacer | null }).instance = null

        const scene = new THREE.Scene()
        DataManager.getInstance().set('core.mainScene', scene, { domain: DataDomain.Scene })
        placer = UserPropPlacer.getInstance()
    })

    function propsGroup(): THREE.Group {
        return (placer as unknown as { propsGroup: THREE.Group }).propsGroup
    }

    function placeOnShelf(model: THREE.Group): void {
        (placer as unknown as {
            placeOnShelf: (model: THREE.Group, box: THREE.Box3 | null, scale: number, seatOffset?: unknown) => void
        }).placeOnShelf(model, null, 1)
    }

    it('places a queued model once a shelf becomes available', () => {
        const model = makeFakeModel()
        placeOnShelf(model)
        expect(propsGroup().children).toHaveLength(0)

        emitShelfReady(0, new THREE.Vector3(1, 0, -2), 0)

        expect(propsGroup().children).toContain(model)
    })

    it('follows its shelf through a liminal recycle (ShelfUnitRepositionRequested)', () => {
        const model = makeFakeModel()
        emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)
        placeOnShelf(model)
        const initialX = model.position.x

        emitReposition(0, new THREE.Vector3(40, 0, -40), Math.PI)

        // Model moves with its shelf; a small shelf-cap local offset (±~0.85m, see
        // UserPropPlacer.shelfEndLocalX) is expected on top of the shelf's own position.
        expect(model.position.x).not.toBeCloseTo(initialX)
        expect(Math.abs(model.position.x - 40)).toBeLessThan(1)
        expect(Math.abs(model.position.z - -40)).toBeLessThan(1)
    })

    it('re-places an already-placed model after a layout invalidation instead of stranding it', () => {
        const model = makeFakeModel()
        emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)
        placeOnShelf(model)
        expect(propsGroup().children).toContain(model)

        emitLayoutRequested()

        // Pulled out immediately — not left at a position belonging to the old layout.
        expect(propsGroup().children).not.toContain(model)

        // Fresh layout wave republishes anchors; the queued model re-places automatically.
        emitShelfReady(0, new THREE.Vector3(9, 0, 9), 0)

        expect(propsGroup().children).toContain(model)
        expect(Math.abs(model.position.x - 9)).toBeLessThan(1)
    })

    it('does not place two props on the same shelf index', () => {
        const modelA = makeFakeModel()
        const modelB = makeFakeModel()
        emitShelfReady(0, new THREE.Vector3(0, 0, 0), 0)

        placeOnShelf(modelA)
        placeOnShelf(modelB)

        expect(propsGroup().children).toContain(modelA)
        expect(propsGroup().children).not.toContain(modelB)
    })
})
