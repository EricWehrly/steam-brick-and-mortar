/**
 * GPU Memory Estimator
 * 
 * Estimates GPU/VRAM usage based on Three.js renderer info and known texture allocations.
 * Browser doesn't expose actual VRAM usage, so we calculate based on what we've allocated.
 * 
 * Memory formulas:
 * - Texture: width × height × 4 bytes (RGBA) × mipmap multiplier (~1.33 with mipmaps)
 * - DataArrayTexture: width × height × depth × 4 bytes
 * - InstancedMesh: instances × (16 floats matrix + attributes) × 4 bytes
 * - Geometry: vertices × stride × 4 bytes
 * 
 * ## Known Limitations / TODOs
 * 
 * ### INFORMATION MISSING: LOD Texture Arrays (BIG - main memory hog)
 * - LodArtworkRenderer has textureArrayHigh, textureArrayMid in shader uniforms
 * - These are DataArrayTextures not attached to standard material properties
 * - POSSIBLY OBTAIN BY: Query window.lodArtworkRenderer.getMemoryStats() directly
 * - POSSIBLY OBTAIN BY: Add a registry pattern where renderers register their textures
 * 
 * ### INFORMATION MISSING: Geometry buffer sizes
 * - Currently using placeholder: geometryCount * 1000 bytes
 * - POSSIBLY OBTAIN BY: geometry.attributes.position.count * stride * 4
 * - POSSIBLY OBTAIN BY: Sum all BufferAttribute.array.byteLength on each geometry
 * 
 * ### INFORMATION MISSING: InstancedMesh custom attributes
 * - Only counting instanceMatrix (64 bytes/instance)
 * - Missing: lodLevel (4), textureIndex (4), highTextureSlot (4) = 12+ bytes/instance
 * - POSSIBLY OBTAIN BY: Iterate geometry.attributes and sum instanced ones
 * 
 * ### INFORMATION MISSING: Environment maps, render targets
 * - scene.environment, scene.background if texture
 * - Any WebGLRenderTarget used for effects
 * - POSSIBLY OBTAIN BY: Check scene.environment, renderer internal state
 * 
 * ### INFORMATION MISSING: GPU driver overhead
 * - Actual VRAM includes alignment, metadata, command buffers
 * - Typically 10-20% overhead on top of raw texture data
 * - POSSIBLY OBTAIN BY: Apply multiplier (configurable) to final estimate
 * 
 * ## Expected Output (with ~800 games loaded, LOD atlas enabled)
 * 
 * | Component | Expected Size |
 * |-----------|---------------|
 * | HIGH texture array (300×450×128) | ~66 MB |
 * | MID texture array (128×128×800) | ~52 MB |
 * | InstancedMesh buffers | ~5 MB |
 * | Shelf/room geometry | ~10 MB |
 * | Misc textures (procedural, UI) | ~20 MB |
 * | **Total expected** | **~150 MB** |
 * 
 * If this estimator reports significantly less, it's missing data sources.
 */

import * as THREE from 'three'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'

export interface GpuMemoryBreakdown {
    textures: {
        count: number
        estimatedBytes: number
        details: TextureMemoryDetail[]
    }
    geometries: {
        count: number
        estimatedBytes: number
    }
    instancedMeshes: {
        count: number
        estimatedBytes: number
        details: InstancedMeshDetail[]
    }
    totalEstimatedBytes: number
    totalEstimatedMB: number
    warning?: string
}

export interface TextureMemoryDetail {
    name: string
    type: string
    dimensions: string
    bytes: number
}

export interface InstancedMeshDetail {
    name: string
    maxInstances: number
    activeInstances: number
    bytes: number
}

export class GpuMemoryEstimator {
    private static readonly MIPMAP_MULTIPLIER = 1.33
    private static readonly BYTES_PER_FLOAT = 4
    private static readonly MATRIX4_FLOATS = 16
    
