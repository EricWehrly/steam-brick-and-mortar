export class ShelfCalculationUtils {
    static calculateShelfY(
        shelfLevel: number,
        height: number,
        shelfCount: number,
        verticalOffset: number = 0
    ): number {
        const shelfSpacing = height / (shelfCount + 1)
        return shelfLevel * shelfSpacing + verticalOffset
    }
    
    static calculateAllShelfYPositions(config: {
        height: number
        shelfCount: number
        shelfVerticalOffset?: number
    }): number[] {
        const positions: number[] = []
        for (let i = 1; i <= config.shelfCount; i++) {
            positions.push(ShelfCalculationUtils.calculateShelfY(
                i,
                config.height,
                config.shelfCount,
                config.shelfVerticalOffset ?? 0
            ))
        }
        return positions
    }
    
    static calculateShelfDepthAndOffset(
        shelfLevel: number,
        config: {
            depth: number
            boardThickness: number
            shelfCount: number
            shelfExtensionPerLevel: number
        }
    ): { shelfDepth: number; forwardOffset: number } {
        const middleShelf = (config.shelfCount + 1) / 2
        const baseExtension = config.shelfExtensionPerLevel
        const graduatedExtension = (middleShelf - shelfLevel) * (config.shelfExtensionPerLevel * 0.64)
        const totalExtension = baseExtension + graduatedExtension
        
        const shelfDepth = (config.depth * 2) - config.boardThickness * 2 + totalExtension
        const forwardOffset = 0
        
        return { shelfDepth, forwardOffset }
    }
}
