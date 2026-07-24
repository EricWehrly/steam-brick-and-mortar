import { describe, it, expect } from 'vitest'
import { WALL_TARGETS } from '../../../../../src/scene/props/wall-art/WallTargets'

const DIMENSIONS = { width: 22, depth: 16 }
const CLEARANCE = 0.14

function findWall(name: 'back' | 'left' | 'right') {
    const wall = WALL_TARGETS.find(w => w.name === name)
    if (!wall) throw new Error(`wall target "${name}" not found`)
    return wall
}

describe('WALL_TARGETS', () => {
    it('spans the back wall by room width and the side walls by room depth', () => {
        expect(findWall('back').span(DIMENSIONS)).toBe(DIMENSIONS.width)
        expect(findWall('left').span(DIMENSIONS)).toBe(DIMENSIONS.depth)
        expect(findWall('right').span(DIMENSIONS)).toBe(DIMENSIONS.depth)
    })

    it('positions the back wall along x, offset into the room along -z', () => {
        const { x, z } = findWall('back').positionXZ(DIMENSIONS, 3, CLEARANCE)
        expect(x).toBe(3)
        expect(z).toBeCloseTo(-DIMENSIONS.depth / 2 + CLEARANCE)
    })

    it('positions the left wall along z, offset into the room along +x', () => {
        const { x, z } = findWall('left').positionXZ(DIMENSIONS, 3, CLEARANCE)
        expect(x).toBeCloseTo(-DIMENSIONS.width / 2 + CLEARANCE)
        expect(z).toBe(3)
    })

    it('positions the right wall along z, offset into the room along -x', () => {
        const { x, z } = findWall('right').positionXZ(DIMENSIONS, 3, CLEARANCE)
        expect(x).toBeCloseTo(DIMENSIONS.width / 2 - CLEARANCE)
        expect(z).toBe(3)
    })

    it('rotates left/right walls to face into the room, matching RoomManager\'s own wall rotations', () => {
        expect(findWall('back').rotationY).toBe(0)
        expect(findWall('left').rotationY).toBeCloseTo(Math.PI / 2)
        expect(findWall('right').rotationY).toBeCloseTo(-Math.PI / 2)
    })
})
