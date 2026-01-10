/**
 * LOD Texture Array Manager
 * 
 * Manages the creation and population of texture arrays for LOD rendering.
 * This class owns the texture arrays and handles:
 * - Creating DataArrayTextures at appropriate resolutions
 * - Copying pixel data into texture array slots
 * - Tracking pending GPU updates per-layer
 * - Flushing changed layers to GPU efficiently
 * 
 * Decoupled from:
 * - URL fetching (handled by upstream texture loading)
 * - Rendering (handled by LodGameArtworkRenderer)
 */

import * as THREE from 'three'
import { Logger } from '../../../utils/Logger'
import { DataManager } from '../../../core/data/DataManager'
import { LOD_TIER_NAME } from './ILodArtworkRenderer'

// Class-scoped logger will be added inside the class

/** Configuration for a single LOD tier */
export interface LodTierConfig {
    name: string
    width: number
    height: number
    maxDepth: number  // How many texture slots in this array
}

/** Configuration for the texture array manager */
export interface LodTextureArrayManagerConfig {
    tiers: LodTierConfig[]
}

/** State for a single LOD texture array */
interface TextureArrayState {
    config: LodTierConfig
    dataArrayTexture: THREE.DataArrayTexture
    pendingUpdates: Set<number>  // Layer indices that need GPU update
}

/**
 * Manages LOD texture arrays - creation, population, and GPU updates.
 */
export class LodTextureArrayManager {
    public static logger = Logger.createLogFunctions(LodTextureArrayManager.name)
    private tiers: Map<string, TextureArrayState> = new Map()
    private nextSlotIndex: number = 0
    private atlasFullLogged: boolean = false
    
    constructor(config: LodTextureArrayManagerConfig) {
        this.initializeTextureArrays(config.tiers)
    }
    
