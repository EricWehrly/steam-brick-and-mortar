import * as THREE from 'three'
import type { SteamGameData } from '../../game-box/types/GameData'
import type { GameBoxDimensions } from '../../game-box/types/GameBoxOptions'
import { ShelfSide, type ShelfSurface } from './SharedPropsTypes'

export const GameLayoutConstants = {
    GAMES_PER_SURFACE: 3,
    SURFACES_PER_SHELF: 6,
    GAME_SPACING: 0.55
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
        const startX = shelfPosition.x + surface.centerX - totalWidth / 2
        
        for (let i = 0; i < games.length; i++) {
            const gameX = startX + (i * GameLayoutConstants.GAME_SPACING)
            positions.push(new THREE.Vector3(gameX, gameY, gameZ))
        }
        
        return positions
    }
}
