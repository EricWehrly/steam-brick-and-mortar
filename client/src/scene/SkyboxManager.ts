/**
 * Skybox Management Utility
 * 
 * Handles loading and setting up skyboxes for the scene with intelligent fallbacks:
 * 1. Primary: Load image textures as equirectangular skyboxes
 * 2. Fallback: Create gradient backgrounds using CSS-style patterns
 * 3. Ultimate fallback: Solid colors
 */

import * as THREE from 'three'

export interface SkyboxConfig {
    /** Path to the skybox image (relative to public folder) */
    imagePath?: string
    /** Fallback gradient configuration */
    gradient?: {
        topColor: string | number
        bottomColor: string | number
        intensity?: number  // 0-1, affects how pronounced the gradient is
    }
    /** Ultimate fallback solid color */
    solidColor?: string | number
}

export interface SkyboxLoadResult {
    success: boolean
    method: 'image' | 'gradient' | 'solid'
    background: THREE.Color | THREE.Texture
    error?: string
}

export class SkyboxManager {
    private scene: THREE.Scene
    private textureLoader: THREE.TextureLoader

    constructor(scene: THREE.Scene) {
        this.scene = scene
        this.textureLoader = new THREE.TextureLoader()
    }

    /**
     * Apply a skybox configuration to the scene
     */
    async applySkybox(config: SkyboxConfig): Promise<SkyboxLoadResult> {
        // Try to load image skybox first
        if (config.imagePath) {
            try {
                const imageResult = await this.loadImageSkybox(config.imagePath)
                if (imageResult.success) {
                    return imageResult
                }
            } catch (error) {
                console.warn('Failed to load image skybox:', error)
            }
        }

        // Fallback to gradient
        if (config.gradient) {
            return this.createGradientSkybox(config.gradient)
        }

        // Ultimate fallback to solid color
        const color = config.solidColor || 0x404040 // Dark gray default
        return this.createSolidSkybox(color)
    }

    /**
     * Load an equirectangular image as a skybox
     */
    private async loadImageSkybox(imagePath: string): Promise<SkyboxLoadResult> {
        return new Promise((resolve) => {
            this.textureLoader.load(
                imagePath,
                (texture) => {
                    // Configure texture for skybox use
                    texture.mapping = THREE.EquirectangularReflectionMapping
                    texture.colorSpace = THREE.SRGBColorSpace
                    
                    // Apply to scene
                    this.scene.background = texture
                    
                    resolve({
                        success: true,
                        method: 'image',
                        background: texture
                    })
                },
                undefined, // onProgress
                (error) => {
                    const errorMsg = error instanceof Error ? error.message : String(error)
                    resolve({
                        success: false,
                        method: 'image',
                        background: new THREE.Color(0x404040),
                        error: `Failed to load texture: ${errorMsg}`
                    })
                }
            )
        })
    }

    /**
     * Create a gradient skybox using canvas-generated texture
     * This simulates CSS linear-gradient() functionality
     */
    private createGradientSkybox(gradient: NonNullable<SkyboxConfig['gradient']>): SkyboxLoadResult {
        try {
            // Create a canvas for the gradient
            const canvas = document.createElement('canvas')
            canvas.width = 512
            canvas.height = 512
            const ctx = canvas.getContext('2d')
            
            if (!ctx) {
                throw new Error('Could not get canvas context')
            }

            // Create linear gradient
            const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
            const intensity = gradient.intensity || 0.5
            
            // Convert colors to CSS format
            const topColor = this.colorToCSS(gradient.topColor)
            const bottomColor = this.colorToCSS(gradient.bottomColor)
            
            grad.addColorStop(0, topColor)
            grad.addColorStop(intensity, this.mixColors(topColor, bottomColor, 0.5))
            grad.addColorStop(1, bottomColor)

            // Fill canvas with gradient
            ctx.fillStyle = grad
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            // Create Three.js texture from canvas
            const texture = new THREE.CanvasTexture(canvas)
            texture.mapping = THREE.EquirectangularReflectionMapping
            texture.colorSpace = THREE.SRGBColorSpace
            
            this.scene.background = texture

            return {
                success: true,
                method: 'gradient',
                background: texture
            }
        } catch (error) {
            console.warn('Failed to create gradient skybox:', error)
            // Fall back to solid color
            const fallbackColor = typeof gradient.bottomColor === 'number' 
                ? gradient.bottomColor 
                : 0x404040
            return this.createSolidSkybox(fallbackColor)
        }
    }

    /**
     * Create a solid color skybox
     */
    private createSolidSkybox(color: string | number): SkyboxLoadResult {
        const threeColor = new THREE.Color(color)
        this.scene.background = threeColor

        return {
            success: true,
            method: 'solid',
            background: threeColor
        }
    }

    /**
     * Convert various color formats to CSS color string
     */
    private colorToCSS(color: string | number): string {
        if (typeof color === 'string') {
            return color
        }
        
        // Convert hex number to CSS hex string
        const hex = color.toString(16).padStart(6, '0')
        return `#${hex}`
    }

    /**
     * Simple color mixing for gradients
     */
    private mixColors(color1: string, color2: string, ratio: number): string {
        // Simple implementation - for production might want more sophisticated blending
        const c1 = new THREE.Color(color1)
        const c2 = new THREE.Color(color2)
        return `rgb(${Math.round(c1.r * 255 * (1 - ratio) + c2.r * 255 * ratio)}, ${Math.round(c1.g * 255 * (1 - ratio) + c2.g * 255 * ratio)}, ${Math.round(c1.b * 255 * (1 - ratio) + c2.b * 255 * ratio)})`
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Clean up any loaded textures if needed
        if (this.scene.background instanceof THREE.Texture) {
            this.scene.background.dispose()
        }
    }
}

/**
 * Predefined skybox configurations
 */
export const SkyboxPresets = {
    aurora: {
        imagePath: '/textures/skyboxes/aurorasky.png',
        gradient: {
            topColor: '#1a1a2e',    // Dark blue night sky
            bottomColor: '#16213e',  // Slightly lighter horizon
            intensity: 0.3
        },
        solidColor: 0x404040      // Dark gray fallback
    },
    
    blockbusterClassic: {
        gradient: {
            topColor: '#2c2c2c',     // Dark gray top
            bottomColor: '#404040',   // Medium gray bottom  
            intensity: 0.4
        },
        solidColor: 0x404040
    },

    // For testing - matches current gold color but with gradient
    blockbusterGold: {
        gradient: {
            topColor: '#B8860B',      // Darker gold top
            bottomColor: '#DAA520',   // Current gold bottom
            intensity: 0.6
        },
        solidColor: 0xDAA520        // Current gold as fallback
    }
} as const
