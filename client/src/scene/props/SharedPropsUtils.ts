/**
 * Store Props Shared Utilities
 * 
 * Common functionality shared between GPU and Legacy store props renderers.
 * Extracted to reduce duplication and ensure consistent behavior.
 */

import * as THREE from 'three'
import type { GameBoxTextureOptions } from '../game-box/types/GameBoxOptions'
import type { SteamGameData } from '../game-box/types/GameData'
import { RoomConstants } from '../RoomManager'

/**
 * Shelf side identifier for front/back differentiation
 */
export enum ShelfSide {
    Front = 'front',
    Back = 'back'
}

/**
 * Shelf configuration for both procedural and instanced rendering
 */
export interface ShelfConfig {
    width?: number
    height?: number
    depth?: number
    angle?: number
    shelfCount?: number
    boardThickness?: number
    shelfExtensionPerLevel?: number
}

/**
 * Default shelf configuration shared across all shelf rendering systems
 * 
 * Note: Values tuned for optimal VR viewing and physical realism:
 * - angle: Small angle (3-6°) prevents steep/unrealistic shelves
 * - depth: ~34-40cm provides game box stability
 * - shelfExtensionPerLevel: Lower shelves extend forward for better visibility
 */
export const DEFAULT_SHELF_CONFIG: Required<ShelfConfig> = {
    width: 2.0,
    height: 2.0,
    depth: 0.34,
    angle: 3,
    shelfCount: 3,
    boardThickness: 0.05,
    shelfExtensionPerLevel: 0.25
} as const

/**
 * Configuration constants for game layout - shared between renderers
 */
export class GameLayoutConstants {
    static readonly GAMES_PER_SURFACE = 3 // Games per shelf surface (front/back of each shelf level)
    static readonly SURFACES_PER_SHELF = 6 // 3 shelf levels × 2 sides (front/back) = 6 surfaces per shelf unit
}

/**
 * Game placement constants for consistent positioning across renderers
 */
export class GamePlacementConstants {
    static readonly Z_OFFSET = 0.03       // 3cm from shelf surface (game depth 10cm, so front/back faces sit close to shelf edge)
    static readonly Y_OFFSET = 0.005      // 5mm above shelf surface  
    static readonly GAME_HEIGHT = 0.4     // 40cm height
    static readonly GAME_SPACING = 0.55   // 35cm spacing between games
}

/**
 * Artwork and texture processing utilities
 */
export class ArtworkUtils {
    /**
     * Create texture options from an image blob for game box artwork
     * Shared between GPU and Legacy renderers
     */
    static async createTextureOptionsFromBlob(blob: Blob, gameName: string): Promise<GameBoxTextureOptions> {
        return new Promise((resolve, reject) => {
            const img = document.createElement('img') as HTMLImageElement
            img.onload = () => {
                try {
                    // Create a canvas to convert the image to a texture
                    const canvas = document.createElement('canvas')
                    const ctx = canvas.getContext('2d')
                    
                    if (!ctx) {
                        console.error(`❌ Could not create canvas context for ${gameName}`)
                        reject(new Error('Could not create canvas context'))
                        return
                    }
                    
                    // Set canvas size to image dimensions (with reasonable limits for memory)
                    const maxSize = 512 // Limit texture size for memory management
                    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
                    canvas.width = Math.floor(img.width * scale)
                    canvas.height = Math.floor(img.height * scale)
                    
                    // Draw the image onto the canvas
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                    
                    // Create texture from canvas
                    const texture = new THREE.CanvasTexture(canvas)
                    texture.needsUpdate = true
                    
                    // Return GameBoxTextureOptions with artwork blob
                    resolve({
                        artworkBlobs: {
                            'header': blob
                        },
                        preferredArtworkType: 'header'
                    })
                    
                    // Clean up
                    URL.revokeObjectURL(img.src)
                } catch (error) {
                    console.error(`❌ Error processing image for ${gameName}:`, error)
                    reject(error)
                    URL.revokeObjectURL(img.src)
                }
            }
            
            img.onerror = (event) => {
                console.error(`❌ Failed to load image for ${gameName}:`, event)
                reject(new Error(`Failed to load image for ${gameName}`))
                URL.revokeObjectURL(img.src)
            }
            
            // Convert blob to object URL for image loading
            const objectUrl = URL.createObjectURL(blob)
            img.src = objectUrl
        })
    }
}

/**
 * VR layout and positioning utilities
 */
