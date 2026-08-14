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
        model.setContent({ name: 'Portal 3', rating: '92% · Overwhelmingly Positive', playtimeHours: 12, tags: ['Puzzle'] })

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

    it('setContent() handles long names, many tags, and missing optional fields without throwing', () => {
        const model = new GameBoxFoldModel()

        expect(() => model.setContent({
            name: 'A Very Long Game Title That Should Wrap Across Multiple Lines On The Front Cover'
        })).not.toThrow()

        expect(() => model.setContent({
            name: 'Short',
            rating: '100% · Overwhelmingly Positive',
            playtimeHours: 999,
            recentPlaytimeHours: 40,
            tags: ['Action', 'Indie', 'Roguelike', 'Co-op', 'Difficult', 'Pixel Graphics'],
            categories: ['Single-player', 'Steam Achievements', 'Full controller support'],
            userCollections: ['Backlog', 'Favorites'],
            description: 'A very long store-page-style description that should wrap across '
                + 'several lines on the store panel without throwing or overflowing badly.',
            metacritic: 'Metacritic: 91',
            debugJson: JSON.stringify({ appid: 1, nested: { a: 1, b: [1, 2, 3] } }, null, 2)
        })).not.toThrow()

        model.dispose()
    })

    it('setHeaderImage() rasterizes pixel data into the store panel without throwing, and null clears it back to a placeholder', () => {
        const model = new GameBoxFoldModel()
        const width = 4
        const height = 2
        const pixels = new Uint8ClampedArray(width * height * 4).fill(200)

        expect(() => model.setHeaderImage({ pixels, width, height })).not.toThrow()
        expect(() => model.setHeaderImage(null)).not.toThrow()

        model.dispose()
    })

    it('getInteractiveMeshes() returns the base mesh and each hinge\'s single content mesh', () => {
        const model = new GameBoxFoldModel()
        const [leftHinge, rightHinge] = getHinges(model)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any

        const meshes = model.getInteractiveMeshes()

        expect(meshes.store).toBe(internal.baseMesh)
        expect(meshes.identity).toBe(leftHinge.children[0])
        expect(meshes.debug).toBe(rightHinge.children[0])

        model.dispose()
    })

    it('isContentFaceHit() only accepts the -Z face on the store mesh and the +Z face on the flap meshes', () => {
        const model = new GameBoxFoldModel()
        const meshes = model.getInteractiveMeshes()

        expect(model.isContentFaceHit(meshes.store, 5)).toBe(true) // negZ
        expect(model.isContentFaceHit(meshes.store, 4)).toBe(false) // posZ - not the store's content face
        expect(model.isContentFaceHit(meshes.identity, 4)).toBe(true) // posZ
        expect(model.isContentFaceHit(meshes.identity, 5)).toBe(false)
        expect(model.isContentFaceHit(meshes.debug, 4)).toBe(true)
        expect(model.isContentFaceHit(meshes.store, undefined)).toBe(false)

        model.dispose()
    })

    it('isPointInPlayButton() reflects the Play button\'s last-drawn canvas rect, and is false before any content is drawn', () => {
        const model = new GameBoxFoldModel()

        expect(model.isPointInPlayButton(10, 10)).toBe(false)

        model.setContent({ name: 'Half-Life 3' })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rect = (model as any).playButtonRect as { x: number; y: number; width: number; height: number }
        expect(rect).toBeTruthy()

        expect(model.isPointInPlayButton(rect.x + 1, rect.y + 1)).toBe(true)
        expect(model.isPointInPlayButton(rect.x + rect.width - 1, rect.y + rect.height - 1)).toBe(true)
        expect(model.isPointInPlayButton(rect.x - 5, rect.y)).toBe(false)
        expect(model.isPointInPlayButton(rect.x + rect.width + 5, rect.y)).toBe(false)

        model.dispose()
    })

    it('scrollDebugPanel() clamps to [0, maxScroll], resets to 0 on the next setContent(), and is a no-op with no debugJson', () => {
        const model = new GameBoxFoldModel()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internal = model as any

        // No debugJson at all - shouldn't throw, and there's nothing to scroll.
        expect(() => model.scrollDebugPanel(1)).not.toThrow()
        expect(internal.debugScrollLine).toBe(0)

        const manyLines = Array.from({ length: 30 }, (_, i) => `"line${i}": ${i}`).join(',\n')
        model.setContent({ name: 'Half-Life 3', debugJson: `{\n${manyLines}\n}` })
        expect(internal.debugScrollLine).toBe(0) // reset on every new selection

        model.scrollDebugPanel(1)
        expect(internal.debugScrollLine).toBeGreaterThan(0)

        // Scrolling far past the end clamps rather than growing unbounded.
        for (let i = 0; i < 20; i++) model.scrollDebugPanel(1)
        const maxed = internal.debugScrollLine
        expect(maxed).toBe(internal.debugMaxScrollLine)
        model.scrollDebugPanel(1)
        expect(internal.debugScrollLine).toBe(maxed)

        // Scrolling back up clamps at 0, not negative.
        for (let i = 0; i < 20; i++) model.scrollDebugPanel(-1)
        expect(internal.debugScrollLine).toBe(0)

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
