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
     */
    public initializeSideboardStickers(
        meshManager: InstancedMeshManager,
        boardIndex: number,
        shelfUnitIndex: number,
        isLeftBoard: boolean
    ): void {
        const surfaceId = shelfUnitIndex * 1000 + (isLeftBoard ? 0 : 1)
        this.stickerIntegration.updateSurfaceStickers(meshManager, boardIndex, surfaceId)
        
        // Add index to left board if system is enabled
        if (isLeftBoard && this.indexSystem.isEnabled()) {
            this.indexSystem.addIndexToSideboard(shelfUnitIndex, surfaceId)
            // Refresh after adding index
            this.stickerIntegration.updateSurfaceStickers(meshManager, boardIndex, surfaceId)
        }
    }
    
    /**
     * Populate random stickers after shelf generation
     * Called via event handler after GPU update
     */
    public populateRandomStickers(
        meshManager: InstancedMeshManager,
        totalShelfUnits: number,
        density: number = 0.3
    ): void {
        console.log(`🎨 [STICKER DEBUG] populateRandomStickers: ${totalShelfUnits} shelf units at ${density * 100}% density`)
        
        // Populate with random stickers on left side boards
        this.stickerIntegration.populateAndRefresh(
            meshManager,
            totalShelfUnits,
            (index: number) => index * 1000,  // Left sideboard surface IDs: 0, 1000, 2000, etc.
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
     */
    private refreshAllIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        let sideboardIndex = 0
        shelfUnits.forEach((_unit, shelfUnitIndex) => {
            const leftBoardIndex = sideboardIndex
            const leftSurfaceId = shelfUnitIndex * 1000
            
            // Clear and re-add stickers (including index if enabled)
            if (this.indexSystem.isEnabled()) {
                this.indexSystem.addIndexToSideboard(shelfUnitIndex, leftSurfaceId)
            }
            this.stickerIntegration.updateSurfaceStickers(meshManager, leftBoardIndex, leftSurfaceId)
            
            sideboardIndex += 2  // Skip right board
        })
        
        meshManager.updateGPU()
        console.debug(`🔍 Refreshed indices for ${shelfUnits.size} shelf units`)
    }
    
    /**
     * Get the sticker manager for runtime operations
     */
    public getStickerManager(): StickerManager {
        return this.stickerManager
    }
}
