/**
 * Multi-Atlas Artwork Renderer - GPU Instancing with Tiered Texture Atlases
 * 
 * Uses 3 separate texture atlases optimized for progressive loading:
 * 
 * | Tier      | Purpose                               | Size    | Layers | VRAM   |
 * |-----------|---------------------------------------|---------|--------|--------|
 * | Primary   | First 1-2 batches (~36 games)         | 512×512 | 64     | 64MB   |
 * | Secondary | Remaining cached batches              | 256×256 | 512    | 128MB  |
 * | Overflow  | Late arrivals / uncached (shrinkable) | 256×256 | 64     | 16MB   |
 * 
 * Total: ~208MB vs ~1GB with single 1024-layer 512×512 atlas
 * 
 * Key insight: Steam header images are 460×215, so 256×256 is fine for most games.
 * Primary tier uses 512×512 only for the first visible games where quality matters.
 * 
 * Tier assignment is by batch index, not by cached/uncached status:
 * - Batch 0-1: Primary (show player something fast, high quality)
 * - Batch 2+: Secondary (fills in as ready)  
 * - Overflow: For late additions or when secondary fills
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import type { InstanceMetadata } from '../../../debug/GameFinder'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import vertexShader from './shaders/instanced-artwork.vert?raw'
import fragmentShader from './shaders/instanced-artwork.frag?raw'
import { TextureWorker } from './TextureWorker'

/** Atlas tier configuration */
export interface AtlasTierConfig {
    name: string
    textureSize: number
    maxTextures: number
    maxInstances: number
}

/** Default tier configurations - tuned for ~208MB total VRAM */
export const DEFAULT_ATLAS_TIERS: Record<string, AtlasTierConfig> = {
    primary: {
        name: 'primary',
        textureSize: 512,
        maxTextures: 64,   // ~36 games get artwork, this gives headroom
        maxInstances: 64
    },
    secondary: {
        name: 'secondary', 
        textureSize: 256,
        maxTextures: 512,
        maxInstances: 512
    },
    overflow: {
        name: 'overflow',
        textureSize: 256,
        maxTextures: 64,
        maxInstances: 64
    }
}

/** Which tier a game should go to */
export type AtlasTier = 'primary' | 'secondary' | 'overflow'

export interface MultiAtlasConfig {
    /** Override default tier configs */
    tiers?: Partial<Record<AtlasTier, Partial<AtlasTierConfig>>>
    /** How many batches go to primary tier (default: 2) */
    primaryBatches?: number
    /** Box dimensions */
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
}

interface TierState {
    config: AtlasTierConfig
    instancedMesh: THREE.InstancedMesh | null
    geometry: THREE.BoxGeometry | null
    material: THREE.ShaderMaterial | null
    dataArrayTexture: THREE.DataArrayTexture | null
    textureSlots: Map<string, number>
    nextTextureIndex: number
    currentInstanceCount: number
    instanceMetadata: Map<number, InstanceMetadata>
}

export class MultiAtlasArtworkRenderer {
    private tiers: Map<AtlasTier, TierState> = new Map()
    private textureWorker: TextureWorker
    private isInitialized: boolean = false
    
    private readonly primaryBatches: number
    private readonly dimensions: { width: number; height: number; depth: number }
    
    // Track current batch for tier assignment
    private currentBatchIndex: number = 0
    
