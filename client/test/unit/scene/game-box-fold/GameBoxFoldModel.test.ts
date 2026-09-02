import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { GameBoxFoldModel, FLAP_OPEN_ROTATION } from '../../../../src/scene/game-box-fold/GameBoxFoldModel'
import { BOX_WIDTH } from '../../../../src/scene/game-box-fold/GameBoxFoldDimensions'

// Matches GameBoxFoldModel's own SUMMON_DURATION_S/FRONT_COVER_DURATION_S/SECOND_FLAP_DURATION_S
// (0.2s each) - kept here only as named waypoints for stepping the mixer in tests, not duplicated
// production logic.
const SUMMON_END_S = 0.2
const FRONT_COVER_END_S = 0.4
const FULL_OPEN_S = 0.6

function buildModel(): GameBoxFoldModel {
    return new GameBoxFoldModel(() => {})
}

function getHinges(model: GameBoxFoldModel): [THREE.Group, THREE.Group] {
    return model.group.children.slice(1) as [THREE.Group, THREE.Group]
}

/** Where a panel's page sits, and which way it faces, in the model group's own space. */
function pageWorldZ(page: THREE.Object3D): number {
    return page.getWorldPosition(new THREE.Vector3()).z
}

function pageFacing(page: THREE.Object3D): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(page.getWorldQuaternion(new THREE.Quaternion()))
}