export class VRLayoutUtils {
    /**
     * Calculate optimal shelf spacing for VR comfort and navigation
     * Shared VR-optimized layout calculations
     */
    static calculateOptimalShelfSpacing(shelfCount: number): number {
        // Base spacing considerations for VR:
        // - Minimum 2.2m for comfortable navigation (VR_ERGONOMICS.COMFORTABLE_AISLE_WIDTH)
        // - Extra space for larger libraries to avoid crowding
        // - Scale down slightly for very wide stores to fit in reasonable space
        
        const baseSpacing = RoomConstants.SHELF_SPACING_X // 2.5m default
        const minSpacing = 2.0 // Minimum comfortable spacing
        const maxSpacing = 3.5 // Maximum to avoid feeling empty
        
        // For more shelves, use base spacing
        // For fewer shelves, can space them out more for better navigation
        if (shelfCount <= 2) {
            return Math.min(maxSpacing, baseSpacing * 1.2) // More spacious for small stores
        } else if (shelfCount >= 6) {
            return Math.max(minSpacing, baseSpacing * 0.9) // Tighter for large stores
        } else {
            return baseSpacing // Standard spacing for medium stores
        }
    }

    /**
     * Calculate optimal row position for VR navigation and comfort
     * VR depth positioning optimization - positions relative to entrance
     */
    static calculateOptimalRowPosition(rowIndex: number): number {
        // VR depth positioning considerations:
        // - Player starts at entrance (positive Z)
        // - First row should be easily accessible from entrance
        // - Progressive depth moving toward back of store (negative Z)
        // - Avoid rows being too far back (VR discomfort)
        
        const entranceZPosition = 3 // Player/entrance is at positive Z
        const firstRowOffset = -2 // First row is 2m into the store from entrance
        const baseRowSpacing = RoomConstants.SHELF_SPACING_Z // 3m between rows
        const maxDepth = -12 // Don't place shelves beyond this depth from entrance
        
        // Calculate position relative to entrance
        let rowZ = entranceZPosition + firstRowOffset - (rowIndex * baseRowSpacing)
        
        // For very deep stores, compress the spacing slightly to keep everything accessible
        const absoluteMaxDepth = entranceZPosition + maxDepth
        if (rowZ < absoluteMaxDepth) {
            // Compress spacing for deep rows to keep them accessible
            const compressionFactor = 0.8
            rowZ = entranceZPosition + firstRowOffset - (rowIndex * baseRowSpacing * compressionFactor)
        }
        
        return Math.max(rowZ, absoluteMaxDepth) // Never go deeper than maxDepth from entrance
    }
}

/**
 * Shared surface interface for both renderers
 */
export interface ShelfSurface {
    topY: number
    frontZ: number
    backZ: number
    centerX: number
    width: number
}

/**
 * Shelf surface detection utilities shared between renderers
 */
export class ShelfSurfaceUtils {
    /**
     * Find shelf surfaces - unified approach for both GPU and Legacy renderers
     * GPU version uses hardcoded standard shelf dimensions
     * Legacy version traverses geometry but should match the same structure
     */
    static findShelfSurfaces(shelfUnit: THREE.Group | null, useHardcodedSurfaces: boolean = false, shelfPosition?: THREE.Vector3): ShelfSurface[] {
        if (useHardcodedSurfaces || !shelfUnit) {
            // GPU renderer path: use standard shelf dimensions
            return ShelfSurfaceUtils.getStandardShelfSurfaces()
        }
        
        // Legacy renderer path: traverse geometry to find surfaces
        return ShelfSurfaceUtils.findDynamicShelfSurfaces(shelfUnit, shelfPosition)
    }
    
    /**
     * Get standard shelf surface configuration (used by GPU renderer)
     * These values must match the actual shelf positioning in InstancedShelfRenderer.setInstance()
     * Default config: height=2.0, shelfCount=3, boardThickness=0.05
     * shelfSpacing = height / (shelfCount + 1) = 2.0 / 4 = 0.5
     * Interior surface Y = shelfY + boardThickness * 0.55
     */
    private static getStandardShelfSurfaces(): ShelfSurface[] {
        return [
            { topY: 0.5275, frontZ: -0.5, backZ: 0.5, centerX: 0, width: 2.0 },  // Bottom shelf: 0.5 + 0.05*0.55
            { topY: 1.0275, frontZ: -0.5, backZ: 0.5, centerX: 0, width: 2.0 },  // Middle shelf: 1.0 + 0.05*0.55  
            { topY: 1.5275, frontZ: -0.5, backZ: 0.5, centerX: 0, width: 2.0 }   // Top shelf: 1.5 + 0.05*0.55
        ]
    }
    
