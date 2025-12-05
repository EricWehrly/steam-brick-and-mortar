/**
 * LOD Artwork Renderer - GPU Instancing with Per-Instance Level of Detail
 * 
 * Allows dynamic LOD switching per game box instance.
 * Maintains 3 texture arrays at different resolutions:
 * 
 * | LOD Level | Resolution | Purpose               | VRAM (512 layers) |
 * |-----------|------------|----------------------|-------------------|
 * | High (0)  | 512×512    | Full detail          | 512 MB            |
 * | Mid (1)   | 128×128    | Reasonable quality   | 32 MB             |
 * | Low (2)   | 16×16      | Distant/overview     | 0.5 MB            |
 * 
 * Key feature: Per-instance LOD attribute allows mixing LOD levels in same draw call.
 * All three texture arrays share the same texture indices - a game at index 5
 * has its high-res version at textureArrayHigh[5], mid at textureArrayMid[5], etc.
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import type { InstanceMetadata } from '../../../debug/GameFinder'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import vertexShader from './shaders/instanced-artwork-lod.vert?raw'
import fragmentShader from './shaders/instanced-artwork-lod.frag?raw'
import { TextureWorker } from './TextureWorker'

/** LOD level constants */
export const LOD_LEVEL = {
    HIGH: 0,
    MID: 1,
    LOW: 2
} as const

export type LodLevel = typeof LOD_LEVEL[keyof typeof LOD_LEVEL]

/** LOD configuration */
export interface LodConfig {
    level: LodLevel
    textureSize: number
    name: string
}

/** Default LOD configurations */
export const DEFAULT_LOD_CONFIGS: LodConfig[] = [
    { level: LOD_LEVEL.HIGH, textureSize: 512, name: 'high' },
    { level: LOD_LEVEL.MID, textureSize: 128, name: 'mid' },
    { level: LOD_LEVEL.LOW, textureSize: 16, name: 'low' }
]

export interface LodArtworkConfig {
    /** Maximum number of textures/instances */
    maxTextures?: number
    /** Override LOD configurations */
    lodConfigs?: LodConfig[]
    /** Box dimensions */
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
    /** Default LOD level for new instances */
    defaultLod?: LodLevel
}

interface LodTextureState {
    config: LodConfig
    dataArrayTexture: THREE.DataArrayTexture | null
    pendingUpdates: Set<number>  // Texture indices that need GPU update
}

export class LodArtworkRenderer {
    private instancedMesh: THREE.InstancedMesh | null = null
    private geometry: THREE.BoxGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    
    // One texture array per LOD level
    private lodTextures: Map<LodLevel, LodTextureState> = new Map()
    
    // Shared texture index tracking (same index across all LOD levels)
    private textureSlots: Map<string, number> = new Map()  // gameName -> textureIndex
    private nextTextureIndex: number = 0
    private currentInstanceCount: number = 0
    
    // Per-instance data
    private instanceMetadata: Map<number, InstanceMetadata & { lodLevel: LodLevel }> = new Map()
    private lodLevels: Float32Array | null = null
    
    // Source image dimension tracking (for diagnostics)
    private sourceDimensions: { width: number; height: number }[] = []
    
    private textureWorker: TextureWorker
    private readonly maxTextures: number
    private readonly dimensions: { width: number; height: number; depth: number }
    private readonly defaultLod: LodLevel
    private readonly lodConfigs: LodConfig[]
    
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion()

    constructor(config: LodArtworkConfig = {}) {
        this.maxTextures = config.maxTextures ?? 512
        this.dimensions = {
            width: config.boxWidth ?? 0.3,
            height: config.boxHeight ?? 0.4,
            depth: config.boxDepth ?? 0.1
        }
        this.defaultLod = config.defaultLod ?? LOD_LEVEL.HIGH
        this.lodConfigs = config.lodConfigs ?? DEFAULT_LOD_CONFIGS
        
        this.textureWorker = new TextureWorker()
        
        // Initialize LOD texture states
        for (const lodConfig of this.lodConfigs) {
            this.lodTextures.set(lodConfig.level, {
                config: lodConfig,
                dataArrayTexture: null,
                pendingUpdates: new Set()
            })
        }
        
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.InstancedBatchComplete, 
            this.updateGPU.bind(this)
        )
        
