import * as THREE from 'three'
import { StickerManager } from '../stickers/StickerManager'
import { ShelfStickerIntegration } from '../stickers/ShelfStickerIntegration'
import { ShelfUnitIndexSystem } from '../stickers/ShelfUnitIndexSystem'
import { ShelfStickerHandler } from '../stickers/ShelfStickerHandler'
import { EventManager } from '../../core/EventManager'
import { GameEventTypes } from '../../types/InteractionEvents'
import type { InstancedMeshManager } from './InstancedMeshManager'

export interface StickerAdapterConfig {
    maxStickersPerSideboard?: number
}

interface ShelfUnitInstance {
    position: unknown
    config: unknown
    instanceIndices: unknown
}

/**
 * Adapter that manages all sticker-related concerns for instanced shelf rendering.
 * Separates sticker logic from core shelf rendering logic.
 */
export class InstancedShelfStickerAdapter {
    private readonly stickerHandler: ShelfStickerHandler
    readonly maxStickersPerSideboard: number
    
    constructor(config: StickerAdapterConfig = {}) {
        // Reduced to 3 to stay within WebGL attribute limits
        // 3 stickers * 2 vec4 attributes = 6 custom attributes
        // Combined with Three.js MeshStandardMaterial built-ins (~10 attributes) = 16 total
        this.maxStickersPerSideboard = config.maxStickersPerSideboard ?? 3
        
        // Initialize sticker system (macro texture mode - no sticker limits)
        const stickerManager = new StickerManager()
        const stickerIntegration = new ShelfStickerIntegration({
            stickerManager
        })
        const indexSystem = new ShelfUnitIndexSystem(stickerManager)
        
        this.stickerHandler = new ShelfStickerHandler({
            stickerManager,
            stickerIntegration,
            indexSystem
        })
        
        // Register event listener for populating stickers after GPU batch completes
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.InstancedBatchComplete,
            this.populateStickersAfterGeneration.bind(this)
        )
    }
    
    public setManagers(sideBoardManager: InstancedMeshManager, shelfUnits: Map<number, ShelfUnitInstance>): void {
        this.stickerHandler.setManagers(sideBoardManager, shelfUnits)
    }
    
    public setupMaterial(material: THREE.MeshStandardMaterial): void {
        this.stickerHandler.getStickerIntegration().setupStickerMaterial(material)
    }
    
    public setupInstanceAttributes(sideBoardManager: InstancedMeshManager): void {
        this.stickerHandler.getStickerIntegration().setupInstanceAttributes(sideBoardManager)
    }
    
    public initializeSideboardStickers(
        meshManager: InstancedMeshManager,
        boardIndex: number,
        shelfUnitIndex: number,
        isLeftBoard: boolean
    ): void {
        this.stickerHandler.initializeSideboardStickers(
            meshManager,
            boardIndex,
            shelfUnitIndex,
            isLeftBoard
        )
    }
    
    public populateStickersAfterGeneration(): void {
        this.stickerHandler.populateStickersAfterGeneration()
    }
    
    public getStickerManager(): StickerManager {
        return this.stickerHandler.getStickerManager()
    }
}