    /**
     * Find shelf surfaces by traversing geometry (used by Legacy renderer)
     */
    private static findDynamicShelfSurfaces(shelfUnit: THREE.Group, shelfPosition?: THREE.Vector3): ShelfSurface[] {
        const surfaces: ShelfSurface[] = []
        
        shelfUnit.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
                const box = new THREE.Box3().setFromObject(child)
                const size = box.getSize(new THREE.Vector3())
                
                // Look for horizontal surfaces (wide, thin, reasonable depth)
                if (size.x > 1.5 && size.y < 0.1 && size.z > 0.3) {
                    // Make topY relative to shelf position if provided
                    const relativeTopY = shelfPosition ? box.max.y - shelfPosition.y : box.max.y
                    
                    surfaces.push({
                        topY: relativeTopY,
                        frontZ: box.min.z,
                        backZ: box.max.z,
                        centerX: (box.min.x + box.max.x) / 2,
                        width: size.x
                    })
                }
            }
        })
        
        // Simple deduplication and sorting
        const uniqueSurfaces = surfaces.filter((surface, index, array) => {
            return index === 0 || Math.abs(surface.topY - array[index - 1].topY) > 0.02
        })
        
        return uniqueSurfaces.sort((a, b) => a.topY - b.topY)
    }
}

/**
 * Interface for image manager to avoid circular dependencies
 */
interface ImageDownloader {
    downloadImage(url: string, options: {
        timeout: number
        enableFallback: boolean
        onImageLoaded: (url: string, blob: Blob) => void
        onImageError: (url: string, error: Error) => void
    }): Promise<Blob | null>
}

/**
 * Game box creation utilities shared between renderers
 */
export class GameBoxUtils {
    /**
     * Generate consistent game box name across renderers
     */
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
        
        // Calculate Z position to follow the angled face of the shelf
        // Shelf has 3-degree angle, so games should follow the angled face
        const shelfAngleDegrees = 6
        const shelfAngleRad = (shelfAngleDegrees * Math.PI) / 180
        
        // Calculate how far along the angled face this shelf level is
        // Higher shelves (larger surface.topY) should be further inward due to the taper
        const heightFromBottom = surface.topY
        const angleOffset = heightFromBottom * Math.tan(shelfAngleRad)
        
        const gameHalfDepth = 0.05  // Half of game depth (0.1) - TRY: 0.03, 0.07, 0.1
        
        const baseZ = shelfPosition.z + (side === ShelfSide.Front 
            ? surface.frontZ + (gameHalfDepth * 3)  // Front: surface.frontZ = -0.5
            : surface.backZ - (gameHalfDepth * 3) )  // Back: surface.backZ = +0.5
        
        // Apply angle offset: front games move inward as they go up, back games move inward as they go up
        const gameZ = baseZ + (side === ShelfSide.Front ? angleOffset : -angleOffset)
                
        // Center the games on the shelf
        const totalWidth = (games.length - 1) * GamePlacementConstants.GAME_SPACING
        const startX = shelfPosition.x + surface.centerX - totalWidth / 2
        
        for (let i = 0; i < games.length; i++) {
            const gameX = startX + (i * GamePlacementConstants.GAME_SPACING)
            positions.push(new THREE.Vector3(gameX, gameY, gameZ))
        }
        
        return positions
    }

    /**
     * Load artwork for game if needed (shared between renderers)
     */
    static async loadArtworkIfNeeded(
        game: SteamGameData, 
        globalGameIndex: number, 
        imageManager: ImageDownloader
    ): Promise<unknown> {
        const shouldUseArtwork = (globalGameIndex % 10) === 0
        if (!shouldUseArtwork || !game.artwork?.header) {
            return undefined
        }

        try {
            const imageBlob = await imageManager.downloadImage(game.artwork.header, {
                timeout: 5000,
                enableFallback: true,
                onImageLoaded: (_url: string, _blob: Blob) => {
                    // Successfully loaded artwork
                },
                onImageError: (url: string, error: Error) => {
                    console.error(`❌ Failed to download artwork from ${url} for ${game.name}:`, error.message)
                }
            })
            
            if (imageBlob) {
                return await ArtworkUtils.createTextureOptionsFromBlob(imageBlob, game.name)
            } else {
                console.warn(`⚠️ No artwork blob received for ${game.name} - falling back to text label`)
                return undefined
            }
        } catch (error) {
            console.error(`❌ Exception while loading artwork for ${game.name}:`, error)
            return undefined
        }
    }
}