        this.logConfig()
    }
    
    private logConfig(): void {
        let totalVRAM = 0
        const lodInfo: string[] = []
        
        for (const lodConfig of this.lodConfigs) {
            const vram = lodConfig.textureSize * lodConfig.textureSize * this.maxTextures * 4
            totalVRAM += vram
            lodInfo.push(`${lodConfig.name} (${lodConfig.textureSize}×${lodConfig.textureSize}): ${(vram / (1024 * 1024)).toFixed(1)}MB`)
        }
        
        console.debug(`🎨 LodArtworkRenderer configured:`)
        console.debug(`   Max textures: ${this.maxTextures}`)
        console.debug(`   Default LOD: ${this.defaultLod}`)
        lodInfo.forEach(info => console.debug(`   ${info}`))
        console.debug(`   Total estimated VRAM: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }
    
    /**
     * Initialize GPU resources (called lazily on first game)
     */
    private initialize(): void {
        if (this.instancedMesh) return
        
        // Create all LOD texture arrays
        for (const [level, state] of this.lodTextures) {
            const size = state.config.textureSize
            const data = new Uint8Array(size * size * this.maxTextures * 4)
            state.dataArrayTexture = new THREE.DataArrayTexture(data, size, size, this.maxTextures)
            state.dataArrayTexture.format = THREE.RGBAFormat
            state.dataArrayTexture.type = THREE.UnsignedByteType
            state.dataArrayTexture.minFilter = THREE.LinearFilter
            state.dataArrayTexture.magFilter = THREE.LinearFilter
            state.dataArrayTexture.wrapS = THREE.ClampToEdgeWrapping
            state.dataArrayTexture.wrapT = THREE.ClampToEdgeWrapping
            state.dataArrayTexture.needsUpdate = true
            
            console.debug(`🎨 Created ${state.config.name} LOD texture array: ${size}×${size}×${this.maxTextures}`)
        }
        
        // Create material with all three texture arrays
        const highState = this.lodTextures.get(LOD_LEVEL.HIGH)
        const midState = this.lodTextures.get(LOD_LEVEL.MID)
        const lowState = this.lodTextures.get(LOD_LEVEL.LOW)
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                textureArrayHigh: { value: highState?.dataArrayTexture },
                textureArrayMid: { value: midState?.dataArrayTexture },
                textureArrayLow: { value: lowState?.dataArrayTexture }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.FrontSide
        })
        
        // Create geometry
        this.geometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        // Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.material,
            this.maxTextures
        )
        this.instancedMesh.name = 'gpu-artwork-lod'
        this.instancedMesh.count = 0
        this.instancedMesh.castShadow = true
        this.instancedMesh.receiveShadow = true
        this.instancedMesh.frustumCulled = false
        
        // Setup per-instance attributes
        const textureIndices = new Float32Array(this.maxTextures)
        this.lodLevels = new Float32Array(this.maxTextures)
        textureIndices.fill(0)
        this.lodLevels.fill(this.defaultLod)
        
        const textureIndexAttr = new THREE.InstancedBufferAttribute(textureIndices, 1)
        const lodLevelAttr = new THREE.InstancedBufferAttribute(this.lodLevels, 1)
        textureIndexAttr.setUsage(THREE.DynamicDrawUsage)
        lodLevelAttr.setUsage(THREE.DynamicDrawUsage)
        
        this.geometry.setAttribute('textureIndex', textureIndexAttr)
        this.geometry.setAttribute('lodLevel', lodLevelAttr)
        
        // Add to scene
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (scene) {
            scene.add(this.instancedMesh)
            console.debug('🎨 LodArtworkRenderer initialized and added to scene')
        }
        
        // Register metadata with DataManager
        DataManager.getInstance().set(
            'artworkMetadata_lod' as DataKey,
            this.instanceMetadata,
            { domain: DataDomain.Scene }
        )
    }
    
    /**
     * Add artwork instance by URL
     * Loads texture at all LOD levels for dynamic switching
     */
    public async setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number
    ): Promise<{ success: boolean; instanceIndex: number }> {
        // Lazy initialize
        if (!this.instancedMesh) {
            this.initialize()
        }
        
        // Check capacity
        if (this.nextTextureIndex >= this.maxTextures) {
            console.debug(`⚠️ LOD atlas full (${this.maxTextures} textures)`)
            return { success: false, instanceIndex: -1 }
        }
        
        // Check for existing texture
        const existingIndex = this.textureSlots.get(gameName)
        if (existingIndex !== undefined) {
            return { success: true, instanceIndex: existingIndex }
        }
        
        const textureIndex = this.nextTextureIndex++
        let isFirstLod = true
        
        try {
            // Process LOD levels SEQUENTIALLY - the worker shares a canvas
            // and concurrent requests with different sizes cause data corruption
            for (const [_level, state] of this.lodTextures) {
                const result = await this.textureWorker.fetchAndProcess(
                    artworkUrl,
                    state.config.textureSize,
                    textureIndex,
                    gameName,
                    10000
                )
                
                // Track source dimensions from first LOD (all same source)
                if (isFirstLod && result.sourceWidth && result.sourceHeight) {
                    this.sourceDimensions.push({
                        width: result.sourceWidth,
                        height: result.sourceHeight
                    })
                    isFirstLod = false
                }
                
                // Copy to texture array
                if (!state.dataArrayTexture) {
                    throw new Error(`${state.config.name} texture array not initialized`)
                }
                const sliceSize = state.config.textureSize * state.config.textureSize * 4
                const offset = textureIndex * sliceSize
                const arrayData = state.dataArrayTexture.image.data as Uint8Array
                arrayData.set(result.imageData, offset)
                state.pendingUpdates.add(textureIndex)
            }
            
            this.textureSlots.set(gameName, textureIndex)
            
            // Add instance
            const instanceIndex = this.currentInstanceCount++
            const matrix = new THREE.Matrix4()
            matrix.compose(position, LodArtworkRenderer.DEFAULT_ROTATION, new THREE.Vector3(1, 1, 1))
            this.instancedMesh!.setMatrixAt(instanceIndex, matrix)
            
            // Set attributes
            const textureIndices = this.geometry!.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            textureIndices.setX(instanceIndex, textureIndex)
            
            const lodLevelAttr = this.geometry!.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
            lodLevelAttr.setX(instanceIndex, this.defaultLod)
            
            // Store metadata
            this.instanceMetadata.set(instanceIndex, {
                name: gameName,
                appid,
                position: position.clone(),
                lodLevel: this.defaultLod
            })
            
            return { success: true, instanceIndex }
            
        } catch (error) {
            // Rollback texture index on failure
            this.nextTextureIndex--
            
            const msg = error instanceof Error ? error.message : String(error)
            console.debug(`Failed to add artwork for "${gameName}": ${msg}`)
            return { success: false, instanceIndex: -1 }
        }
    }
    
    /**
     * Set LOD level for a specific instance
     */
    public setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean {
        if (!this.geometry || instanceIndex < 0 || instanceIndex >= this.currentInstanceCount) {
            return false
        }
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
        lodLevelAttr.setX(instanceIndex, lodLevel)
        lodLevelAttr.needsUpdate = true
        
        // Update metadata
        const metadata = this.instanceMetadata.get(instanceIndex)
        if (metadata) {
            metadata.lodLevel = lodLevel
        }
        
        return true
    }
    
    /**
     * Set LOD level for ALL instances at once
     */
    public setGlobalLod(lodLevel: LodLevel): void {
        if (!this.geometry || !this.lodLevels) return
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel') as THREE.InstancedBufferAttribute
        
        for (let i = 0; i < this.currentInstanceCount; i++) {
            lodLevelAttr.setX(i, lodLevel)
            
            const metadata = this.instanceMetadata.get(i)
            if (metadata) {
                metadata.lodLevel = lodLevel
            }
        }
        
        lodLevelAttr.needsUpdate = true
        console.debug(`🎨 Set global LOD to ${lodLevel} for ${this.currentInstanceCount} instances`)
    }
    
    /**
     * Get current LOD level for an instance
     */
    public getInstanceLod(instanceIndex: number): LodLevel | null {
        const metadata = this.instanceMetadata.get(instanceIndex)
        return metadata?.lodLevel ?? null
    }
    
    /**
     * Update GPU resources
     */
    public updateGPU(): void {
        if (!this.instancedMesh || !this.geometry) return
        
        // Update all LOD texture arrays
        for (const state of this.lodTextures.values()) {
            if (state.dataArrayTexture && state.pendingUpdates.size > 0) {
                state.dataArrayTexture.needsUpdate = true
                state.pendingUpdates.clear()
            }
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentInstanceCount
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
        
        const lodLevelAttr = this.geometry.getAttribute('lodLevel')
        if (lodLevelAttr) {
            lodLevelAttr.needsUpdate = true
        }
    }
    
    /**
     * Get memory usage stats
     */
    public getMemoryStats(): {
        lods: Record<string, { allocated: number; textureSize: number }>
        totalAllocated: number
        textureCount: number
        instanceCount: number
    } {
        const lods: Record<string, { allocated: number; textureSize: number }> = {}
        let totalAllocated = 0
        
        for (const [_level, state] of this.lodTextures) {
            const size = state.config.textureSize
            const allocated = state.dataArrayTexture 
                ? size * size * this.maxTextures * 4
                : 0
            
            lods[state.config.name] = {
                allocated,
                textureSize: size
            }
            totalAllocated += allocated
        }
        
        return {
            lods,
            totalAllocated,
            textureCount: this.nextTextureIndex,
            instanceCount: this.currentInstanceCount
        }
    }
    
    /**
     * Log memory stats to console
     */
    public logMemoryStats(): void {
        const stats = this.getMemoryStats()
        
        console.group('🎨 LOD Artwork Memory Stats')
        for (const [name, lodStats] of Object.entries(stats.lods)) {
            const allocMB = (lodStats.allocated / (1024 * 1024)).toFixed(1)
            console.log(`${name} (${lodStats.textureSize}px): ${allocMB}MB`)
        }
        console.log(`Total: ${(stats.totalAllocated / (1024 * 1024)).toFixed(1)}MB`)
        console.log(`Textures: ${stats.textureCount}, Instances: ${stats.instanceCount}`)
        
        // Source image dimension analysis
        if (this.sourceDimensions.length > 0) {
            const widths = this.sourceDimensions.map(d => d.width)
            const heights = this.sourceDimensions.map(d => d.height)
            const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length
            const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length
            const maxWidth = Math.max(...widths)
            const maxHeight = Math.max(...heights)
            const minWidth = Math.min(...widths)
            const minHeight = Math.min(...heights)
            
            console.group('📐 Source Image Dimensions (Steam headers)')
            console.log(`Samples: ${this.sourceDimensions.length}`)
            console.log(`Average: ${avgWidth.toFixed(0)}×${avgHeight.toFixed(0)}`)
            console.log(`Range: ${minWidth}×${minHeight} to ${maxWidth}×${maxHeight}`)
            console.log(`Recommendation: HIGH LOD could be ${Math.ceil(maxWidth / 64) * 64}×${Math.ceil(maxHeight / 64) * 64} or smaller`)
            console.groupEnd()
        }
        
        console.groupEnd()
    }
    
    public isReady(): boolean {
        return this.instancedMesh !== null
    }
    
    public getInstanceCount(): number {
        return this.currentInstanceCount
    }
    
    public dispose(): void {
        this.instancedMesh?.removeFromParent()
        this.geometry?.dispose()
        this.material?.dispose()
        
        for (const state of this.lodTextures.values()) {
            state.dataArrayTexture?.dispose()
            state.pendingUpdates.clear()
        }
        
        this.textureSlots.clear()
        this.instanceMetadata.clear()
        this.textureWorker.dispose()
        
        console.debug('🧹 LodArtworkRenderer disposed')
    }
}
