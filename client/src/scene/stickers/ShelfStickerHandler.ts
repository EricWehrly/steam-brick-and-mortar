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

import { EventManager } from '../../core/EventManager'
import { StorePropsEventTypes, GameEventTypes } from '../../types/InteractionEvents'
import { StickerManager } from './StickerManager'
import { ShelfStickerIntegration } from './ShelfStickerIntegration'
import { ShelfUnitIndexSystem } from './ShelfUnitIndexSystem'
import type { InstancedMeshManager } from '../instancing/InstancedMeshManager'

// Toggle verbose sticker-system debug logging in this module
const STICKERS_DEBUG = false

/**
 * Feature flag: Enable sticker rendering on shelf sideboards
 * Default OFF for dev mode to reduce startup time and measure GPU impact
 */
const STICKERS_ENABLED = false

interface ShelfUnitInstance {
    position: unknown
    config: unknown
    instanceIndices: unknown
}

export class ShelfStickerHandler {
    private stickerManager: StickerManager | null = null
    private stickerIntegration: ShelfStickerIntegration | null = null
    private indexSystem: ShelfUnitIndexSystem | null = null
    private sideBoardManager?: InstancedMeshManager
    private shelfUnits?: Map<number, ShelfUnitInstance>
    
    constructor() {
        if (!STICKERS_ENABLED) {
            if (STICKERS_DEBUG) console.debug('🎨 Stickers DISABLED - skipping initialization')
            return
        }
        
        // Initialize sticker system (macro texture mode - no sticker limits)
        this.stickerManager = new StickerManager()
        this.stickerIntegration = new ShelfStickerIntegration({
            stickerManager: this.stickerManager
        })
        this.indexSystem = new ShelfUnitIndexSystem(this.stickerManager)
        this.registerEventListeners()
    }
    
    public setManagers(sideBoardManager: InstancedMeshManager, shelfUnits: Map<number, ShelfUnitInstance>): void {
        this.sideBoardManager = sideBoardManager
        this.shelfUnits = shelfUnits
    }
    
    private registerEventListeners(): void {
        // Populate stickers after GPU batch completes
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.InstancedBatchComplete,
            this.populateStickersAfterGeneration.bind(this)
        )
        
        // Handle shelf index visibility toggles
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.EnableShelfIndices,
            () => {
                if (this.sideBoardManager && this.shelfUnits) {
                    this.enableIndices(this.sideBoardManager, this.shelfUnits)
                }
            }
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.DisableShelfIndices,
            () => {
                if (this.sideBoardManager && this.shelfUnits) {
                    this.disableIndices(this.sideBoardManager, this.shelfUnits)
                }
            }
        )
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
        if (!STICKERS_ENABLED || !this.stickerIntegration || !this.indexSystem) return
        
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
     * Populate stickers after shelf generation completes
     * Called via event handler after GPU update
     */
    public populateStickersAfterGeneration(): void {
        if (!STICKERS_ENABLED) return
        if (!this.sideBoardManager || !this.shelfUnits) return
        this.populateRandomStickers(this.sideBoardManager, this.shelfUnits.size, 0.3)
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
        density: number = 0.8
    ): void {
        if (!STICKERS_ENABLED || !this.stickerIntegration) return
        
        // Populate with random stickers on left side boards only
        // Left boards are at even indices: 0, 2, 4, 6, ... (boardIndex = shelfUnitIndex * 2)
        this.stickerIntegration.populateAndRefresh(
            meshManager,
            totalShelfUnits,
            (shelfUnitIndex: number) => shelfUnitIndex * 2,  // Left sideboard tile IDs: 0, 2, 4, 6, ...
            density
        )
    }
    
    /**
     * Enable shelf unit index display
     */
    public enableIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        if (!STICKERS_ENABLED || !this.indexSystem) return
        this.indexSystem.enable()
        this.refreshAllIndices(meshManager, shelfUnits)
        if (STICKERS_DEBUG) console.debug('🔍 Shelf unit indices enabled')
    }
    
    /**
     * Disable shelf unit index display
     */
    public disableIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        if (!STICKERS_ENABLED || !this.indexSystem) return
        this.indexSystem.disable()
        this.refreshAllIndices(meshManager, shelfUnits)
        if (STICKERS_DEBUG) console.debug('🔍 Shelf unit indices disabled')
    }
    
    /**
     * Toggle shelf unit index display
     */
    public toggleIndices(
        meshManager: InstancedMeshManager,
        shelfUnits: Map<number, unknown>
    ): void {
        if (!STICKERS_ENABLED || !this.indexSystem) return
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
        if (!this.stickerManager || !this.stickerIntegration || !this.indexSystem) return
        
        let sideboardIndex = 0
        shelfUnits.forEach((_unit, shelfUnitIndex) => {
            const leftBoardIndex = sideboardIndex
            const leftTileId = leftBoardIndex  // Use boardIndex directly as tile ID
            
            // Clear existing stickers for this shelf (including indices)
            this.stickerManager!.clearShelf(leftTileId)
            
            // Re-add indices if enabled
            if (this.indexSystem!.isEnabled()) {
                this.indexSystem!.addIndexToSideboard(shelfUnitIndex, leftTileId)
            }
            
            // Update surface (will re-render whatever stickers are in the manager)
            this.stickerIntegration!.updateSurfaceStickers(meshManager, leftBoardIndex, leftTileId)
            
            sideboardIndex += 2  // Skip right board
        })
        
        // Update macro texture with all changes
        this.stickerIntegration.getMacroTexture().updateTexture()
        
        meshManager.updateGPU()
        if (STICKERS_DEBUG) console.debug(`🔍 Refreshed indices for ${shelfUnits.size} shelf units`)
    }
    
    /**
     * Get the sticker manager for runtime operations
     * Returns null when stickers are disabled
     */
    public getStickerManager(): StickerManager | null {
        return this.stickerManager
    }
    
    /**
     * Get the sticker integration for material setup
     * Returns null when stickers are disabled
     */
    public getStickerIntegration(): ShelfStickerIntegration | null {
        return this.stickerIntegration
    }
}
