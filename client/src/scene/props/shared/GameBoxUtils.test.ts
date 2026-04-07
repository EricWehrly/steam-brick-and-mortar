import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { GameBoxUtils } from './GameBoxUtils'
import { ShelfSide } from './SharedPropsTypes'

const SURFACE = { topY: 0.5, frontZ: 0.3, backZ: -0.3, centerX: 0, width: 2.0 }
const DIMS = { width: 0.25, height: 0.35, depth: 0.05 }
const GAME = { appid: 1, name: 'Test Game', playtime_forever: 0 } as any

describe('GameBoxUtils.calculateGamePositions', () => {
    it('positions games at shelf center when no rotation', () => {
        const shelfPos = new THREE.Vector3(0, 0, -5)
        const [pos] = GameBoxUtils.calculateGamePositions(shelfPos, SURFACE, [GAME], ShelfSide.Front, DIMS, 0)
        expect(pos.x).toBeCloseTo(0, 1)
        expect(pos.z).toBeGreaterThan(-5.5)
        expect(pos.z).toBeLessThan(-4.5)
    })

    it('rotates game positions by shelfRotationY', () => {
        const shelfPos = new THREE.Vector3(-4, 0, -4)
        const [posRotated] = GameBoxUtils.calculateGamePositions(shelfPos, SURFACE, [GAME], ShelfSide.Front, DIMS, Math.PI / 4)
        const [posFlat] = GameBoxUtils.calculateGamePositions(shelfPos, SURFACE, [GAME], ShelfSide.Front, DIMS, 0)
        expect(posRotated.x).not.toBeCloseTo(posFlat.x, 1)
    })
})

describe('GameBoxUtils.calculateGameRotation', () => {
    it('returns identity quaternion when shelfRotationY is 0', () => {
        const q = GameBoxUtils.calculateGameRotation(0, ShelfSide.Front)
        expect(q.x).toBeCloseTo(0); expect(q.y).toBeCloseTo(0)
        expect(q.z).toBeCloseTo(0); expect(q.w).toBeCloseTo(1)
    })

    it('returns PI rotation on Y for back side with no shelf rotation', () => {
        const q = GameBoxUtils.calculateGameRotation(0, ShelfSide.Back)
        expect(q.y).toBeCloseTo(Math.sin(Math.PI / 2), 2)
        expect(q.w).toBeCloseTo(Math.cos(Math.PI / 2), 2)
    })

    it('applies shelf rotation to front-side game boxes', () => {
        const rotY = Math.PI / 3
        const q = GameBoxUtils.calculateGameRotation(rotY, ShelfSide.Front)
        expect(q.y).toBeCloseTo(Math.sin(rotY / 2), 3)
        expect(q.w).toBeCloseTo(Math.cos(rotY / 2), 3)
    })

    it('combines shelf rotation with back-side flip', () => {
        const rotY = Math.PI / 4
        const q = GameBoxUtils.calculateGameRotation(rotY, ShelfSide.Back)
        const qFlat = GameBoxUtils.calculateGameRotation(0, ShelfSide.Back)
        const qFront = GameBoxUtils.calculateGameRotation(rotY, ShelfSide.Front)
        expect(q.y).not.toBeCloseTo(qFlat.y, 3)
        expect(q.y).not.toBeCloseTo(qFront.y, 3)
    })
})