    static estimate(renderer?: THREE.WebGLRenderer): GpuMemoryBreakdown {
        const dataManager = DataManager.getInstance()
        const scene = dataManager.get<THREE.Scene>(DataKey.MainScene)
        
        const textureDetails: TextureMemoryDetail[] = []
        const instancedDetails: InstancedMeshDetail[] = []
        
        let textureBytes = 0
        let geometryBytes: number
        let instancedBytes = 0
        
        // Get renderer info for counts
        // Note: If renderer not passed, geometry/texture COUNTS will be 0
        // but texture SIZES are still calculated from scene traversal and LOD stats
        const info = renderer?.info
        const textureCount = info?.memory?.textures ?? 0
        const geometryCount = info?.memory?.geometries ?? 0
        
        // =================================================================
        // PRIORITY: Get registered memory consumers
        // Components self-register their GPU memory usage with DataManager.addMemoryConsumer()
        // This is the primary source of truth for large allocations like LOD texture arrays
        // =================================================================
        const registeredNames = this.collectRegisteredMemoryConsumers(textureDetails)
        
        // Traverse scene to find textures and instanced meshes
        if (scene) {
            scene.traverse((object) => {
                // Check for InstancedMesh
                if (object instanceof THREE.InstancedMesh) {
                    const mesh = object as THREE.InstancedMesh
                    const maxCount = mesh.instanceMatrix.count / 16
                    const activeCount = mesh.count
                    
                    // Matrix4 per instance + color attribute if present
                    // TODO: Also count custom instanced attributes (lodLevel, textureIndex, etc.)
                    const bytesPerInstance = this.MATRIX4_FLOATS * this.BYTES_PER_FLOAT
                    const bytes = maxCount * bytesPerInstance
                    
                    instancedDetails.push({
                        name: mesh.name || 'unnamed',
                        maxInstances: maxCount,
                        activeInstances: activeCount,
                        bytes
                    })
                    instancedBytes += bytes
                }
                
                // Check for materials with textures
                if (object instanceof THREE.Mesh) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material]
                    for (const mat of materials) {
                        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.ShaderMaterial) {
                            this.collectTexturesFromMaterial(mat, textureDetails, registeredNames)
                        }
                    }
                }
            })
        }
        
        // Calculate texture bytes from collected details
        for (const detail of textureDetails) {
            textureBytes += detail.bytes
        }
        
        // Estimate geometry bytes (rough: 100 bytes per vertex average)
        // TODO: Calculate actual buffer sizes from geometry.attributes
        geometryBytes = geometryCount * 1000 // Very rough estimate
        
        const totalBytes = textureBytes + geometryBytes + instancedBytes
        
        // Warning threshold: 1GB
        const warning = totalBytes > 1024 * 1024 * 1024 
            ? `⚠️ High VRAM usage estimated: ${(totalBytes / (1024 * 1024)).toFixed(0)} MB`
            : undefined
        
        return {
            textures: {
                count: textureCount,
                estimatedBytes: textureBytes,
                details: textureDetails
            },
            geometries: {
                count: geometryCount,
                estimatedBytes: geometryBytes
            },
            instancedMeshes: {
                count: instancedDetails.length,
                estimatedBytes: instancedBytes,
                details: instancedDetails
            },
            totalEstimatedBytes: totalBytes,
            totalEstimatedMB: totalBytes / (1024 * 1024),
            warning
        }
    }
    
    /**
     * Collect registered memory consumers from DataManager
     * Components self-register their GPU memory usage with DataManager.addMemoryConsumer()
     * This is the primary source of truth for large allocations like LOD texture arrays
     */
    private static collectRegisteredMemoryConsumers(details: TextureMemoryDetail[]): Set<string> {
        const registeredNames = new Set<string>()
        
        const dataManager = DataManager.getInstance()
        const consumers = dataManager.getMemoryConsumption()
        
        for (const [name, megabytes] of consumers) {
            const bytes = megabytes * 1024 * 1024
            
            registeredNames.add(name)
            
            details.push({
                name: `Registered/${name}`,
                type: 'registered',
                dimensions: `${megabytes} MB`,
                bytes
            })
        }
        
        if (consumers.size === 0) {
            details.push({
                name: 'No registered consumers',
                type: 'info',
                dimensions: 'N/A',
                bytes: 0
            })
        }
        
        return registeredNames
    }
    
    private static collectTexturesFromMaterial(
        material: THREE.Material, 
        details: TextureMemoryDetail[],
        skipDimensions: Set<string> = new Set()
    ): void {
        const addTexture = (tex: THREE.Texture | null, name: string) => {
            if (!tex) return
            
            // Skip duplicates (same texture referenced multiple times)
            if (details.some(d => d.name === name)) return
            
            let bytes = 0
            let dimensions = ''
            let type = 'Texture'
            
            if (tex instanceof THREE.DataArrayTexture) {
                type = 'DataArrayTexture'
                const width = tex.image?.width ?? 512
                const height = tex.image?.height ?? 512
                const depth = tex.image?.depth ?? 1
                bytes = width * height * depth * 4 // RGBA
                dimensions = `${width}×${height}×${depth}`
                
                // Skip if this matches a LOD texture we already counted
                if (skipDimensions.has(dimensions)) {
                    return
                }
            } else if (tex.image) {
                const img = tex.image as { width?: number; height?: number }
                const width = img.width ?? 512
                const height = img.height ?? 512
                // Include mipmap overhead
                bytes = Math.round(width * height * 4 * this.MIPMAP_MULTIPLIER)
                dimensions = `${width}×${height}`
            }
            
            details.push({ name, type, dimensions, bytes })
        }
        
        // Check standard material textures
        if (material instanceof THREE.MeshStandardMaterial) {
            addTexture(material.map, `${material.name || 'mat'}.map`)
            addTexture(material.normalMap, `${material.name || 'mat'}.normalMap`)
            addTexture(material.roughnessMap, `${material.name || 'mat'}.roughnessMap`)
            addTexture(material.metalnessMap, `${material.name || 'mat'}.metalnessMap`)
            addTexture(material.aoMap, `${material.name || 'mat'}.aoMap`)
        }
        
        // Check shader material uniforms for regular textures only
        // Skip DataArrayTextures - those should be registered via DataManager.addMemoryConsumption()
        if (material instanceof THREE.ShaderMaterial && material.uniforms) {
            for (const [key, uniform] of Object.entries(material.uniforms)) {
                if (uniform.value instanceof THREE.Texture && 
                    !(uniform.value instanceof THREE.DataArrayTexture)) {
                    addTexture(uniform.value, `${material.name || 'shader'}.${key}`)
                }
            }
        }
    }
    
    /**
     * Log a formatted memory report to console
     */
    static logReport(renderer?: THREE.WebGLRenderer): void {
        const breakdown = this.estimate(renderer)
        
        console.group('🎮 GPU Memory Estimate')
        
        if (breakdown.warning) {
            console.warn(breakdown.warning)
        }
        
        console.log(`📊 Total: ${breakdown.totalEstimatedMB.toFixed(1)} MB estimated VRAM`)
        
        console.group('🖼️ Textures')
        console.log(`Count: ${breakdown.textures.count}`)
        console.log(`Estimated: ${(breakdown.textures.estimatedBytes / (1024 * 1024)).toFixed(1)} MB`)
        if (breakdown.textures.details.length > 0) {
            console.table(breakdown.textures.details.map(d => ({
                name: d.name,
                type: d.type,
                size: d.dimensions,
                MB: (d.bytes / (1024 * 1024)).toFixed(2)
            })))
        }
        console.groupEnd()
        
        console.group('📦 Instanced Meshes')
        console.log(`Count: ${breakdown.instancedMeshes.count}`)
        console.log(`Estimated: ${(breakdown.instancedMeshes.estimatedBytes / (1024 * 1024)).toFixed(1)} MB`)
        if (breakdown.instancedMeshes.details.length > 0) {
            console.table(breakdown.instancedMeshes.details.map(d => ({
                name: d.name,
                max: d.maxInstances,
                active: d.activeInstances,
                MB: (d.bytes / (1024 * 1024)).toFixed(2)
            })))
        }
        console.groupEnd()
        
        console.group('📐 Geometries')
        console.log(`Count: ${breakdown.geometries.count}`)
        console.log(`Estimated: ${(breakdown.geometries.estimatedBytes / (1024 * 1024)).toFixed(1)} MB`)
        console.groupEnd()
        
        console.groupEnd()
    }
}

// Expose globally for debugging
if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).GpuMemoryEstimator = GpuMemoryEstimator
}
