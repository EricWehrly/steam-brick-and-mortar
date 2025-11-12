/**
 * Shelf Sticker Integration - Manages sticker rendering on shelf surfaces
 * 
 * Handles:
 * - Sticker attribute setup for instanced meshes
 * - Shader material modification for sticker rendering
 * - GPU attribute updates when stickers change
 * - Atlas texture management
 * 
 * Kept separate from InstancedShelfRenderer to reduce class complexity
 * and enable reuse across different shelf renderer implementations.
 */

import * as THREE from 'three'
import { StickerManager } from './StickerManager'
import type { InstancedMeshManager } from '../instancing/InstancedMeshManager'

export interface StickerIntegrationConfig {
    maxStickersPerSurface?: number
    stickerManager: StickerManager
}

export class ShelfStickerIntegration {
    private stickerManager: StickerManager
    private maxStickersPerSurface: number
    
    constructor(config: StickerIntegrationConfig) {
        this.stickerManager = config.stickerManager
        // TECH DEBT: WebGL attribute limit prevents more than ~3 stickers per surface
        // Each sticker uses 2 vec4 attributes (3 stickers = 6 attributes)
        // MeshStandardMaterial uses ~8-10 built-in attributes (position, normal, uv, tangent, etc.)
        // Total: 6 custom + 10 built-in = 16 attributes (at WebGL limit on some GPUs)
        // 
        // Future solutions to support more stickers:
        // - Pack sticker data more efficiently (use fewer vec4s per sticker)
        // - Use texture-based storage (data texture instead of attributes)
        // - Use Uniform Buffer Objects (WebGL2, more complex)
        // - Split into multiple render passes with fewer stickers each
        this.maxStickersPerSurface = config.maxStickersPerSurface ?? 3
    }
    
    /**
     * Add sticker instance attributes to a mesh manager
     */
    public setupInstanceAttributes(meshManager: InstancedMeshManager): void {
        const attributes = []
        
        for (let i = 0; i < this.maxStickersPerSurface; i++) {
            // Packed attributes: 2 vec4s per sticker
            attributes.push(
                { name: `sticker${i}Data1`, itemSize: 4, defaultValue: [0, 0, 0.5, 0.5] },  // uvOffset.xy, position.xy
                { name: `sticker${i}Data2`, itemSize: 4, defaultValue: [0, 1.0, 0, 0] }     // rotation, scale, enabled, padding
            )
        }
        
        meshManager.addInstanceAttributes(attributes)
        console.debug(`🎨 Added ${this.maxStickersPerSurface} sticker attribute sets`)
    }
    
