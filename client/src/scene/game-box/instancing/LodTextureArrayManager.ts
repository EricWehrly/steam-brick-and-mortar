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

/**
 * Debug mode: paint a solid-color band across the bottom 20% of each texture slot
 * so LOD tier is visible at a glance in-headset.
 *
 * MID tier → blue  (#33 55 FF)
 * HIGH tier → green (#33 FF 55)
 *
 * Set to true and reload to enable. No runtime toggle — this is a dev tool.
 */
const LOD_DEBUG_STRIPE = false
export { LOD_DEBUG_STRIPE }

/** Stripe colors per tier name (RGBA). Add entries for any custom tiers. */
export const LOD_STRIPE_COLORS: Record<string, [number, number, number, number]> = {
    [LOD_TIER_NAME.MID]:  [51, 85, 255, 255],   // blue
    [LOD_TIER_NAME.HIGH]: [51, 255, 85,  255],   // green
}

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
// TD: Extract shared pixel-write + dirty-slot + GPU-flush logic into ManagedTextureArray base class
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
        
        // Copy to texture array backing data, optionally painting the debug stripe
        const offset = slotIndex * expectedSize
        const arrayData = tier.dataArrayTexture.image.data as Uint8Array

        if (LOD_DEBUG_STRIPE) {
            const stripeColor = LOD_STRIPE_COLORS[tierName]
            const stripeRows = Math.floor(height * 0.2)
            const stripeStart = (height - stripeRows) * width * 4  // bottom N rows

            // Write artwork pixels then overwrite the stripe band
            arrayData.set(pixelData, offset)
            const stripeColor32 = stripeColor ?? [128, 128, 128, 255]
            for (let row = 0; row < stripeRows; row++) {
                const rowOffset = offset + stripeStart + row * width * 4
                for (let col = 0; col < width; col++) {
                    const pixelOffset = rowOffset + col * 4
                    arrayData[pixelOffset]     = stripeColor32[0]
                    arrayData[pixelOffset + 1] = stripeColor32[1]
                    arrayData[pixelOffset + 2] = stripeColor32[2]
                    arrayData[pixelOffset + 3] = stripeColor32[3]
                }
            }
        } else {
            arrayData.set(pixelData, offset)
        }
        
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
     * Compact the MID tier to the actual number of allocated slots.
     * After all games are loaded, the MID array was pre-allocated to an estimate
     * (totalBatches * 18 + 100). This trims it to the exact slot count used.
     *
     * Mutates the existing DataArrayTexture in-place so any renderer uniform
     * already holding a reference to it will see the new data automatically
     * on the next Three.js render upload — no reference threading required.
     */
    public compactMidTier(): void {
        const tier = this.tiers.get(LOD_TIER_NAME.MID)
        if (!tier) return

        const actualDepth = this.nextSlotIndex
        if (actualDepth >= tier.config.maxDepth) return  // Already exact — nothing to do

        const { width, height } = tier.config
        const bytesPerSlice = width * height * 4

        const oldData = tier.dataArrayTexture.image.data as Uint8Array
        const newData = new Uint8Array(bytesPerSlice * actualDepth)
        newData.set(oldData.subarray(0, bytesPerSlice * actualDepth))

        const oldMB = Math.round((width * height * tier.config.maxDepth * 4) / (1024 * 1024))
        const newMB = Math.round((bytesPerSlice * actualDepth) / (1024 * 1024))
        const oldMaxDepth = tier.config.maxDepth

        // Mutate in-place — Three.js re-uploads via texImage3D on next needsUpdate cycle.
        // Any material uniform already referencing this texture stays valid.
        const image = tier.dataArrayTexture.image as { data: Uint8Array; width: number; height: number; depth: number }
        image.data = newData
        image.depth = actualDepth
        tier.dataArrayTexture.needsUpdate = true

        tier.config = { ...tier.config, maxDepth: actualDepth }
        tier.pendingUpdates.clear()

        const dataManager = DataManager.getInstance()
        dataManager.removeMemoryConsumption(`LOD/${LOD_TIER_NAME.MID}`)
        dataManager.addMemoryConsumption(`LOD/${LOD_TIER_NAME.MID}`, newMB)

        LodTextureArrayManager.logger.info(
            `MID compacted: ${width}×${height}×${oldMaxDepth} → ${width}×${height}×${actualDepth} (~${oldMB - newMB} MB freed est.)`
        )
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
