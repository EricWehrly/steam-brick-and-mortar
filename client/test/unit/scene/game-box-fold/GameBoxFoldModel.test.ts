import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { GameBoxFoldModel } from '../../../../src/scene/game-box-fold/GameBoxFoldModel'

describe('GameBoxFoldModel', () => {
    it('starts closed - both hinges at rotation 0', () => {
        const model = new GameBoxFoldModel()
        const [leftHinge, rightHinge] = model.group.children.slice(1) as THREE.Group[]

        expect(leftHinge.rotation.y).toBe(0)
        expect(rightHinge.rotation.y).toBe(0)

        model.dispose()
    })

    it('setOpenAmount(1) rotates both hinges to PI (fully open)', () => {
        const model = new GameBoxFoldModel()
        const [leftHinge, rightHinge] = model.group.children.slice(1) as THREE.Group[]

        model.setOpenAmount(1)

        expect(leftHinge.rotation.y).toBeCloseTo(Math.PI)
        expect(rightHinge.rotation.y).toBeCloseTo(Math.PI)

        model.dispose()
    })

    it('setOpenAmount() opens the front cover (left) before the second flap (right) - sequential, not simultaneous', () => {
        const model = new GameBoxFoldModel()
        const [leftHinge, rightHinge] = model.group.children.slice(1) as THREE.Group[]

        // First half of the animation: front cover swings fully open, second flap untouched.
        model.setOpenAmount(0.25)
        expect(leftHinge.rotation.y).toBeCloseTo(Math.PI / 2)
        expect(rightHinge.rotation.y).toBe(0)

        model.setOpenAmount(0.5)
        expect(leftHinge.rotation.y).toBeCloseTo(Math.PI)
        expect(rightHinge.rotation.y).toBe(0)

        // Second half: front cover stays fully open, second flap swings open.
        model.setOpenAmount(0.75)
        expect(leftHinge.rotation.y).toBeCloseTo(Math.PI)
        expect(rightHinge.rotation.y).toBeCloseTo(Math.PI / 2)

        model.dispose()
    })

    it('closed panels are stacked at the same X/Y footprint, separated only by Z', () => {
        const model = new GameBoxFoldModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any
        const [leftHinge, rightHinge] = model.group.children.slice(1) as THREE.Group[]
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

    it('setOpenAmount clamps out-of-range input', () => {
        const model = new GameBoxFoldModel()
        const [leftHinge] = model.group.children.slice(1) as THREE.Group[]

        model.setOpenAmount(2)
        expect(leftHinge.rotation.y).toBeCloseTo(Math.PI)

        model.setOpenAmount(-1)
        expect(leftHinge.rotation.y).toBeCloseTo(0)

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

    it('dispose() frees geometry and materials it owns', () => {
        const model = new GameBoxFoldModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any

        const geometryDisposeSpies = model.group.children.flatMap(child => {
            const meshes = child instanceof THREE.Mesh ? [child] : (child as THREE.Group).children
            return meshes.map(mesh => vi.spyOn((mesh as THREE.Mesh).geometry, 'dispose'))
        })
        const leftTextureDispose = vi.spyOn(internal.leftTexture, 'dispose')
        const rightTextureDispose = vi.spyOn(internal.rightTexture, 'dispose')

        model.dispose()

        geometryDisposeSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1))
        expect(leftTextureDispose).toHaveBeenCalledTimes(1)
        expect(rightTextureDispose).toHaveBeenCalledTimes(1)
    })
})