    /**
     * Modify material to support sticker rendering via custom shader
     */
    public setupStickerMaterial(material: THREE.MeshStandardMaterial): void {
        const stickerTexture = this.stickerManager.getEmojiAtlas().getTexture()
        const atlasInfo = this.stickerManager.getAtlasInfo()
        const emojiUVSizeX = atlasInfo.uvScale
        const emojiUVSizeY = atlasInfo.uvScaleY
        
        console.log(`🎨 [SHADER DEBUG] Setting up sticker material with atlas:`, {
            atlasSize: atlasInfo.atlasSize,
            totalEmojis: atlasInfo.totalEmojis,
            uvScaleX: emojiUVSizeX,
            uvScaleY: emojiUVSizeY
        })
        
        material.onBeforeCompile = (shader) => {
            console.log(`🎨 [SHADER DEBUG] onBeforeCompile called`)
            
            shader.uniforms.stickerAtlas = { value: stickerTexture }
            shader.uniforms.emojiUVSize = { value: new THREE.Vector2(emojiUVSizeX, emojiUVSizeY) }
            
            // Build attribute declarations dynamically
            let attributeDeclarations = ''
            let varyingDeclarations = ''
            let varyingAssignments = ''
            
            for (let i = 0; i < this.maxStickersPerSurface; i++) {
                attributeDeclarations += `
                attribute vec4 sticker${i}Data1;
                attribute vec4 sticker${i}Data2;`
                varyingDeclarations += `
                varying vec4 vSticker${i}Data1;
                varying vec4 vSticker${i}Data2;`
                varyingAssignments += `
                vSticker${i}Data1 = sticker${i}Data1;
                vSticker${i}Data2 = sticker${i}Data2;`
            }
            
            // Vertex shader modifications
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `
                #include <common>
                ${attributeDeclarations}
                ${varyingDeclarations}
                varying vec2 vUV;
                `
            )
            
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vUV = uv;
                ${varyingAssignments}
                `
            )
            
            // Fragment shader modifications
            let varyingDeclarationsFragment = ''
            let stickerBlending = ''
            
            for (let i = 0; i < this.maxStickersPerSurface; i++) {
                varyingDeclarationsFragment += `
                varying vec4 vSticker${i}Data1;
                varying vec4 vSticker${i}Data2;`
                stickerBlending += `
                vec4 sticker${i} = getStickerColor(vSticker${i}Data1, vSticker${i}Data2);
                diffuseColor.rgb = mix(diffuseColor.rgb, sticker${i}.rgb, sticker${i}.a);`
            }
            
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `
                #include <common>
                uniform sampler2D stickerAtlas;
                uniform vec2 emojiUVSize;
                varying vec2 vUV;
                ${varyingDeclarationsFragment}
                
                vec4 getStickerColor(vec4 data1, vec4 data2) {
                    vec2 uvOffset = data1.xy;
                    vec2 stickerPos = data1.zw;
                    float rotation = data2.x;
                    float scale = data2.y;
                    float enabled = data2.z;
                    
                    if (enabled < 0.5) return vec4(0.0);
                    
                    vec2 localUV = vUV - stickerPos;
                    
                    // Apply rotation
                    float rad = radians(rotation);
                    float cosA = cos(rad);
                    float sinA = sin(rad);
                    vec2 rotatedUV = vec2(
                        localUV.x * cosA - localUV.y * sinA,
                        localUV.x * sinA + localUV.y * cosA
                    );
                    
                    // Apply scale and center
                    rotatedUV /= (scale * 0.15);
                    rotatedUV += vec2(0.5);
                    
                    // Check bounds
                    if (rotatedUV.x < 0.0 || rotatedUV.x > 1.0 || rotatedUV.y < 0.0 || rotatedUV.y > 1.0) {
                        return vec4(0.0);
                    }
                    
                    // Sample from atlas with correct X and Y scaling
                    vec2 atlasUV = uvOffset + rotatedUV * emojiUVSize;
                    return texture2D(stickerAtlas, atlasUV);
                }
                `
            )
            
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>
                ${stickerBlending}
                `
            )
        }
        
        material.needsUpdate = true
        console.debug('🎨 Sticker material shader modified')
    }
    
    /**
     * Update sticker attributes for a specific surface instance
     */
    public updateSurfaceStickers(
        meshManager: InstancedMeshManager,
        instanceIndex: number,
        surfaceId: number
    ): void {
        for (let stickerIndex = 0; stickerIndex < this.maxStickersPerSurface; stickerIndex++) {
            const stickerData = this.stickerManager.getStickerDataForShelf(surfaceId, stickerIndex)
            
            meshManager.setInstanceAttribute(`sticker${stickerIndex}Data1`, instanceIndex, [
                stickerData.uvOffset[0], stickerData.uvOffset[1],
                stickerData.position[0], stickerData.position[1]
            ])
            meshManager.setInstanceAttribute(`sticker${stickerIndex}Data2`, instanceIndex, [
                stickerData.rotation, stickerData.scale, stickerData.enabled, 0
            ])
        }
    }
    
    /**
     * Populate random stickers and update GPU attributes
     */
    public populateAndRefresh(
        meshManager: InstancedMeshManager,
        surfaceCount: number,
        getSurfaceId: (index: number) => number,
        density: number = 0.3
    ): void {
        console.log(`🎨 [STICKER DEBUG] Populating ${surfaceCount} surfaces with ${density * 100}% density`)
        
        this.stickerManager.populateRandomStickers(surfaceCount, density)
        
        console.log(`🎨 [STICKER DEBUG] Refreshing attributes for ${surfaceCount} surfaces`)
        
        for (let i = 0; i < surfaceCount; i++) {
            const surfaceId = getSurfaceId(i)
            this.updateSurfaceStickers(meshManager, i, surfaceId)
        }
        
        meshManager.updateGPU()
        console.log(`🎨 [STICKER DEBUG] GPU updated with sticker data`)
    }
}