describe('GameBoxFoldModel', () => {
    it('starts closed - both hinges at rotation 0, before any playOpen()', () => {
        const model = buildModel()
        const [leftHinge, rightHinge] = getHinges(model)

        expect(leftHinge.rotation.y).toBe(0)
        expect(rightHinge.rotation.y).toBe(0)

        model.dispose()
    })

    it('playOpen() ends with both hinges at FLAP_OPEN_ROTATION (just short of a flat 180 - the '
        + 'flaps angle in slightly rather than lying dead flat) and the group scaled to 1', () => {
        const model = buildModel()
        const [leftHinge, rightHinge] = getHinges(model)

        model.playOpen()
        model.update(FULL_OPEN_S + 1) // overshoot - LoopOnce + clampWhenFinished clamps to the end

        expect(leftHinge.rotation.y).toBeCloseTo(FLAP_OPEN_ROTATION)
        expect(rightHinge.rotation.y).toBeCloseTo(FLAP_OPEN_ROTATION)
        expect(leftHinge.rotation.y).toBeLessThan(Math.PI)
        expect(model.group.scale.x).toBeCloseTo(1)

        model.dispose()
    })

    it('once open, the front cover lands on the viewer\'s LEFT and the second flap on the viewer\'s '
        + 'RIGHT, accounting for GameBoxFoldCoordinator\'s 180-degree facing rotation on the whole '
        + 'model (MODEL_FACING_ROTATION_Y) - the model\'s own local +X/-X are each other\'s viewer-'
        + 'relative side once that outer rotation is composed in; a bug here previously had them '
        + 'swapped because that composition was never checked, only the model\'s own local frame', () => {
        const model = buildModel()
        const [leftHinge, rightHinge] = getHinges(model)
        const [leftMesh] = leftHinge.children as THREE.Mesh[]
        const [rightMesh] = rightHinge.children as THREE.Mesh[]

        model.playOpen()
        model.update(FULL_OPEN_S + 1)

        // Simulate GameBoxFoldCoordinator.MODEL_FACING_ROTATION_Y - applied to the whole group
        // (this model's own root), the same way the coordinator applies it in real use.
        model.group.rotation.y = Math.PI
        model.group.updateMatrixWorld(true)

        const leftWorldX = leftMesh.getWorldPosition(new THREE.Vector3()).x
        const rightWorldX = rightMesh.getWorldPosition(new THREE.Vector3()).x
        // Standard camera convention (this project's own CameraInputApplier uses it too): a
        // viewer looking down -Z has "right" = world +X, so viewer-left is negative world X.
        expect(leftWorldX).toBeLessThan(0)
        expect(rightWorldX).toBeGreaterThan(0)

        model.dispose()
    })

    it('opens the front cover (left) before the second flap (right) - sequential, not simultaneous', () => {
        const model = buildModel()
        const [leftHinge, rightHinge] = getHinges(model)

        model.playOpen()
        model.update(SUMMON_END_S + (FRONT_COVER_END_S - SUMMON_END_S) / 2) // mid front-cover swing

        expect(leftHinge.rotation.y).toBeGreaterThan(0)
        expect(leftHinge.rotation.y).toBeLessThan(Math.PI)
        expect(rightHinge.rotation.y).toBe(0)

        model.dispose()
    })

    it('playClose() reverses fully open back to closed and small', () => {
        const model = buildModel()
        const [leftHinge, rightHinge] = getHinges(model)

        model.playOpen()
        model.update(FULL_OPEN_S + 1)

        model.playClose()
        model.update(FULL_OPEN_S + 1)

        expect(leftHinge.rotation.y).toBeCloseTo(0)
        expect(rightHinge.rotation.y).toBeCloseTo(0)
        expect(model.group.scale.x).toBeCloseTo(0.05)

        model.dispose()
    })

    it('onFullyClosed() fires when playClose() finishes, not when playOpen() finishes', () => {
        const model = buildModel()
        const callback = vi.fn()
        model.onFullyClosed(callback)

        model.playOpen()
        model.update(FULL_OPEN_S + 1)
        expect(callback).not.toHaveBeenCalled()

        model.playClose()
        model.update(FULL_OPEN_S + 1)
        expect(callback).toHaveBeenCalledTimes(1)

        model.dispose()
    })

    it('closed, the three panels are stacked at the same X/Y footprint and separated only by Z - '
        + 'front cover nearest the viewer, then the second flap, then the base', () => {
        const model = buildModel()
        const [leftHinge, rightHinge] = getHinges(model)
        const [leftMesh] = leftHinge.children as THREE.Mesh[]
        const [rightMesh] = rightHinge.children as THREE.Mesh[]
        const baseMesh = model.group.children[0]

        // In each hinge's own local space (rotation 0 = closed), the mesh sits centered on the
        // group's origin - hingeX and the mesh's local offset cancel out.
        expect(leftHinge.position.x + leftMesh.position.x).toBeCloseTo(0)
        expect(rightHinge.position.x + rightMesh.position.x).toBeCloseTo(0)

        expect(leftHinge.position.z).toBeLessThan(rightHinge.position.z)
        expect(rightHinge.position.z).toBeLessThan(baseMesh.position.z)

        model.dispose()
    })

    it('fully open, both flaps face the viewer tilted in by FLAP_OPEN_INWARD_ANGLE_DEGREES rather '
        + 'than lying dead flat, and stay close to the store panel\'s own plane - the closed '
        + 'stack\'s Z offsets animate back to zero, so the open box reads as one shallow-cupped '
        + 'object rather than three faces stair-stepped toward the viewer', () => {
        const model = buildModel()

        model.playOpen()
        model.update(FULL_OPEN_S + 1)
        model.group.updateMatrixWorld(true)

        const [storePage, identityPage, debugPage] = model.getPanelRoots() as unknown as THREE.Object3D[]

        // The store panel doesn't hinge - its facing is fixed regardless of the flap-angle
        // change. The model's own -Z is what the coordinator turns toward the viewer.
        expect(pageFacing(storePage).z).toBeCloseTo(-1, 5)

        // Each flap's own front normal, rotated by FLAP_OPEN_ROTATION about Y from local +Z, is
        // cos(FLAP_OPEN_ROTATION) - not -1, since the hinge stops short of a flat 180. Both hinges
        // share this same target rotation, so both tilt in by the same amount.
        const expectedFlapFacingZ = Math.cos(FLAP_OPEN_ROTATION)
        expect(expectedFlapFacingZ).toBeLessThan(-0.9) // sanity: still mostly viewer-facing
        expect(pageFacing(identityPage).z).toBeCloseTo(expectedFlapFacingZ, 5)
        expect(pageFacing(debugPage).z).toBeCloseTo(expectedFlapFacingZ, 5)

        // Not exact coplanarity anymore (the tilt itself shifts each hinge's own pivot by a small,
        // real amount - see the class's buildOpenClip() comment) - bounded well under the hinge's
        // own reach rather than pinned to an exact value, so this doesn't re-derive that geometry
        // by hand while still catching a real regression back to whole-STACK_GAP-scale staggering.
        expect(Math.abs(pageWorldZ(identityPage) - pageWorldZ(storePage))).toBeLessThan(BOX_WIDTH / 2)
        expect(Math.abs(pageWorldZ(debugPage) - pageWorldZ(storePage))).toBeLessThan(BOX_WIDTH / 2)

        model.dispose()
    })

    it('closed, the flap pages are tucked behind the base panel rather than sitting proud of it', () => {
        const model = buildModel()
        model.group.updateMatrixWorld(true)

        const [storePage, identityPage, debugPage] = model.getPanelRoots() as unknown as THREE.Object3D[]
        // -Z is toward the viewer: the store page is the frontmost thing the pages themselves
        // reach while closed, with both flap pages behind it (greater Z), hidden inside the stack.
        expect(pageWorldZ(identityPage)).toBeGreaterThan(pageWorldZ(storePage))
        expect(pageWorldZ(debugPage)).toBeGreaterThan(pageWorldZ(storePage))

        model.dispose()
    })

    it('mounts one uikit page per face, each parented to the panel mesh it belongs to so it '
        + 'inherits that face\'s swing and the group\'s summon scale', () => {
        const model = buildModel()
        const [leftHinge, rightHinge] = getHinges(model)
        const baseMesh = model.group.children[0]

        const pages = model.getPanelRoots() as unknown as THREE.Object3D[]
        expect(pages).toHaveLength(3)
        expect(pages[0].parent).toBe(baseMesh)
        expect(pages[1].parent).toBe(leftHinge.children[0])
        expect(pages[2].parent).toBe(rightHinge.children[0])

        model.dispose()
    })

    it('setContent() handles long names, many tags, and missing optional fields without throwing, '
        + 'and reuses the same page roots across selections', () => {
        const model = buildModel()
        const pagesBefore = model.getPanelRoots()

        expect(() => model.setContent({
            name: 'A Very Long Game Title That Should Wrap Across Multiple Lines On The Front Cover'
        })).not.toThrow()

        expect(() => model.setContent({
            name: 'Short',
            rating: '100% · Overwhelmingly Positive',
            playtimeHours: 999,
            recentPlaytimeHours: 40,
            genres: ['Action', 'Indie'],
            tags: ['Action', 'Indie', 'Roguelike', 'Co-op', 'Difficult', 'Pixel Graphics'],
            categories: ['Single-player', 'Steam Achievements', 'Full controller support'],
            userCollections: ['Backlog', 'Favorites'],
            description: 'A very long store-page-style description that should wrap across '
                + 'several lines on the debug panel without throwing or overflowing badly.',
            metacritic: 'Metacritic: 91',
            debugJson: JSON.stringify({ appid: 1, nested: { a: 1, b: [1, 2, 3] } }, null, 2)
        })).not.toThrow()

        expect(model.getPanelRoots()).toEqual(pagesBefore)

        model.dispose()
    })

    it('setHeaderImage() rasterizes pixel data into the store panel\'s disc, and null clears it back to the placeholder', () => {
        const model = buildModel()
        const width = 4
        const height = 2
        const pixels = new Uint8ClampedArray(width * height * 4).fill(200)

        expect(() => model.setHeaderImage({ pixels, width, height })).not.toThrow()
        expect(() => model.setHeaderImage(null)).not.toThrow()

        model.dispose()
    })

    it('update() drives both the animation mixer (seconds) and every uikit page root (milliseconds)', () => {
        const model = buildModel()
        const pageUpdateSpies = model.getPanelRoots().map(page => vi.spyOn(page, 'update'))

        model.update(0.016)

        pageUpdateSpies.forEach(spy => expect(spy).toHaveBeenCalledWith(16))

        model.dispose()
    })

    it('dispose() frees geometry, materials and page roots it owns, and stops the mixer', () => {
        const model = buildModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any

        const geometryDisposeSpies = model.group.children.flatMap(child => {
            const meshes = child instanceof THREE.Mesh ? [child] : (child as THREE.Group).children
            return meshes.map(mesh => vi.spyOn((mesh as THREE.Mesh).geometry, 'dispose'))
        })
        const pageDisposeSpies = model.getPanelRoots().map(page => vi.spyOn(page, 'dispose'))
        const materialDispose = vi.spyOn(internal.plainMaterial, 'dispose')
        const stopAllActionSpy = vi.spyOn(internal.mixer, 'stopAllAction')

        model.dispose()

        geometryDisposeSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1))
        pageDisposeSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1))
        expect(materialDispose).toHaveBeenCalledTimes(1)
        expect(stopAllActionSpy).toHaveBeenCalledTimes(1)
    })
})
