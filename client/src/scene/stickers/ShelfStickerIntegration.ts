/**
 * Shelf Sticker Integration - Manages sticker rendering on shelf surfaces
 * 
 * Uses macro texture approach:
 * - Single large texture with tile per shelf
 * - Stickers rendered directly onto tiles
 * - Simple shader (just texture blend)
 * - Zero attribute overhead
 * - No WebGL limits
 * 
 * Kept separate from InstancedShelfRenderer to reduce class complexity
 * and enable reuse across different shelf renderer implementations.
 */

import * as THREE from 'three'
import { StickerManager } from './StickerManager'
import { ShelfStickerTextureAtlas } from './ShelfStickerTextureAtlas'
import type { InstancedMeshManager } from '../instancing/InstancedMeshManager'

// Toggle verbose sticker-system debug logging and runtime exposures in this module
const STICKERS_DEBUG = false

export interface StickerIntegrationConfig {
    stickerManager: StickerManager
}

export class ShelfStickerIntegration {
    private stickerManager: StickerManager
    private macroTexture: ShelfStickerTextureAtlas
    
    constructor(config: StickerIntegrationConfig) {
        this.stickerManager = config.stickerManager
        
        // Create macro texture atlas - one texture for all shelves
        // Each shelf gets its own tile region in the texture
        this.macroTexture = new ShelfStickerTextureAtlas(
            this.stickerManager.getEmojiAtlas(),
            {
                tileSize: 256,      // 256x256 pixels per shelf
                tilesPerRow: 16     // 16x16 = 256 shelves max, 4096x4096 texture (~64MB)
            }
        )
        
        if (STICKERS_DEBUG) console.debug('🎨 ShelfStickerIntegration: Using macro texture approach (no attribute limits)')
    }
    
    /**
     * Add sticker instance attributes to a mesh manager
     * Macro texture approach only needs shelfId (1 float)
     */
    public setupInstanceAttributes(meshManager: InstancedMeshManager): void {
        meshManager.addInstanceAttributes([
            { name: 'shelfId', itemSize: 1, defaultValue: 0 }
        ])
    if (STICKERS_DEBUG) console.debug('🎨 Added shelfId attribute for macro texture stickers')
    }
    
    /**
     * Modify material to support sticker rendering via macro texture
     * Simple shader: just blend the pre-rendered sticker texture
     */
    public setupStickerMaterial(material: THREE.MeshStandardMaterial): void {
        const macroTextureInfo = this.macroTexture.getAtlasInfo()
        
    if (STICKERS_DEBUG) console.debug(`🎨 Setting up macro texture sticker material (${macroTextureInfo.tilesPerRow}x${macroTextureInfo.tilesPerRow} tiles)`)
        
        material.onBeforeCompile = (shader) => {
            // Add uniforms
            shader.uniforms.stickerMacroTexture = { value: this.macroTexture.getTexture() }
            shader.uniforms.tilesPerRow = { value: macroTextureInfo.tilesPerRow }
            
            // Vertex shader: pass shelfId, UV, and world normal to fragment
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `
                #include <common>
                attribute float shelfId;
                varying float vShelfId;
                varying vec2 vUV;
                varying vec3 vWorldNormal;
                `
            )
            
            // Fragment shader: sample from shelf's tile region and blend
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `
                #include <common>
                uniform sampler2D stickerMacroTexture;
                uniform float tilesPerRow;
                varying float vShelfId;
                varying vec2 vUV;
                varying vec3 vWorldNormal;
                `
            )
            
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vShelfId = shelfId;
                vUV = uv;
                // Transform normal to world space (not view space like vNormal)
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                `
            )
            
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                
                // Sample sticker from macro texture and blend with base color
                if (abs(vWorldNormal.x) > 0.9) {
                    float row = floor(vShelfId / tilesPerRow);
                    float col = mod(vShelfId, tilesPerRow);
                    vec2 tileOffset = vec2(col, row) / tilesPerRow;
                    
                    // Fix aspect ratio: sideboard is taller than wide, so scale U to maintain square aspect
                    // Assuming sideboard is roughly 2:1 height:width ratio
                    vec2 correctedUV = vUV;
                    correctedUV.x = correctedUV.x * 0.5 + 0.25; // Center horizontally and scale to 50% width
                    
                    // Flip V coordinate (canvas Y goes down, UV V goes up)
                    correctedUV.y = 1.0 - correctedUV.y;
                    
                    vec2 tileUV = tileOffset + (correctedUV / tilesPerRow);
                    vec4 stickerColor = texture2D(stickerMacroTexture, tileUV);
                    
                    // Blend stickers on top of base color using alpha
                    diffuseColor.rgb = mix(diffuseColor.rgb, stickerColor.rgb, stickerColor.a);
                }
                `
            )
        }
        
        // Force material recompilation
        material.needsUpdate = true
        
    if (STICKERS_DEBUG) console.debug('🎨 Sticker material shader modified (macro texture mode)')
    }
    
    /**
     * Update sticker data for a specific surface instance
     * Sets shelfId attribute and renders stickers to macro texture
     */
    public updateSurfaceStickers(
        meshManager: InstancedMeshManager,
        instanceIndex: number,
        surfaceId: number
    ): void {
        // Set shelfId attribute so shader knows which tile to use
        meshManager.setInstanceAttribute('shelfId', instanceIndex, surfaceId)
        
        // Render stickers for this shelf to its tile in the macro texture
        const stickers = this.stickerManager.getStickersForShelf(surfaceId)
        
        // Clear existing stickers for this shelf
        this.macroTexture.clearShelf(surfaceId)
        
        // Add each sticker to the macro texture
        stickers.forEach(sticker => {
            if (sticker.enabled) {
                this.macroTexture.addStickerToShelf(
                    surfaceId,
                    sticker.emoji,
                    [sticker.position[0], sticker.position[1]],
                    sticker.rotation,
                    sticker.scale
                )
            }
        })
    }
    
    /**
     * Populate random stickers and update macro texture
     */
    public populateAndRefresh(
        meshManager: InstancedMeshManager,
        surfaceCount: number,
        getSurfaceId: (index: number) => number,
        density: number = 0.8
    ): void {
        // Generate surface IDs for all surfaces
        const surfaceIds: number[] = []
        for (let i = 0; i < surfaceCount; i++) {
            surfaceIds.push(getSurfaceId(i))
        }
        
        // Populate sticker data in manager using actual surface IDs
        this.stickerManager.populateRandomStickersWithIds(surfaceIds, density)
        
        // Update each surface: set shelfId attribute and render to macro texture
        let stickersRendered = 0
        for (let i = 0; i < surfaceCount; i++) {
            const surfaceId = surfaceIds[i]
            this.updateSurfaceStickers(meshManager, i, surfaceId)
            const stickers = this.stickerManager.getStickersForShelf(surfaceId)
            if (stickers.length > 0) {
                stickersRendered += stickers.length
            }
        }
        
        // Update macro texture with all rendered stickers
        this.macroTexture.updateTexture()
        
        // Update GPU with new instance attributes
        meshManager.updateGPU()
        
    if (STICKERS_DEBUG) console.debug(`🎨 Populated ${stickersRendered} stickers across ${surfaceCount} surfaces (${Math.round(density * 100)}% density)`)
    }
    
    /**
     * Get the macro texture atlas for direct manipulation
     */
    public getMacroTexture(): ShelfStickerTextureAtlas {
        return this.macroTexture
    }
}
