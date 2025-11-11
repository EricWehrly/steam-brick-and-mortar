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

    static calculateOptimalRowPosition(rowIndex: number): number {
        const entranceZPosition = 3
        const firstRowOffset = -2
        const baseRowSpacing = RoomConstants.SHELF_SPACING_Z
        const maxDepth = -12
        
        let rowZ = entranceZPosition + firstRowOffset - (rowIndex * baseRowSpacing)
        
        const absoluteMaxDepth = entranceZPosition + maxDepth
        if (rowZ < absoluteMaxDepth) {
            const compressionFactor = 0.8
            rowZ = entranceZPosition + firstRowOffset - (rowIndex * baseRowSpacing * compressionFactor)
        }
        
        return Math.max(rowZ, absoluteMaxDepth)
    }
}
