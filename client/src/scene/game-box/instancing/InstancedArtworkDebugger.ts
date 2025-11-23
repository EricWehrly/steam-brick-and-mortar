/**
 * Debug utilities for InstancedArtworkRenderer
 * 
 * Provides debugging tools for inspecting texture array state and exporting
 * texture data for visual inspection. Separated from main renderer for cleaner
 * architecture and easier testing.
 */

import type * as THREE from 'three'
import type { TextureProcessorStats } from './TextureProcessor'

export interface DebugContext {
    dataArrayTexture: THREE.DataArrayTexture | null
    textureSize: number
    maxTextures: number
    maxInstances: number
    currentCount: number
    isInitialized: boolean
    getProcessorStats: () => TextureProcessorStats
}

/**
 * Debug utilities for instanced artwork rendering
 */
export class InstancedArtworkDebugger {
    /**
     * Export texture array as viewable image for inspection
     * Creates a grid visualization of all textures in the array and downloads as PNG
     */
    public static exportTextureArray(context: DebugContext): void {
        if (!context.dataArrayTexture) {
            console.error('🔍 Cannot export texture array - not initialized')
            return
        }
        
        const stats = context.getProcessorStats()
        
        console.log(`🔍 [DEBUG] Exporting texture array for inspection...`)
        console.log(`🔍 [DEBUG] Array info: ${context.textureSize}x${context.textureSize}x${stats.nextTextureIndex} textures`)
        
        try {
            // Create a large canvas to show all textures in a grid
            const texturesPerRow = Math.ceil(Math.sqrt(stats.nextTextureIndex))
            const canvasWidth = texturesPerRow * context.textureSize
            const canvasHeight = Math.ceil(stats.nextTextureIndex / texturesPerRow) * context.textureSize
            
            const debugCanvas = document.createElement('canvas')
            debugCanvas.width = canvasWidth
            debugCanvas.height = canvasHeight
            const debugCtx = debugCanvas.getContext('2d')
            
            if (!debugCtx) {
                console.error('🔥 Failed to create debug canvas context')
                return
            }
            
            // Fill background with checkered pattern to show transparency
            const checkerSize = 8
            for (let x = 0; x < canvasWidth; x += checkerSize) {
                for (let y = 0; y < canvasHeight; y += checkerSize) {
                    const isEven = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0
                    debugCtx.fillStyle = isEven ? '#ddd' : '#bbb'
                    debugCtx.fillRect(x, y, checkerSize, checkerSize)
                }
            }
            
            const arrayData = context.dataArrayTexture.image.data as Uint8Array
            const sliceSize = context.textureSize * context.textureSize * 4
            
            // Draw each texture in the grid
            for (let i = 0; i < stats.nextTextureIndex; i++) {
                const offset = i * sliceSize
                const imageData = new ImageData(
                    new Uint8ClampedArray(arrayData.slice(offset, offset + sliceSize)),
                    context.textureSize,
                    context.textureSize
                )
                
                const x = (i % texturesPerRow) * context.textureSize
                const y = Math.floor(i / texturesPerRow) * context.textureSize
                
                debugCtx.putImageData(imageData, x, y)
                
                // Add texture index label
                debugCtx.fillStyle = 'red'
                debugCtx.font = '16px monospace'
                debugCtx.fillText(`${i}`, x + 5, y + 20)
            }
            
            // Convert to blob and trigger download
            debugCanvas.toBlob((blob) => {
                if (!blob) {
                    console.error('🔥 Failed to create blob from debug canvas')
                    return
                }
                
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `texture-array-debug-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.png`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(url)
                
                console.log(`✅ [DEBUG] Texture array exported: ${stats.nextTextureIndex} textures, ${canvasWidth}x${canvasHeight}px`)
            }, 'image/png')
            
        } catch (error) {
            console.error('🔥 [DEBUG] Failed to export texture array:', error)
        }
    }
    
    /**
     * Log detailed texture array state to console
     * Useful for debugging texture allocation and usage
     */
    public static logTextureArrayState(context: DebugContext): void {
        const stats = context.getProcessorStats()
        
        console.log(`🔍 [DEBUG] ===== TEXTURE ARRAY STATE =====`)
        console.log(`🔍 [DEBUG] Initialized: ${context.isInitialized}`)
        console.log(`🔍 [DEBUG] Texture Array: ${context.dataArrayTexture ? 'EXISTS' : 'NULL'}`)
        console.log(`🔍 [DEBUG] Size: ${context.textureSize}x${context.textureSize}`)
        console.log(`🔍 [DEBUG] Used Slots: ${stats.nextTextureIndex}/${context.maxTextures}`)
        console.log(`🔍 [DEBUG] Active Instances: ${context.currentCount}/${context.maxInstances}`)
        console.log(`🔍 [DEBUG] Texture Mappings: ${stats.textureSlots}`)
        
        if (context.dataArrayTexture) {
            const arrayData = context.dataArrayTexture.image.data as Uint8Array
            console.log(`🔍 [DEBUG] Array Data Length: ${arrayData.length} bytes`)
            console.log(`🔍 [DEBUG] Expected Length: ${context.textureSize * context.textureSize * context.maxTextures * 4} bytes`)
        }
        
        console.log(`🔍 [DEBUG] ===============================`)
    }
}
