import * as THREE from 'three'
import type { SteamGameData } from '../../game-box/types/GameData'
import type { GameBoxDimensions } from '../../game-box/types/GameBoxOptions'
import { ShelfSide, type ShelfSurface } from './SharedPropsTypes'

// TD: approximated-placement-tripwire
// NOTE: Game positions are approximated from DEFAULT_SHELF_CONFIG (width, shelfCount, etc.).
// If shelf GLTF geometry changes, update GameBoxUtils.calculateGamePositions or
// run `test/unit/scene/placement-tripwire.test.ts` to validate positions don't
// float outside the modeled shelf. This is a deliberate tripwire to catch model-sync regressions.
export const GameLayoutConstants = {
    // Games per shelf board surface (front or back).
    // Intentionally low — readability over density. With 800 games, layout and FOV
    // constrain what's visible; we don't want to cram the shelves.
    GAMES_PER_SURFACE: 3,
    // Number of shelf board surfaces per shelf unit (3 boards × front+back = 6).
    SURFACES_PER_SHELF: 6,
    // Spacing between game box centers. Box width is 0.3m.
    // 0.55m gives comfortable spacing at VR scale — readable from player distance.
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
        boxDimensions: GameBoxDimensions,
        shelfRotationY: number = 0
    ): THREE.Vector3[] {
        const positions: THREE.Vector3[] = []
        
        const gameY = shelfPosition.y + surface.topY + boxDimensions.height / 2
        
        const shelfAngleRad = (SHELF_ANGLE_DEGREES * Math.PI) / 180
        
        const heightFromBottom = surface.topY
        const angleOffset = heightFromBottom * Math.tan(shelfAngleRad)
        
        const gameHalfDepth = boxDimensions.depth / 2
        
        const localZ = (side === ShelfSide.Front
            ? surface.frontZ + (gameHalfDepth * 3)
            : surface.backZ - (gameHalfDepth * 3))
        const localZWithAngle = localZ + (side === ShelfSide.Front ? angleOffset : -angleOffset)

        const totalWidth = (games.length - 1) * GameLayoutConstants.GAME_SPACING
        // Center games on surface. If the span exceeds shelf width, the games will overflow
        // the shelf edge — the spawner should limit GAMES_PER_SURFACE to prevent this.
        // TODO(approx-geometry): clamp based on actual shelf geometry once dynamic surfaces are used.
        const startLocalX = surface.centerX - totalWidth / 2

        const hasRotation = Math.abs(shelfRotationY) > 1e-6
        const shelfQuat = hasRotation
            ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shelfRotationY)
            : null

        for (let i = 0; i < games.length; i++) {
            const localX = startLocalX + (i * GameLayoutConstants.GAME_SPACING)

            if (shelfQuat) {
                const rotated = new THREE.Vector3(localX, 0, localZWithAngle).applyQuaternion(shelfQuat)
                positions.push(new THREE.Vector3(
                    shelfPosition.x + rotated.x,
                    gameY,
                    shelfPosition.z + rotated.z
                ))
            } else {
                positions.push(new THREE.Vector3(
                    shelfPosition.x + localX,
                    gameY,
                    shelfPosition.z + localZWithAngle
                ))
            }
        }
        
        return positions
    }
}
