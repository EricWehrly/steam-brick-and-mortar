import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { GameBoxFoldModel } from '../../../../src/scene/game-box-fold/GameBoxFoldModel'

// Matches GameBoxFoldModel's own SUMMON_DURATION_S/FRONT_COVER_DURATION_S/SECOND_FLAP_DURATION_S
// (0.2s each) - kept here only as named waypoints for stepping the mixer in tests, not duplicated
// production logic.
const SUMMON_END_S = 0.2
const FRONT_COVER_END_S = 0.4
const FULL_OPEN_S = 0.6

function getHinges(model: GameBoxFoldModel): [THREE.Group, THREE.Group] {
    return model.group.children.slice(1) as [THREE.Group, THREE.Group]
}

describe('GameBoxFoldModel', () => {
    it('starts closed - both hinges at rotation 0, before any playOpen()', () => {
        const model = new GameBoxFoldModel()
        const [leftHinge, rightHinge] = getHinges(model)

        expect(leftHinge.rotation.y).toBe(0)
        expect(rightHinge.rotation.y).toBe(0)

        model.dispose()
    })

    it('playOpen() ends with both hinges at PI and the group scaled to 1', () => {
        const model = new GameBoxFoldModel()
        const [leftHinge, rightHinge] = getHinges(model)

        model.playOpen()
        model.update(FULL_OPEN_S + 1) // overshoot - LoopOnce + clampWhenFinished clamps to the end

        expect(leftHinge.rotation.y).toBeCloseTo(Math.PI)
        expect(rightHinge.rotation.y).toBeCloseTo(Math.PI)
        expect(model.group.scale.x).toBeCloseTo(1)

        model.dispose()
    })

    it('once open, the front cover lands on the viewer\'s LEFT and the second flap on the viewer\'s '
        + 'RIGHT, accounting for GameBoxFoldCoordinator\'s 180-degree facing rotation on the whole '
        + 'model (MODEL_FACING_ROTATION_Y) - the model\'s own local +X/-X are each other\'s viewer-'
        + 'relative side once that outer rotation is composed in; a bug here previously had them '
        + 'swapped because that composition was never checked, only the model\'s own local frame', () => {
        const model = new GameBoxFoldModel()
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
        const model = new GameBoxFoldModel()
        const [leftHinge, rightHinge] = getHinges(model)

        model.playOpen()
        model.update(SUMMON_END_S + (FRONT_COVER_END_S - SUMMON_END_S) / 2) // mid front-cover swing

        expect(leftHinge.rotation.y).toBeGreaterThan(0)
        expect(leftHinge.rotation.y).toBeLessThan(Math.PI)
        expect(rightHinge.rotation.y).toBe(0)

        model.dispose()
    })

    it('playClose() reverses fully open back to closed and small', () => {
        const model = new GameBoxFoldModel()
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
        const model = new GameBoxFoldModel()
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

    it('setContent() redraws in place - the underlying texture objects are reused, not reallocated', () => {
        const model = new GameBoxFoldModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any
        const leftTextureBefore = internal.leftTexture
        const rightTextureBefore = internal.rightTexture

        model.setContent({ name: 'Half-Life 3' })
        model.setContent({ name: 'Portal 3', genre: 'Puzzle', playtimeHours: 12 })

        expect(internal.leftTexture).toBe(leftTextureBefore)
        expect(internal.rightTexture).toBe(rightTextureBefore)

        model.dispose()
    })

    it('setContent() marks both content textures dirty (version bump - Texture.needsUpdate is write-only)', () => {
        const model = new GameBoxFoldModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any
        const leftVersionBefore = internal.leftTexture.version
        const rightVersionBefore = internal.rightTexture.version

        model.setContent({ name: 'Half-Life 3' })

        expect(internal.leftTexture.version).toBeGreaterThan(leftVersionBefore)
        expect(internal.rightTexture.version).toBeGreaterThan(rightVersionBefore)

        model.dispose()
    })

    it('setCoverTexture() does not dispose the texture it is handed - caller owns that lifecycle', () => {
        const model = new GameBoxFoldModel()
        const texture = new THREE.Texture()
        const disposeSpy = vi.spyOn(texture, 'dispose')

        model.setCoverTexture(texture)
        model.setCoverTexture(null)

        expect(disposeSpy).not.toHaveBeenCalled()

        model.dispose()
    })

    it('closed panels are stacked at the same X/Y footprint, separated only by Z', () => {
        const model = new GameBoxFoldModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any
        const [leftHinge, rightHinge] = getHinges(model)
        const [leftMesh] = leftHinge.children as THREE.Mesh[]
        const [rightMesh] = rightHinge.children as THREE.Mesh[]

        // In each hinge's own local space (rotation 0 = closed), the mesh sits centered on the
        // group's origin - hingeX and the mesh's local offset cancel out.
        const leftWorldX = leftHinge.position.x + leftMesh.position.x
        const rightWorldX = rightHinge.position.x + rightMesh.position.x
        expect(leftWorldX).toBeCloseTo(0)
        expect(rightWorldX).toBeCloseTo(0)

        // Front cover (leftHinge) is closer to the viewer (more negative Z) than the second flap
        // (rightHinge), which is closer than the base (Z=0) - see FACE_INDEX's "-Z toward viewer"
        // comment in the source.
        expect(leftHinge.position.z).toBeLessThan(rightHinge.position.z)
        expect(rightHinge.position.z).toBeLessThan(internal.baseMesh.position.z)

        model.dispose()
    })

    it('dispose() frees geometry and materials it owns, and stops the mixer', () => {
        const model = new GameBoxFoldModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any

        const geometryDisposeSpies = model.group.children.flatMap(child => {
            const meshes = child instanceof THREE.Mesh ? [child] : (child as THREE.Group).children
            return meshes.map(mesh => vi.spyOn((mesh as THREE.Mesh).geometry, 'dispose'))
        })
        const leftTextureDispose = vi.spyOn(internal.leftTexture, 'dispose')
        const rightTextureDispose = vi.spyOn(internal.rightTexture, 'dispose')
        const stopAllActionSpy = vi.spyOn(internal.mixer, 'stopAllAction')

        model.dispose()

        geometryDisposeSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1))
        expect(leftTextureDispose).toHaveBeenCalledTimes(1)
        expect(rightTextureDispose).toHaveBeenCalledTimes(1)
        expect(stopAllActionSpy).toHaveBeenCalledTimes(1)
    })
})
