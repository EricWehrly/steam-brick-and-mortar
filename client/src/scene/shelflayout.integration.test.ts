/**
 * Shelf layout integration test
 *
 * Simulates the arc layout -> shelf creation -> game placement pipeline with a
 * realistic game count matching production (47 batches). Verifies:
 *   - Every shelf gets a position and correct rotation from its arc row
 *   - rowIndex uses stored arc row, not batchIndex/maxPerRow grid formula
 *   - Game boxes placed on arc shelves face the player (Three.js BoxGeometry front is +Z;
 *     after shelf rotation, +Z should point toward origin)
 *   - Back-wall row (row 4) is correctly identified for backside suppression
 *
 * Heavier than unit tests -- use yarn vitest run with explicit path or yarn test:integration.
 * @tag integration
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeArcShelfLayout } from '../scene/props/shared/ArcLayoutUtils'
import { GameBoxUtils } from '../scene/props/shared/GameBoxUtils'
import { ShelfSide } from '../scene/props/shared/SharedPropsTypes'

// Match production config exactly
const TOTAL_BATCHES = 47
const FIXED_ROWS = 4 + 6 + 10 + 12  // 32

const ARC_CONFIG = {
    rows: 5,
    shelvesPerRow: 10,
    shelvesPerRowByRow: [4, 6, 10, 12, Math.max(1, TOTAL_BATCHES - FIXED_ROWS)],
    halfAngle: Math.PI / 3,
    halfAngleByRow: [
        Math.PI / 3,
        Math.PI / 3.5,
        Math.PI / 3,
        Math.PI / 3,
        Math.PI / 2.6,
    ],
    minShelfGap: 1.0,
    shelfWidthMetres: 2.0,
    rowRadiusStep: 4.0,
    firstRowRadius: 5.5,
}

const BOX_DIMS = { width: 0.2, height: 0.3, depth: 0.1 }
const MAX_PER_ROW = 4  // matches GpuStorePropsRenderer.maxShelvesPerRow

describe('arc shelf layout integration', () => {
    const shelves = computeArcShelfLayout(TOTAL_BATCHES, ARC_CONFIG)

    it('allocates exactly one slot per batch', () => {
        expect(shelves.length).toBe(TOTAL_BATCHES)
    })

    it('shelf positions are all in the -Z half-space (in front of player)', () => {
        shelves.forEach((s, i) => {
            expect(s.position.z, `shelf ${i} should be at negative Z`).toBeLessThan(0)
        })
    })

    it('each shelf rotation Y points its front face (+Z) toward player at origin', () => {
        // Three.js BoxGeometry front face is +Z in local space.
        // rotationY in ArcLayoutUtils = atan2(x, z) + PI so that +Z rotated faces inward.
        shelves.forEach((s, i) => {
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rotationY)
            const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q)  // +Z front face
            const toOrigin = new THREE.Vector3(-s.position.x, 0, -s.position.z).normalize()
            const dot = front.dot(toOrigin)
            expect(dot, `shelf ${i} (row ${s.row}, rotY=${s.rotationY.toFixed(2)}) +Z front should face origin`).toBeGreaterThan(0.99)
        })
    })

    it('stored arc rowIndex differs from grid formula for middle rows', () => {
        // Documents that GpuStorePropsRenderer must use shelfRowIndices[], not Math.floor(batchIndex/4)
        const mismatches = shelves.filter((s, i) => Math.floor(i / MAX_PER_ROW) !== s.row)
        expect(mismatches.length).toBeGreaterThan(0)
    })

    it('game box rotation for front side faces player at all arc angles', () => {
        // calculateGameRotation(rotY, Front) applies rotY only.
        // Since shelf front is +Z and game front is -Z (artwork face), adding PI for back flip:
        // front game: same rotation as shelf -> -Z game front should face same direction as shelf +Z front
        // Actually: game box model has artwork on -Z face. rotationY = shelf rotation.
        // After rotation, game -Z face points same direction as shelf +Z = toward origin. Check dot > 0.9.
        shelves.forEach((s, i) => {
            const rotation = GameBoxUtils.calculateGameRotation(s.rotationY, ShelfSide.Front)
            const gameFront = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation)
            const toOrigin = new THREE.Vector3(-s.position.x, 0, -s.position.z).normalize()
            const dot = gameFront.dot(toOrigin)
            expect(dot, `game at shelf ${i} (row ${s.row}, rotY=${s.rotationY.toFixed(2)}) -Z artwork face should face player`).toBeGreaterThan(0.99)
        })
    })

    it('back-side game rotation is opposite to front-side rotation for inner rows', () => {
        shelves.filter(s => s.row < 4).forEach((s, i) => {
            const front = GameBoxUtils.calculateGameRotation(s.rotationY, ShelfSide.Front)
            const back = GameBoxUtils.calculateGameRotation(s.rotationY, ShelfSide.Back)
            const frontVec = new THREE.Vector3(0, 0, -1).applyQuaternion(front)
            const backVec = new THREE.Vector3(0, 0, -1).applyQuaternion(back)
            const dot = frontVec.dot(backVec)
            expect(dot, `inner shelf ${i} (row ${s.row}) front/back artwork faces should be opposite`).toBeLessThan(-0.99)
        })
    })

    it('back-wall row (row 4) shelves are all identified with row===4', () => {
        const backWall = shelves.filter(s => s.row === 4)
        expect(backWall.length).toBe(15)  // TOTAL_BATCHES - FIXED_ROWS = 47 - 32
        backWall.forEach(s => expect(s.row).toBe(4))
    })

    it('game positions are all finite for front side on all arc shelves', () => {
        const surface = { topY: 0.5, frontZ: 0.3, backZ: -0.3, centerX: 0, width: 2.0 }
        const game = { appid: 1, name: 'Test', playtime_forever: 0 } as never

        shelves.forEach((s, i) => {
            const [pos] = GameBoxUtils.calculateGamePositions(s.position, surface, [game], ShelfSide.Front, BOX_DIMS, s.rotationY)
            expect(isFinite(pos.x), `game at shelf ${i} x must be finite`).toBe(true)
            expect(isFinite(pos.z), `game at shelf ${i} z must be finite`).toBe(true)
        })
    })

    it('row distribution matches expected [4, 6, 10, 12, 15]', () => {
        const counts = [0, 0, 0, 0, 0]
        shelves.forEach(s => counts[s.row]++)
        expect(counts).toEqual([4, 6, 10, 12, 15])
    })
})