import { RoomConstants } from '../../RoomManager'

export class VRLayoutUtils {
    static calculateOptimalShelfSpacing(shelfCount: number): number {
        const baseSpacing = RoomConstants.SHELF_SPACING_X
        const minSpacing = 2.0
        const maxSpacing = 3.5
        
        if (shelfCount <= 2) {
            return Math.min(maxSpacing, baseSpacing * 1.2)
        } else if (shelfCount >= 6) {
            return Math.max(minSpacing, baseSpacing * 0.9)
        } else {
            return baseSpacing
        }
    }

    static calculateOptimalRowPosition(rowIndex: number, totalRows: number): number {
        const baseRowSpacing = RoomConstants.SHELF_SPACING_Z
        
        // Center shelves around origin (Z=0)
        // Calculate total depth and offset so middle of shelf area is at Z=0
        const totalDepth = (totalRows - 1) * baseRowSpacing
        const startZ = -totalDepth / 2
        const rowZ = startZ + (rowIndex * baseRowSpacing)
        
        return rowZ
    }
}
