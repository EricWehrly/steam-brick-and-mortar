import { describe, expect, it } from 'vitest'
import { computeRoomEnvelopeFromShelfBounds, RoomConstants } from '../../../src/scene/RoomManager'

describe('RoomManager envelope from shelf bounds', () => {
    it('uses symmetric front/back clearance when shelves span origin (spoke-like)', () => {
        const { dimensions, centerOffset } = computeRoomEnvelopeFromShelfBounds({
            minX: -12,
            maxX: 12,
            minZ: -14,
            maxZ: 14,
        })

        expect(dimensions.width).toBeCloseTo(24 + (RoomConstants.STORE_WALL_CLEARANCE * 2), 6)
        expect(dimensions.depth).toBeCloseTo(28 + (RoomConstants.STORE_BACK_CLEARANCE * 2), 6)

        // centerOffset is pre-front-offset in event payload
        const appliedCenterZ = centerOffset.z + RoomConstants.STORE_FRONT_OFFSET
        expect(appliedCenterZ).toBeCloseTo(0, 6)
    })

    it('keeps extra entrance clearance for forward-facing layouts', () => {
        const { dimensions, centerOffset } = computeRoomEnvelopeFromShelfBounds({
            minX: -20,
            maxX: 20,
            minZ: -26,
            maxZ: -4,
        })

        expect(dimensions.width).toBeCloseTo(40 + (RoomConstants.STORE_WALL_CLEARANCE * 2), 6)
        expect(dimensions.depth).toBeCloseTo(22 + RoomConstants.STORE_BACK_CLEARANCE + RoomConstants.STORE_ENTRANCE_CLEARANCE, 6)

        const appliedCenterZ = centerOffset.z + RoomConstants.STORE_FRONT_OFFSET
        const expectedCenterZ = ((-26 - RoomConstants.STORE_BACK_CLEARANCE) + (-4 + RoomConstants.STORE_ENTRANCE_CLEARANCE)) / 2
        expect(appliedCenterZ).toBeCloseTo(expectedCenterZ, 6)
    })
})