    private initializeTextureArrays(tierConfigs: LodTierConfig[]): void {
        let totalVRAM = 0
        const tierInfo: string[] = []
        const dataManager = DataManager.getInstance()
        
        for (const tierConfig of tierConfigs) {
            const { name, width, height, maxDepth } = tierConfig
            
            // Create backing data
            const data = new Uint8Array(width * height * maxDepth * 4)
            
            // Create DataArrayTexture
            const texture = new THREE.DataArrayTexture(data, width, height, maxDepth)
            texture.format = THREE.RGBAFormat
            texture.type = THREE.UnsignedByteType
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            texture.needsUpdate = true
            
            this.tiers.set(name, {
                config: tierConfig,
                dataArrayTexture: texture,
                pendingUpdates: new Set()
            })
            
            // Track VRAM
            const vram = width * height * maxDepth * 4
            totalVRAM += vram
            tierInfo.push(`${name}: ${maxDepth} slots × ${width}×${height}px = ${(vram / (1024 * 1024)).toFixed(1)}MB`)
            
            // Register memory consumption
            const vramMB = Math.round(vram / (1024 * 1024))
            dataManager.addMemoryConsumption(`LOD/${name}`, vramMB)
            
            LodTextureArrayManager.logger.debug(`Created texture array: ${name} (${width}×${height}×${maxDepth})`)
        }
        
        LodTextureArrayManager.logger.lifecycle(`LOD VRAM: ${tierInfo.join(', ')} | Total: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }
    
    /**
     * Allocate the next available slot index.
     * Returns -1 if the MID tier is full.
     * 
     * Note: We use the MID tier's depth as the limit because:
     * - MID is the "base" tier that holds all game textures
     * - HIGH tier is a separate LRU cache managed by HighTextureCache
     * - The slot index maps games to their MID texture, HIGH is loaded on-demand
     */
    public allocateSlot(): number {
        // Use MID tier depth as the limit (it's the base tier for all games)
        const midTier = this.tiers.get(LOD_TIER_NAME.MID)
        if (!midTier) {
            LodTextureArrayManager.logger.error('MID tier not found - texture manager misconfigured')
            return -1
        }
        
        const maxSlots = midTier.config.maxDepth
        
        if (this.nextSlotIndex >= maxSlots) {
            if (!this.atlasFullLogged) {
                LodTextureArrayManager.logger.warn(`MID texture atlas full (${maxSlots} slots) - no more games can be added`)
                this.atlasFullLogged = true
            }
            return -1
        }
        
        return this.nextSlotIndex++
    }
    
    /**
     * Get the current slot count (next index to be allocated).
     */
    public getSlotCount(): number {
        return this.nextSlotIndex
    }
    
    /**
     * Copy pixel data into a specific tier and slot.
     */
    public setSlotPixels(
        tierName: string,
        slotIndex: number,
        pixelData: Uint8ClampedArray,
        expectedWidth?: number,
        expectedHeight?: number
    ): boolean {        
        const tier = this.tiers.get(tierName)
        if (!tier) {
            LodTextureArrayManager.logger.error(`Unknown tier: ${tierName}`)
            return false
        }
        
        const { width, height, maxDepth } = tier.config
        
        if (slotIndex < 0 || slotIndex >= maxDepth) {
            LodTextureArrayManager.logger.error(`Slot index ${slotIndex} out of range for tier ${tierName} (max: ${maxDepth})`)
            return false
        }
        
        const expectedSize = width * height * 4
        if (pixelData.length !== expectedSize) {
            LodTextureArrayManager.logger.error(`Pixel data size mismatch for ${tierName}[${slotIndex}]: expected ${expectedSize}, got ${pixelData.length}`)
            return false
        }
        
        // Validate dimensions if provided
        if (expectedWidth !== undefined && expectedHeight !== undefined) {
            if (expectedWidth !== width || expectedHeight !== height) {
                LodTextureArrayManager.logger.warn(`Dimension mismatch for ${tierName}[${slotIndex}]: expected ${width}×${height}, got ${expectedWidth}×${expectedHeight}`)
            }
        }
        
        // Copy to texture array backing data
        const offset = slotIndex * expectedSize
        const arrayData = tier.dataArrayTexture.image.data as Uint8Array
        arrayData.set(pixelData, offset)
        
        // Mark layer as pending GPU update
        tier.pendingUpdates.add(slotIndex)
        
        return true
    }
    
    /**
     * Flush all pending layer updates to GPU.
     * Uses partial layer updates for efficiency.
     */
    public flushToGpu(): boolean {
        let anyUpdates = false
        
        for (const [tierName, tier] of this.tiers.entries()) {
            if (tier.pendingUpdates.size > 0) {
                LodTextureArrayManager.logger.debug(`🔄 GPU FLUSH ${tierName}: ${tier.pendingUpdates.size} layers`)
                
                tier.dataArrayTexture.needsUpdate = true
                
                // Use partial layer updates (massive GPU bandwidth savings)
                for (const slotIndex of tier.pendingUpdates) {
                    tier.dataArrayTexture.addLayerUpdate(slotIndex)
                }
                
                LodTextureArrayManager.logger.debug(`🔄 ${tierName} flushed, needsUpdate=${tier.dataArrayTexture.needsUpdate}, version=${tier.dataArrayTexture.version}`)
                
                tier.pendingUpdates.clear()
                anyUpdates = true
            }
        }
        
        return anyUpdates
    }
    
    /**
     * Get the texture array for a specific tier.
     * Used when initializing the renderer.
     */
    public getTextureArray(tierName: string): THREE.DataArrayTexture | null {
        return this.tiers.get(tierName)?.dataArrayTexture ?? null
    }
    
    /**
     * Get tier configuration.
     */
    public getTierConfig(tierName: string): LodTierConfig | null {
        return this.tiers.get(tierName)?.config ?? null
    }
    
    /**
     * Get all tier names.
     */
    public getTierNames(): string[] {
        return Array.from(this.tiers.keys())
    }
    
    /**
     * Check if a tier has pending updates.
     */
    public hasPendingUpdates(tierName?: string): boolean {
        if (tierName) {
            return (this.tiers.get(tierName)?.pendingUpdates.size ?? 0) > 0
        }
        return Array.from(this.tiers.values()).some(t => t.pendingUpdates.size > 0)
    }
    
    public dispose(): void {
        const dataManager = DataManager.getInstance()
        
        for (const [name, tier] of this.tiers) {
            tier.dataArrayTexture.dispose()
            tier.pendingUpdates.clear()
            dataManager.removeMemoryConsumption(`LOD/${name}`)
        }
        
        this.tiers.clear()
        LodTextureArrayManager.logger.lifecycle('Disposed')
    }
}
