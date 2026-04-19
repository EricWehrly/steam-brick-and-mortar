import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { GameBoxUtils } from '../../../../../src/scene/props/shared/GameBoxUtils'
import { ShelfFace } from '../../../../../src/scene/props/shared/SharedPropsTypes'

const SURFACE = { topY: 0.5, frontZ: 0.3, backZ: -0.3, centerX: 0, width: 2.0 }
const DIMS = { width: 0.25, height: 0.35, depth: 0.05 }
const GAME = { appid: 1, name: 'Test Game', playtime_forever: 0 } as any

describe('GameBoxUtils.calculateGamePositions', () => {
    it('positions games at shelf center when no rotation', () => {
        const shelfPos = new THREE.Vector3(0, 0, -5)
        const [pos] = GameBoxUtils.calculateGamePositions(shelfPos, SURFACE, [GAME], ShelfFace.Far, DIMS, 0)
        expect(pos.x).toBeCloseTo(0, 1)
        expect(pos.z).toBeGreaterThan(-5.5)
        expect(pos.z).toBeLessThan(-4.5)
    })

    it('rotates game positions by shelfRotationY', () => {
        const shelfPos = new THREE.Vector3(-4, 0, -4)
        const [posRotated] = GameBoxUtils.calculateGamePositions(shelfPos, SURFACE, [GAME], ShelfFace.Far, DIMS, Math.PI / 4)
        const [posFlat] = GameBoxUtils.calculateGamePositions(shelfPos, SURFACE, [GAME], ShelfFace.Far, DIMS, 0)
        expect(posRotated.x).not.toBeCloseTo(posFlat.x, 1)
    })
})

describe('GameBoxUtils.calculateGameRotation', () => {
    // Convention: game box artwork is on the -Z face of the model.
    // Arc shelves have rotationY = atan2(x,z)+PI so their +Z front faces inward (toward origin).
    // Front side: totalY = shelfRotationY + PI so -Z artwork faces player.
    // Back side:  totalY = shelfRotationY     so -Z artwork faces outward (away from player).

    it('front side with no shelf rotation applies PI flip so artwork (-Z) faces +Z (toward player at origin)', () => {
        const q = GameBoxUtils.calculateGameRotation(0, ShelfFace.Far)
        // totalY = PI: sin(PI/2)=1, cos(PI/2)=0
        expect(q.y).toBeCloseTo(Math.sin(Math.PI / 2), 2)
        expect(q.w).toBeCloseTo(Math.cos(Math.PI / 2), 2)
    })

    it('back side with no shelf rotation returns near-identity so -Z artwork faces away from player', () => {
        const q = GameBoxUtils.calculateGameRotation(0, ShelfFace.Near)
        expect(q.x).toBeCloseTo(0); expect(q.y).toBeCloseTo(0)
        expect(q.z).toBeCloseTo(0); expect(q.w).toBeCloseTo(1)
    })

    it('front side combines shelf rotation with PI flip', () => {
        const rotY = Math.PI / 3
        const totalY = rotY + Math.PI
        const q = GameBoxUtils.calculateGameRotation(rotY, ShelfFace.Far)
        expect(q.y).toBeCloseTo(Math.sin(totalY / 2), 3)
        expect(q.w).toBeCloseTo(Math.cos(totalY / 2), 3)
    })

    it('back side uses shelf rotation only (no extra flip)', () => {
        const rotY = Math.PI / 4
        const q = GameBoxUtils.calculateGameRotation(rotY, ShelfFace.Near)
        expect(q.y).toBeCloseTo(Math.sin(rotY / 2), 3)
        expect(q.w).toBeCloseTo(Math.cos(rotY / 2), 3)
    })

    it('front and back produce different rotations for the same shelf', () => {
        const rotY = Math.PI / 3
        const qFront = GameBoxUtils.calculateGameRotation(rotY, ShelfFace.Far)
        const qBack = GameBoxUtils.calculateGameRotation(rotY, ShelfFace.Near)
        expect(qFront.y).not.toBeCloseTo(qBack.y, 3)
    })
})