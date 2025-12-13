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

const log = Logger.withContext('LodTextureArrayManager')

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
    private tiers: Map<string, TextureArrayState> = new Map()
    private nextSlotIndex: number = 0
    
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
            
            log.debug(`Created texture array: ${name} (${width}×${height}×${maxDepth})`)
        }
        
        log.lifecycle(`LOD VRAM: ${tierInfo.join(', ')} | Total: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }
    
    /**
     * Allocate the next available slot index.
     * Returns -1 if all tiers are full.
     */
    public allocateSlot(): number {
        // Check if any tier has room (use smallest maxDepth as the limit)
        const minDepth = Math.min(...Array.from(this.tiers.values()).map(t => t.config.maxDepth))
        
        if (this.nextSlotIndex >= minDepth) {
            log.warn(`All slots allocated (${minDepth} max)`)
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
            log.error(`Unknown tier: ${tierName}`)
            return false
        }
        
        const { width, height, maxDepth } = tier.config
        
        if (slotIndex < 0 || slotIndex >= maxDepth) {
            log.error(`Slot index ${slotIndex} out of range for tier ${tierName} (max: ${maxDepth})`)
            return false
        }
        
        const expectedSize = width * height * 4
        if (pixelData.length !== expectedSize) {
            log.error(`Pixel data size mismatch for ${tierName}[${slotIndex}]: expected ${expectedSize}, got ${pixelData.length}`)
            return false
        }
        
        // Validate dimensions if provided
        if (expectedWidth !== undefined && expectedHeight !== undefined) {
            if (expectedWidth !== width || expectedHeight !== height) {
                log.warn(`Dimension mismatch for ${tierName}[${slotIndex}]: expected ${width}×${height}, got ${expectedWidth}×${expectedHeight}`)
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
        
        for (const tier of this.tiers.values()) {
            if (tier.pendingUpdates.size > 0) {
                // Use partial layer updates (massive GPU bandwidth savings)
                for (const slotIndex of tier.pendingUpdates) {
                    tier.dataArrayTexture.addLayerUpdate(slotIndex)
                }
                tier.dataArrayTexture.needsUpdate = true
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
        log.lifecycle('Disposed')
    }
}
