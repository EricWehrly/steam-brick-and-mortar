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
        
        console.debug('🎨 ShelfStickerIntegration: Using macro texture approach (no attribute limits)')
        
        // Expose for debugging
        if (typeof window !== 'undefined') {
            (window as { stickerIntegration?: ShelfStickerIntegration }).stickerIntegration = this
            console.log('🎨 [DEBUG] Integration exposed as window.stickerIntegration')
        }
    }
    
    /**
     * Add sticker instance attributes to a mesh manager
     * Macro texture approach only needs shelfId (1 float)
     */
    public setupInstanceAttributes(meshManager: InstancedMeshManager): void {
        meshManager.addInstanceAttributes([
            { name: 'shelfId', itemSize: 1, defaultValue: 0 }
        ])
        console.debug('🎨 Added shelfId attribute for macro texture stickers')
    }
    
    /**
     * Modify material to support sticker rendering via macro texture
     * Simple shader: just blend the pre-rendered sticker texture
     */
    public setupStickerMaterial(material: THREE.MeshStandardMaterial): void {
        const macroTextureInfo = this.macroTexture.getAtlasInfo()
        
        console.log(`🎨 Setting up macro texture sticker material:`, macroTextureInfo)
        console.log(`🎨 [DEBUG] Material before setup:`, {
            type: material.type,
            name: material.name,
            map: material.map,
            hasOnBeforeCompile: !!material.onBeforeCompile
        })
        
        material.onBeforeCompile = (shader) => {
            console.log('🎨 [SHADER] onBeforeCompile called! Setting up uniforms...')
            
            // Add uniforms
            shader.uniforms.stickerMacroTexture = { value: this.macroTexture.getTexture() }
            shader.uniforms.tilesPerRow = { value: macroTextureInfo.tilesPerRow }
            
            const textureValue = this.macroTexture.getTexture()
            console.log('🎨 [SHADER DEBUG] Uniforms set:', {
                tilesPerRow: macroTextureInfo.tilesPerRow,
                textureSize: textureValue.image?.width ?? 'NO IMAGE',
                textureType: textureValue.constructor.name,
                hasImage: !!textureValue.image,
                hasTexture: !!textureValue,
                needsUpdate: textureValue.needsUpdate
            })
            
            console.log('🎨 [SHADER DEBUG] Texture details:', textureValue)
            console.log('🎨 [SHADER DEBUG] Shader object:', {
                vertexShaderLength: shader.vertexShader.length,
                fragmentShaderLength: shader.fragmentShader.length,
                uniformsKeys: Object.keys(shader.uniforms)
            })
            
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
                
                // DEBUG MODE: Enable one at a time by uncommenting
                
                // DEBUG 1: Show all X-facing faces in RED (should light up the outer sideboard faces)
                // if (abs(vWorldNormal.x) > 0.9) {
                //     diffuseColor.rgb = vec3(1.0, 0.0, 0.0);
                // }
                
                // DEBUG 2: Show shelfId as gradient (should see different colors per shelf)
                // if (abs(vWorldNormal.x) > 0.9) {
                //     float idNormalized = vShelfId / 90.0; // Assuming max ~90 shelves
                //     diffuseColor.rgb = vec3(idNormalized, 0.0, 1.0 - idNormalized);
                // }
                
                // DEBUG 3: Show UVs as colors (should see red-green gradient on each face)
                // diffuseColor.rgb = vec3(vUV.x, vUV.y, 0.0);
                
                // DEBUG 4: Show texture atlas directly (sample entire atlas, no tiling)
                // vec4 atlasColor = texture2D(stickerMacroTexture, vUV);
                // if (atlasColor.a > 0.1) {
                //     diffuseColor.rgb = vec3(0.0, 1.0, 0.0); // Green if any texture is sampled
                // }
                
                // PRODUCTION: Show tile region sample with alpha blend
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
        
        console.debug('🎨 Sticker material shader modified (macro texture mode)')
        console.log('🎨 [DEBUG] Material after setup:', {
            needsUpdate: material.needsUpdate,
            hasOnBeforeCompile: !!material.onBeforeCompile,
            uuid: material.uuid
        })
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
        density: number = 0.3
    ): void {
        console.log(`🎨 Populating ${surfaceCount} surfaces with ${density * 100}% sticker density`)
        
        // Generate surface IDs for all surfaces
        const surfaceIds: number[] = []
        for (let i = 0; i < surfaceCount; i++) {
            surfaceIds.push(getSurfaceId(i))
        }
        
        console.log(`🎨 [DEBUG] Surface IDs:`, surfaceIds.slice(0, 10), '...') // First 10 for brevity
        
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
        
        console.log(`🎨 [DEBUG] Rendered ${stickersRendered} stickers to macro texture`)
        
        // Update macro texture with all rendered stickers
        this.macroTexture.updateTexture()
        
        const atlasInfo = this.macroTexture.getAtlasInfo()
        console.log(`🎨 [DEBUG] Macro texture atlas info:`, atlasInfo)
        console.log(`🎨 [DEBUG] Macro texture needsUpdate:`, this.macroTexture.getTexture().needsUpdate)
        
        // DEBUG: Export canvas to visually inspect (uncomment to debug)
        // this.macroTexture.debugExportCanvas()
        
        // Update GPU with new instance attributes
        meshManager.updateGPU()
        
        console.log(`🎨 Macro texture updated with stickers for ${surfaceCount} surfaces`)
    }
}
