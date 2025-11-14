/**
 * Shelf Sticker Handler - Manages sticker lifecycle for shelf rendering
 * 
 * Coordinates between:
 * - StickerManager (data/placement logic)
 * - ShelfStickerIntegration (shader/GPU attributes)
 * - ShelfUnitIndexSystem (numeric indices)
 * - InstancedMeshManager (sideboard rendering)
 * 
 * Extracted from InstancedShelfRenderer to separate concerns and reduce class complexity.
 */

import type { StickerManager } from './StickerManager'
import type { ShelfStickerIntegration } from './ShelfStickerIntegration'
import type { ShelfUnitIndexSystem } from './ShelfUnitIndexSystem'
import type { InstancedMeshManager } from '../instancing/InstancedMeshManager'

export interface ShelfStickerHandlerConfig {
    stickerManager: StickerManager
    stickerIntegration: ShelfStickerIntegration
    indexSystem: ShelfUnitIndexSystem
}

export class ShelfStickerHandler {
    private stickerManager: StickerManager
    private stickerIntegration: ShelfStickerIntegration
    private indexSystem: ShelfUnitIndexSystem
    
    constructor(config: ShelfStickerHandlerConfig) {
        this.stickerManager = config.stickerManager
        this.stickerIntegration = config.stickerIntegration
        this.indexSystem = config.indexSystem
    }
    
    /**
     * Initialize sticker data for a sideboard surface
     * Called when creating left/right sideboards for a shelf unit
     * 
     * Macro texture mode: Use boardIndex directly as shelfId (0-255)
     * This maps each sideboard to a unique tile in the texture atlas
     */
    public initializeSideboardStickers(
        meshManager: InstancedMeshManager,
        boardIndex: number,
        shelfUnitIndex: number,
        isLeftBoard: boolean
    ): void {
        // Use boardIndex directly - it's already sequential (0, 1, 2, 3, ...)
        // Each sideboard gets its own tile in the macro texture
        const tileId = boardIndex
        
        this.stickerIntegration.updateSurfaceStickers(meshManager, boardIndex, tileId)
        
        // Add index to left board if system is enabled
        if (isLeftBoard && this.indexSystem.isEnabled()) {
            this.indexSystem.addIndexToSideboard(shelfUnitIndex, tileId)
            // Refresh after adding index
            this.stickerIntegration.updateSurfaceStickers(meshManager, boardIndex, tileId)
        }
    }
    
    /**
     * Populate random stickers after shelf generation
     * Called via event handler after GPU update
     * 
     * Macro texture mode: Each left sideboard gets sequential tile IDs (0, 2, 4, 6, ...)
     * since left boards are at even indices (0=left, 1=right, 2=left, 3=right, ...)
     */
    public populateRandomStickers(
        meshManager: InstancedMeshManager,
        totalShelfUnits: number,
        density: number = 0.3
    ): void {
        console.log(`🎨 populateRandomStickers: ${totalShelfUnits} shelf units at ${density * 100}% density`)
        
        // Populate with random stickers on left side boards only
        // Left boards are at even indices: 0, 2, 4, 6, ... (boardIndex = shelfUnitIndex * 2)
        this.stickerIntegration.populateAndRefresh(
            meshManager,
            totalShelfUnits,
            (shelfUnitIndex: number) => shelfUnitIndex * 2,  // Left sideboard tile IDs: 0, 2, 4, 6, ...
            density
        )
        
        console.log(`🎨 [STICKER DEBUG] Updated GPU with sticker data`)
    }
    
    /**
     * Enable shelf unit index display
     */
    public enableIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        this.indexSystem.enable()
        this.refreshAllIndices(meshManager, shelfUnits)
        console.debug('🔍 Shelf unit indices enabled')
    }
    
    /**
     * Disable shelf unit index display
     */
    public disableIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        this.indexSystem.disable()
        this.refreshAllIndices(meshManager, shelfUnits)
        console.debug('🔍 Shelf unit indices disabled')
    }
    
    /**
     * Toggle shelf unit index display
     */
    public toggleIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        this.indexSystem.toggle()
        this.refreshAllIndices(meshManager, shelfUnits)
    }
    
    /**
     * Refresh indices for all shelf units
     * Macro texture mode: Use boardIndex as tileId
     */
    private refreshAllIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        let sideboardIndex = 0
        shelfUnits.forEach((_unit, shelfUnitIndex) => {
            const leftBoardIndex = sideboardIndex
            const leftTileId = leftBoardIndex  // Use boardIndex directly as tile ID
            
            // Clear existing stickers for this shelf (including indices)
            this.stickerManager.clearShelf(leftTileId)
            
            // Re-add indices if enabled
            if (this.indexSystem.isEnabled()) {
                this.indexSystem.addIndexToSideboard(shelfUnitIndex, leftTileId)
            }
            
            // Update surface (will re-render whatever stickers are in the manager)
            this.stickerIntegration.updateSurfaceStickers(meshManager, leftBoardIndex, leftTileId)
            
            sideboardIndex += 2  // Skip right board
        })
        
        // Update macro texture with all changes
        this.stickerIntegration.getMacroTexture().updateTexture()
        
        meshManager.updateGPU()
        console.debug(`🔍 Refreshed indices for ${shelfUnits.size} shelf units`)
    }
    
    /**
     * Get the sticker manager for runtime operations
     */
    public getStickerManager(): StickerManager {
        return this.stickerManager
    }
    
    /**
     * Get the sticker integration for material setup
     */
    public getStickerIntegration(): ShelfStickerIntegration {
        return this.stickerIntegration
    }
}