    // Constant quaternion for no rotation
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: MultiAtlasConfig = {}) {
        this.primaryBatches = config.primaryBatches ?? 2
        this.dimensions = {
            width: config.boxWidth ?? 0.3,
            height: config.boxHeight ?? 0.4,
            depth: config.boxDepth ?? 0.1
        }
        
        this.textureWorker = new TextureWorker()
        
        // Initialize tier states with merged configs
        for (const tierName of ['primary', 'secondary', 'overflow'] as AtlasTier[]) {
            const defaultConfig = DEFAULT_ATLAS_TIERS[tierName]
            const overrides = config.tiers?.[tierName] ?? {}
            
            this.tiers.set(tierName, {
                config: { ...defaultConfig, ...overrides },
                instancedMesh: null,
                geometry: null,
                material: null,
                dataArrayTexture: null,
                textureSlots: new Map(),
                nextTextureIndex: 0,
                currentInstanceCount: 0,
                instanceMetadata: new Map()
            })
        }
        
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.updateGPU.bind(this)
        )
        
        this.logConfig()
    }
    
    private logConfig(): void {
        let totalVRAM = 0
        const tierInfo: string[] = []
        
        for (const [name, tier] of this.tiers) {
            const vram = tier.config.textureSize * tier.config.textureSize * tier.config.maxTextures * 4
            totalVRAM += vram
            tierInfo.push(`${name}: ${tier.config.textureSize}×${tier.config.textureSize}×${tier.config.maxTextures} = ${(vram / (1024 * 1024)).toFixed(0)}MB`)
        }
        
        console.debug(`🎨 MultiAtlasArtworkRenderer configured:`)
        console.debug(`   Primary batches: ${this.primaryBatches}`)
        tierInfo.forEach(info => console.debug(`   ${info}`))
        console.debug(`   Total estimated VRAM: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }
    
    /**
     * Initialize a specific tier's GPU resources
     * Called lazily when first game is added to tier
     */
    private initializeTier(tierName: AtlasTier): void {
        const tier = this.tiers.get(tierName)
        if (!tier || tier.instancedMesh) return // Not found or already initialized
        
        const { config } = tier
        const size = config.textureSize
        const depth = config.maxTextures
        
        // Create texture array
        const data = new Uint8Array(size * size * depth * 4)
        tier.dataArrayTexture = new THREE.DataArrayTexture(data, size, size, depth)
        tier.dataArrayTexture.format = THREE.RGBAFormat
        tier.dataArrayTexture.type = THREE.UnsignedByteType
        tier.dataArrayTexture.minFilter = THREE.LinearFilter
        tier.dataArrayTexture.magFilter = THREE.LinearFilter
        tier.dataArrayTexture.wrapS = THREE.ClampToEdgeWrapping
        tier.dataArrayTexture.wrapT = THREE.ClampToEdgeWrapping
        tier.dataArrayTexture.needsUpdate = true
        
        // Create material
        tier.material = new THREE.ShaderMaterial({
            uniforms: {
                textureArray: { value: tier.dataArrayTexture }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.FrontSide
        })
        
        // Create geometry
        tier.geometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        // Create instanced mesh
        tier.instancedMesh = new THREE.InstancedMesh(
            tier.geometry,
            tier.material,
            config.maxInstances
        )
        tier.instancedMesh.name = `gpu-artwork-${tierName}`
        tier.instancedMesh.count = 0
        tier.instancedMesh.castShadow = true
        tier.instancedMesh.receiveShadow = true
        tier.instancedMesh.frustumCulled = false
        
        // Setup texture index attribute
        const textureIndices = new Float32Array(config.maxInstances)
        textureIndices.fill(0)
        const textureIndexAttr = new THREE.InstancedBufferAttribute(textureIndices, 1)
        textureIndexAttr.setUsage(THREE.DynamicDrawUsage)
        tier.geometry.setAttribute('textureIndex', textureIndexAttr)
        
        // Add to scene
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (scene) {
            scene.add(tier.instancedMesh)
            console.debug(`🎨 ${tierName} atlas initialized and added to scene`)
        }
        
        // Register metadata with DataManager
        DataManager.getInstance().set(
            `artworkMetadata_${tierName}` as DataKey,
            tier.instanceMetadata,
            { domain: DataDomain.Scene }
        )
    }
    
    /**
     * Set the current batch index for tier assignment
     * Called by GpuGameBoxRenderer when processing a new batch
     */
    public setBatchIndex(batchIndex: number): void {
        this.currentBatchIndex = batchIndex
    }
    
    /**
     * Determine which tier a game should go to based on current batch
     * - Batches 0 to primaryBatches-1: Primary (high quality, show player something)
     * - Later batches: Secondary (fills in as ready)
     * - Overflow: When secondary is full
     */
    private determineTier(): AtlasTier {
        // First N batches go to primary
        if (this.currentBatchIndex < this.primaryBatches) {
            const primaryTier = this.tiers.get('primary')
            if (primaryTier && primaryTier.nextTextureIndex < primaryTier.config.maxTextures) {
                return 'primary'
            }
        }
        
        // Try secondary
        const secondaryTier = this.tiers.get('secondary')
        if (secondaryTier && secondaryTier.nextTextureIndex < secondaryTier.config.maxTextures) {
            return 'secondary'
        }
        
        // Fall back to overflow
        return 'overflow'
    }
    
    /**
     * Add artwork instance by URL - routes to appropriate tier
     */
    public async setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number
    ): Promise<{ success: boolean; tier: AtlasTier }> {
        const tierName = this.determineTier()
        const tier = this.tiers.get(tierName)
        
        if (!tier) {
            console.warn(`Tier ${tierName} not found`)
            return { success: false, tier: tierName }
        }
        
        // Lazy initialize tier
        if (!tier.instancedMesh) {
            this.initializeTier(tierName)
        }
        
        // Check capacity
        if (tier.nextTextureIndex >= tier.config.maxTextures) {
            console.debug(`⚠️ ${tierName} atlas full (${tier.config.maxTextures} textures)`)
            return { success: false, tier: tierName }
        }
        
        if (tier.currentInstanceCount >= tier.config.maxInstances) {
            console.debug(`⚠️ ${tierName} atlas full (${tier.config.maxInstances} instances)`)
            return { success: false, tier: tierName }
        }
        
        // Check for existing texture
        const existingIndex = tier.textureSlots.get(gameName)
        if (existingIndex !== undefined) {
            return { success: true, tier: tierName }
        }
        
        try {
            const textureIndex = tier.nextTextureIndex++
            
            // Fetch and process in worker
            const result = await this.textureWorker.fetchAndProcess(
                artworkUrl,
                tier.config.textureSize,
                textureIndex,
                gameName,
                10000
            )
            
            // Copy to texture array
            if (!tier.dataArrayTexture) {
                throw new Error('Texture array not initialized')
            }
            const sliceSize = tier.config.textureSize * tier.config.textureSize * 4
            const offset = textureIndex * sliceSize
            const arrayData = tier.dataArrayTexture.image.data as Uint8Array
            arrayData.set(result.imageData, offset)
            
            tier.textureSlots.set(gameName, textureIndex)
            
            // Add instance
            if (!tier.instancedMesh || !tier.geometry) {
                throw new Error('Mesh or geometry not initialized')
            }
            const instanceIndex = tier.currentInstanceCount++
            const matrix = new THREE.Matrix4()
            matrix.compose(position, MultiAtlasArtworkRenderer.DEFAULT_ROTATION, new THREE.Vector3(1, 1, 1))
            tier.instancedMesh.setMatrixAt(instanceIndex, matrix)
            
            // Set texture index attribute
            const textureIndices = tier.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            textureIndices.setX(instanceIndex, textureIndex)
            
            // Store metadata
            tier.instanceMetadata.set(instanceIndex, {
                name: gameName,
                appid,
                position: position.clone()
            })
            
            return { success: true, tier: tierName }
            
        } catch (error) {
            // Rollback texture index on failure
            tier.nextTextureIndex--
            
            const msg = error instanceof Error ? error.message : String(error)
            if (!msg.includes('Maximum textures')) {
                console.debug(`Failed to add artwork for "${gameName}" to ${tierName}: ${msg}`)
            }
            return { success: false, tier: tierName }
        }
    }
    
    /**
     * Update all tier GPU resources
     */
    public updateGPU(): void {
        for (const [_name, tier] of this.tiers) {
            if (!tier.instancedMesh || !tier.geometry) continue
            
            if (tier.dataArrayTexture) {
                tier.dataArrayTexture.needsUpdate = true
            }
            
            tier.instancedMesh.instanceMatrix.needsUpdate = true
            tier.instancedMesh.count = tier.currentInstanceCount
            
            const textureIndices = tier.geometry.getAttribute('textureIndex')
            if (textureIndices) {
                textureIndices.needsUpdate = true
            }
        }
    }
    
    /**
     * Get memory usage stats for each tier
     */
    public getMemoryStats(): {
        tiers: Record<AtlasTier, { allocated: number; used: number; textures: number; instances: number }>
        totalAllocated: number
        totalUsed: number
    } {
        const stats: Record<string, { allocated: number; used: number; textures: number; instances: number }> = {}
        let totalAllocated = 0
        let totalUsed = 0
        
        for (const [name, tier] of this.tiers) {
            const size = tier.config.textureSize
            const allocatedBytes = tier.instancedMesh 
                ? size * size * tier.config.maxTextures * 4
                : 0
            const usedBytes = size * size * tier.nextTextureIndex * 4
            
            stats[name] = {
                allocated: allocatedBytes,
                used: usedBytes,
                textures: tier.nextTextureIndex,
                instances: tier.currentInstanceCount
            }
            
            totalAllocated += allocatedBytes
            totalUsed += usedBytes
        }
        
        return {
            tiers: stats as Record<AtlasTier, { allocated: number; used: number; textures: number; instances: number }>,
            totalAllocated,
            totalUsed
        }
    }
    
    /**
     * Log memory stats to console
     */
    public logMemoryStats(): void {
        const stats = this.getMemoryStats()
        
        console.group('🎨 Multi-Atlas Memory Stats')
        for (const [name, tierStats] of Object.entries(stats.tiers)) {
            const allocMB = (tierStats.allocated / (1024 * 1024)).toFixed(1)
            const usedMB = (tierStats.used / (1024 * 1024)).toFixed(1)
            console.log(`${name}: ${usedMB}MB / ${allocMB}MB (${tierStats.textures} textures, ${tierStats.instances} instances)`)
        }
        console.log(`Total: ${(stats.totalUsed / (1024 * 1024)).toFixed(1)}MB / ${(stats.totalAllocated / (1024 * 1024)).toFixed(1)}MB`)
        console.groupEnd()
    }
    
    public isReady(): boolean {
        return this.tiers.get('primary')?.instancedMesh !== null
    }
    
    public dispose(): void {
        for (const [_name, tier] of this.tiers) {
            tier.instancedMesh?.removeFromParent()
            tier.geometry?.dispose()
            tier.material?.dispose()
            tier.dataArrayTexture?.dispose()
            tier.textureSlots.clear()
            tier.instanceMetadata.clear()
        }
        
        this.textureWorker.dispose()
        console.debug('🧹 MultiAtlasArtworkRenderer disposed')
    }
}
