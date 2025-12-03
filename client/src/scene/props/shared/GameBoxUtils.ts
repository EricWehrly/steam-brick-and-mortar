import * as THREE from 'three'
import type { SteamGameData } from '../../game-box/types/GameData'
import { GamePlacementConstants } from './GameLayoutConstants'
import { ShelfSide, type ShelfSurface } from './SharedPropsTypes'

export class GameBoxUtils {
    static generateGameBoxName(game: SteamGameData, side: ShelfSide, index: number, rendererType: 'gpu' | 'legacy'): string {
        const safeName = game.name?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown'
        return `${rendererType}-game-${safeName}-${side}-${index}`
    }

    static calculateGamePositions(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface,
        games: SteamGameData[],
        side: ShelfSide
    ): THREE.Vector3[] {
        const positions: THREE.Vector3[] = []
        
        const gameY = shelfPosition.y + surface.topY + GamePlacementConstants.GAME_HEIGHT / 2
        
        const shelfAngleDegrees = 6
        const shelfAngleRad = (shelfAngleDegrees * Math.PI) / 180
        
        const heightFromBottom = surface.topY
        const angleOffset = heightFromBottom * Math.tan(shelfAngleRad)
        
        const gameHalfDepth = 0.05
        
        const baseZ = shelfPosition.z + (side === ShelfSide.Front 
            ? surface.frontZ + (gameHalfDepth * 3)
            : surface.backZ - (gameHalfDepth * 3) )
        
        const gameZ = baseZ + (side === ShelfSide.Front ? angleOffset : -angleOffset)
                
        const totalWidth = (games.length - 1) * GamePlacementConstants.GAME_SPACING
        const startX = shelfPosition.x + surface.centerX - totalWidth / 2
        
        for (let i = 0; i < games.length; i++) {
            const gameX = startX + (i * GamePlacementConstants.GAME_SPACING)
            positions.push(new THREE.Vector3(gameX, gameY, gameZ))
        }
        
        return positions
    }
}
