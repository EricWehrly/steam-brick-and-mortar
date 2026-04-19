import * as THREE from 'three'
import type { SteamGameData } from '../../game-box/types/GameData'
import type { GameBoxDimensions } from '../../game-box/types/GameBoxOptions'
import type { StockSurface } from '../../../types/LayoutTypes'
import { ShelfFace, type ShelfSurface } from './SharedPropsTypes'

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
    static generateGameBoxName(game: SteamGameData, face: ShelfFace, index: number, rendererType: 'gpu' | 'legacy'): string {
        const safeName = game.name?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown'
        return `${rendererType}-game-${safeName}-${face}-${index}`
    }

    static calculateGamePositions(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface,
        games: SteamGameData[],
        face: ShelfFace,
        boxDimensions: GameBoxDimensions,
        shelfRotationY: number = 0
    ): THREE.Vector3[] {
        const positions: THREE.Vector3[] = []
        
        const gameY = shelfPosition.y + surface.topY + boxDimensions.height / 2
        
        const shelfAngleRad = (SHELF_ANGLE_DEGREES * Math.PI) / 180
        
        const heightFromBottom = surface.topY
        const angleOffset = heightFromBottom * Math.tan(shelfAngleRad)
        
        const gameHalfDepth = boxDimensions.depth / 2
        
        const localZ = (face === ShelfFace.Far
            ? surface.frontZ + (gameHalfDepth * 3)
            : surface.backZ - (gameHalfDepth * 3))
        const localZWithAngle = localZ + (face === ShelfFace.Far ? angleOffset : -angleOffset)

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

    /**
     * Build an ordered list of StockSurfaces from shelf board surfaces.
     *
     * Each ShelfSurface (one board) becomes two StockSurface entries — Near first, then Far.
     * The returned list is ordered so Near faces fill before Far faces across all boards:
     *   [board0.Near, board1.Near, board2.Near, board0.Far, board1.Far, board2.Far]
     *
     * This ordering is the default arc stocking strategy. A different strategy would
     * return these in a different order (or omit Far faces entirely for row layouts).
     */
    static buildStockSurfaces(
        shelfPosition: THREE.Vector3,
        shelfRotationY: number,
        boardSurfaces: ShelfSurface[],
        boxDimensions: GameBoxDimensions = { width: 0.3, height: 0.4, depth: 0.08 }
    ): StockSurface[] {
        const shelfAngleRad = (SHELF_ANGLE_DEGREES * Math.PI) / 180
        const gameHalfDepth = boxDimensions.depth / 2
        const hasRotation = Math.abs(shelfRotationY) > 1e-6
        const shelfQuat = hasRotation
            ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shelfRotationY)
            : null
        const slotStepLocal = new THREE.Vector3(GameLayoutConstants.GAME_SPACING, 0, 0)
        const slotStep = shelfQuat
            ? slotStepLocal.clone().applyQuaternion(shelfQuat)
            : slotStepLocal.clone()

        const buildSurface = (board: ShelfSurface, face: ShelfFace): StockSurface => {
            const angleOffset = board.topY * Math.tan(shelfAngleRad)
            const localZ = face === ShelfFace.Far
                ? board.frontZ + (gameHalfDepth * 3)
                : board.backZ  - (gameHalfDepth * 3)
            const localZWithAngle = localZ + (face === ShelfFace.Far ? angleOffset : -angleOffset)
            const gameY = shelfPosition.y + board.topY + boxDimensions.height / 2

            // Origin = leftmost slot, centered across the board width
            const startLocalX = board.centerX - ((GameLayoutConstants.GAMES_PER_SURFACE - 1) * GameLayoutConstants.GAME_SPACING) / 2
            const localOrigin = new THREE.Vector3(startLocalX, 0, localZWithAngle)
            const worldOrigin = shelfQuat
                ? new THREE.Vector3(
                    shelfPosition.x + localOrigin.clone().applyQuaternion(shelfQuat).x,
                    gameY,
                    shelfPosition.z + localOrigin.clone().applyQuaternion(shelfQuat).z
                  )
                : new THREE.Vector3(
                    shelfPosition.x + startLocalX,
                    gameY,
                    shelfPosition.z + localZWithAngle
                  )

            const farFlip = face === ShelfFace.Far ? Math.PI : 0
            const rotation = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                shelfRotationY + farFlip
            )

            return { originPosition: worldOrigin, rotation, slotStep, capacity: GameLayoutConstants.GAMES_PER_SURFACE }
        }

        const nearSurfaces = boardSurfaces.map(b => buildSurface(b, ShelfFace.Near))
        const farSurfaces  = boardSurfaces.map(b => buildSurface(b, ShelfFace.Far))
        return [...nearSurfaces, ...farSurfaces]
    }

    /**
     * Place games onto an ordered list of StockSurfaces, returning world-space intents.
     * Fills surfaces in order; stops when games or surfaces are exhausted.
     */
    static stockSurfaces(
        stockSurfaces: StockSurface[],
        games: SteamGameData[]
    ): Array<{ game: SteamGameData; position: THREE.Vector3; rotation: THREE.Quaternion }> {
        const intents: Array<{ game: SteamGameData; position: THREE.Vector3; rotation: THREE.Quaternion }> = []
        let gameIndex = 0

        for (const surface of stockSurfaces) {
            for (let slot = 0; slot < surface.capacity && gameIndex < games.length; slot++, gameIndex++) {
                const position = surface.originPosition.clone().addScaledVector(surface.slotStep, slot)
                intents.push({ game: games[gameIndex], position, rotation: surface.rotation })
            }
        }

        return intents
    }

    /**
     * Calculate world-space quaternion for a game box given shelf orientation and face.
     *
     * Convention: game box artwork is on the -Z face of the model.
     * Arc shelves have rotationY = atan2(x,z) + PI so their +Z side faces inward (toward player).
     *
     * ShelfFace is player-relative:
     *   Near (backZ = +0.5 local)  — inward-facing, player-visible. No extra rotation needed.
     *   Far  (frontZ = -0.5 local) — outward-facing, away from player. Flip by PI.
     *
     * Near: totalY = shelfRotationY         → -Z artwork face points inward → player sees it
     * Far:  totalY = shelfRotationY + PI    → -Z artwork face flipped to point outward
     */
    static calculateGameRotation(shelfRotationY: number, face: ShelfFace): THREE.Quaternion {
        const farFlip = face === ShelfFace.Far ? Math.PI : 0
        const totalY = shelfRotationY + farFlip
        return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), totalY)
    }
}