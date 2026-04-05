import * as THREE from 'three'
import type { SteamGameData } from '../../game-box/types/GameData'
import type { GameBoxDimensions } from '../../game-box/types/GameBoxOptions'
import { ShelfSide, type ShelfSurface } from './SharedPropsTypes'

export const GameLayoutConstants = {
    // Games per shelf board surface (front or back).
    // With 0.32m spacing and 2.0m shelf width, 6 games spans 1.6m — fits with margin.
    GAMES_PER_SURFACE: 6,
    // Number of shelf board surfaces per shelf unit (3 boards × front+back = 6).
    SURFACES_PER_SHELF: 6,
    // Spacing between game box centers. Box width is 0.3m; 0.32m gives ~2cm gap.
    GAME_SPACING: 0.32
} as const

/** Shelf construction constant - 6° backward tilt for stability */
const SHELF_ANGLE_DEGREES = 6

export class GameBoxUtils {
    static generateGameBoxName(game: SteamGameData, side: ShelfSide, index: number, rendererType: 'gpu' | 'legacy'): string {
        const safeName = game.name?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown'
        return `${rendererType}-game-${safeName}-${side}-${index}`
    }

    static calculateGamePositions(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface,
        games: SteamGameData[],
        side: ShelfSide,
        boxDimensions: GameBoxDimensions
    ): THREE.Vector3[] {
        const positions: THREE.Vector3[] = []
        
        const gameY = shelfPosition.y + surface.topY + boxDimensions.height / 2
        
        const shelfAngleRad = (SHELF_ANGLE_DEGREES * Math.PI) / 180
        
        const heightFromBottom = surface.topY
        const angleOffset = heightFromBottom * Math.tan(shelfAngleRad)
        
        const gameHalfDepth = boxDimensions.depth / 2
        
        const baseZ = shelfPosition.z + (side === ShelfSide.Front 
            ? surface.frontZ + (gameHalfDepth * 3)
            : surface.backZ - (gameHalfDepth * 3) )
        
        const gameZ = baseZ + (side === ShelfSide.Front ? angleOffset : -angleOffset)
                
        const totalWidth = (games.length - 1) * GameLayoutConstants.GAME_SPACING
        // Clamp startX so games can't walk off the shelf edge
        const halfShelfWidth = (surface.width / 2) - (boxDimensions.width / 2)
        const rawStartX = shelfPosition.x + surface.centerX - totalWidth / 2
        const startX = Math.max(
            shelfPosition.x + surface.centerX - halfShelfWidth,
            Math.min(rawStartX, shelfPosition.x + surface.centerX + halfShelfWidth - totalWidth)
        )
        
        for (let i = 0; i < games.length; i++) {
            const gameX = startX + (i * GameLayoutConstants.GAME_SPACING)
            positions.push(new THREE.Vector3(gameX, gameY, gameZ))
        }
        
        return positions
    }
}
