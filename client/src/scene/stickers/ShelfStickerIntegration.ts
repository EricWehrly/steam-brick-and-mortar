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
import vertexShader from './shaders/sticker-macro-texture.vert.glsl?raw'
import fragmentShader from './shaders/sticker-macro-texture.frag.glsl?raw'

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
            
            // Split vertex shader into declarations and implementation
            const vertexLines = vertexShader.trim().split('\n')
            const vertexDeclarations: string[] = []
            const vertexImpl: string[] = []
            
            for (const line of vertexLines) {
                if (line.includes('attribute') || line.includes('varying') || line.startsWith('//')) {
                    vertexDeclarations.push(line)
                } else if (line.trim()) {
                    vertexImpl.push(line)
                }
            }
            
            // Split fragment shader into declarations and implementation
            const fragmentLines = fragmentShader.trim().split('\n')
            const fragmentDeclarations: string[] = []
            const fragmentImpl: string[] = []
            
            for (const line of fragmentLines) {
                if (line.includes('uniform') || line.includes('varying') || line.startsWith('//')) {
                    fragmentDeclarations.push(line)
                } else if (line.trim()) {
                    fragmentImpl.push(line)
                }
            }
            
            // Inject vertex shader declarations and logic
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                '#include <common>\n' + vertexDeclarations.join('\n')
            )
            
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\n' + vertexImpl.join('\n')
            )
            
            // Inject fragment shader declarations and logic
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                '#include <common>\n' + fragmentDeclarations.join('\n')
            )
            
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                '#include <map_fragment>\n' + fragmentImpl.join('\n')
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
