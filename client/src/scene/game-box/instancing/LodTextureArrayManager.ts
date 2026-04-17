/**
 * LOD Texture Array Manager
 * 
 * Manages the creation and population of texture arrays for LOD rendering.
 * This class owns the texture arrays and handles:
 * - Creating ManagedTextureArrays at appropriate resolutions (one per tier)
 * - Copying pixel data into texture array slots
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
import { ManagedTextureArray } from './ManagedTextureArray'

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

/** Internal state for one LOD tier: the managed array + its config. */
interface TierState {
    config: LodTierConfig
    array: ManagedTextureArray
}

/**
 * Manages LOD texture arrays - creation, population, and GPU updates.
 */
export class LodTextureArrayManager {
    public static logger = Logger.createLogFunctions(LodTextureArrayManager.name)
    private tiers: Map<string, TierState> = new Map()
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

            const debugStripe = LOD_DEBUG_STRIPE ? LOD_STRIPE_COLORS[name] : undefined
            const array = new ManagedTextureArray({ width, height, depth: maxDepth, debugStripe })
            
            this.tiers.set(name, { config: tierConfig, array })
            
            // Track VRAM
            const vram = width * height * maxDepth * 4
            totalVRAM += vram
            tierInfo.push(`${name}: ${maxDepth} slots × ${width}×${height}px = ${(vram / (1024 * 1024)).toFixed(1)}MB`)
            
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
    
    /** Get the current slot count (next index to be allocated). */
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
        
        const { width, height } = tier.config

        if (expectedWidth !== undefined && expectedHeight !== undefined) {
            if (expectedWidth !== width || expectedHeight !== height) {
                LodTextureArrayManager.logger.warn(`Dimension mismatch for ${tierName}[${slotIndex}]: expected ${width}×${height}, got ${expectedWidth}×${expectedHeight}`)
            }
        }

        const accepted = tier.array.setSlotPixels(slotIndex, pixelData)
        if (!accepted) {
            const expectedSize = width * height * 4
            if (slotIndex < 0 || slotIndex >= tier.config.maxDepth) {
                LodTextureArrayManager.logger.error(`Slot index ${slotIndex} out of range for tier ${tierName} (max: ${tier.config.maxDepth})`)
            } else {
                LodTextureArrayManager.logger.error(`Pixel data size mismatch for ${tierName}[${slotIndex}]: expected ${expectedSize}, got ${pixelData.length}`)
            }
        }
        return accepted
    }
    
    /**
     * Flush all pending layer updates to GPU.
     */
    public flushToGpu(): boolean {
        let anyUpdates = false
        
        for (const [tierName, tier] of this.tiers.entries()) {
            if (tier.array.hasPendingUpdates()) {
                LodTextureArrayManager.logger.debug(`🔄 GPU FLUSH ${tierName}: ${tier.array.pendingCount} layers`)
                tier.array.flushPendingToGpu()
                anyUpdates = true
            }
        }
        
        return anyUpdates
    }
    
    /** Get the texture array for a specific tier (for renderer uniforms). */
    public getTextureArray(tierName: string): THREE.DataArrayTexture | null {
        return this.tiers.get(tierName)?.array.texture ?? null
    }
    
    /** Get tier configuration. */
    public getTierConfig(tierName: string): LodTierConfig | null {
        return this.tiers.get(tierName)?.config ?? null
    }
    
    /** Get all tier names. */
    public getTierNames(): string[] {
        return Array.from(this.tiers.keys())
    }
    
    /**
     * Compact the MID tier to the actual number of allocated slots.
     * After all games are loaded, trims pre-allocated headroom to exact usage.
     */
    public compactMidTier(): void {
        const tier = this.tiers.get(LOD_TIER_NAME.MID)
        if (!tier) return

        const actualDepth = this.nextSlotIndex
        if (actualDepth >= tier.config.maxDepth) return

        const { width, height } = tier.config
        const bytesPerSlice = width * height * 4

        const oldData = tier.array.texture.image.data as Uint8Array
        const newData = new Uint8Array(bytesPerSlice * actualDepth)
        newData.set(oldData.subarray(0, bytesPerSlice * actualDepth))

        const oldMB = Math.round((width * height * tier.config.maxDepth * 4) / (1024 * 1024))
        const newMB = Math.round((bytesPerSlice * actualDepth) / (1024 * 1024))
        const oldMaxDepth = tier.config.maxDepth

        // Mutate the texture image in-place — Three.js re-uploads on next needsUpdate.
        // Any material uniform already referencing this texture stays valid.
        const image = tier.array.texture.image as { data: Uint8Array; width: number; height: number; depth: number }
        image.data = newData
        image.depth = actualDepth
        tier.array.texture.needsUpdate = true

        tier.config = { ...tier.config, maxDepth: actualDepth }

        const dataManager = DataManager.getInstance()
        dataManager.removeMemoryConsumption(`LOD/${LOD_TIER_NAME.MID}`)
        dataManager.addMemoryConsumption(`LOD/${LOD_TIER_NAME.MID}`, newMB)

        LodTextureArrayManager.logger.info(
            `MID compacted: ${width}×${height}×${oldMaxDepth} → ${width}×${height}×${actualDepth} (~${oldMB - newMB} MB freed est.)`
        )
    }

    /** Check if any tier (or a specific tier) has pending GPU updates. */
    public hasPendingUpdates(tierName?: string): boolean {
        if (tierName) {
            return this.tiers.get(tierName)?.array.hasPendingUpdates() ?? false
        }
        return Array.from(this.tiers.values()).some(t => t.array.hasPendingUpdates())
    }
    
    public dispose(): void {
        const dataManager = DataManager.getInstance()
        
        for (const [name, tier] of this.tiers) {
            tier.array.dispose()
            dataManager.removeMemoryConsumption(`LOD/${name}`)
        }
        
        this.tiers.clear()
        LodTextureArrayManager.logger.lifecycle('Disposed')
    }
}
