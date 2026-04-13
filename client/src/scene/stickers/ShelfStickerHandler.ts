// TD: sticker-coordinator
/**
 * Shelf Sticker Handler - Manages sticker lifecycle for shelf rendering
 * 
 * TD: sticker-coordinator
 * This class is a candidate for dissolution into a StickerCoordinator that
 * self-subscribes to StickerSurfaceReady events (emitted per sideboard instance)
 * rather than receiving mesh managers via setManagers(). See tech-debt.md.
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
import { AppSettings, Setting } from '../../core/AppSettings'
import type { InstancedMeshManager } from '../instancing/InstancedMeshManager'

// Toggle verbose sticker-system debug logging in this module
const STICKERS_DEBUG = false

export class ShelfStickerHandler {
    private stickerManager: StickerManager | null = null
    private stickerIntegration: ShelfStickerIntegration | null = null
    private indexSystem: ShelfUnitIndexSystem | null = null
    private sideBoardManager?: InstancedMeshManager
    private shelfUnitCount: number = 0
    
    private isStickersEnabled(): boolean {
        return AppSettings.get(Setting.EnableStickers)
    }
    
    constructor() {
        if (!this.isStickersEnabled()) {
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
    
    public setManagers(sideBoardManager: InstancedMeshManager, shelfUnitCount: number): void {
        this.sideBoardManager = sideBoardManager
        this.shelfUnitCount = shelfUnitCount
    }
    
    private registerEventListeners(): void {
        // Populate stickers after GPU batch completes
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.populateStickersAfterGeneration.bind(this)
        )
        
        // Handle shelf index visibility toggles
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.EnableShelfIndices,
            () => {
                if (this.sideBoardManager) {
                    this.enableIndices(this.sideBoardManager, this.shelfUnitCount)
                }
            }
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.DisableShelfIndices,
            () => {
                if (this.sideBoardManager) {
                    this.disableIndices(this.sideBoardManager, this.shelfUnitCount)
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
        if (!this.isStickersEnabled() || !this.stickerIntegration || !this.indexSystem) return
        
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
        if (!this.isStickersEnabled()) return
        if (!this.sideBoardManager) return
        this.populateRandomStickers(this.sideBoardManager, this.shelfUnitCount, 0.3)
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
        if (!this.isStickersEnabled() || !this.stickerIntegration) return
        
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
        shelfUnitCount: number
    ): void {
        if (!this.isStickersEnabled() || !this.indexSystem) return
        this.indexSystem.enable()
        this.refreshAllIndices(meshManager, shelfUnitCount)
        if (STICKERS_DEBUG) console.debug('🔍 Shelf unit indices enabled')
    }
    
    /**
     * Disable shelf unit index display
     */
    public disableIndices(
        meshManager: InstancedMeshManager,
        shelfUnitCount: number
    ): void {
        if (!this.isStickersEnabled() || !this.indexSystem) return
        this.indexSystem.disable()
        this.refreshAllIndices(meshManager, shelfUnitCount)
        if (STICKERS_DEBUG) console.debug('🔍 Shelf unit indices disabled')
    }
    
    /**
     * Toggle shelf unit index display
     */
    public toggleIndices(
        meshManager: InstancedMeshManager,
        shelfUnitCount: number
    ): void {
        if (!this.isStickersEnabled() || !this.indexSystem) return
        this.indexSystem.toggle()
        this.refreshAllIndices(meshManager, shelfUnitCount)
    }
    
    /**
     * Refresh indices for all shelf units
     * Macro texture mode: left board for shelf N is at boardIndex N*2
     */
    private refreshAllIndices(
        meshManager: InstancedMeshManager,
        shelfUnitCount: number
    ): void {
        if (!this.stickerManager || !this.stickerIntegration || !this.indexSystem) return
        
        for (let shelfUnitIndex = 0; shelfUnitIndex < shelfUnitCount; shelfUnitIndex++) {
            const leftBoardIndex = shelfUnitIndex * 2
            const leftTileId = leftBoardIndex

            this.stickerManager!.clearShelf(leftTileId)

            if (this.indexSystem!.isEnabled()) {
                this.indexSystem!.addIndexToSideboard(shelfUnitIndex, leftTileId)
            }

            this.stickerIntegration!.updateSurfaceStickers(meshManager, leftBoardIndex, leftTileId)
        }

        this.stickerIntegration.getMacroTexture().updateTexture()
        meshManager.updateGPU()
        if (STICKERS_DEBUG) console.debug(`🔍 Refreshed indices for ${shelfUnitCount} shelf units`)
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
