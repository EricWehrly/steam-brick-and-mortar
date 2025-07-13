/**
 * Procedural Texture Generator
 * Creates textures programmatically for better performance and no file dependencies
 */

import * as THREE from 'three'

export class ProceduralTextures {
    private static instance: ProceduralTextures
    private textureCache: Map<string, THREE.Texture>

    private constructor() {
        this.textureCache = new Map()
    }

    public static getInstance(): ProceduralTextures {
        if (!ProceduralTextures.instance) {
            ProceduralTextures.instance = new ProceduralTextures()
        }
        return ProceduralTextures.instance
    }

    /**
     * Create a wood grain texture procedurally
     */
    public createWoodTexture(options: {
        width?: number
        height?: number
        grainStrength?: number
        color1?: string
        color2?: string
    } = {}): THREE.Texture {
        const {
            width = 512,
            height = 512,
            grainStrength = 0.3,
            color1 = '#8B4513', // Saddle brown
            color2 = '#A0522D'  // Sienna
        } = options

        const cacheKey = `wood_${width}_${height}_${grainStrength}_${color1}_${color2}`
        
        if (this.textureCache.has(cacheKey)) {
            const cachedTexture = this.textureCache.get(cacheKey)
            if (cachedTexture) {
                return cachedTexture
            }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Failed to get 2D canvas context for wood texture')
        }

        // Create wood grain pattern
        const imageData = ctx.createImageData(width, height)
        const data = imageData.data

        // Convert hex colors to RGB
        const rgb1 = this.hexToRgb(color1)
        const rgb2 = this.hexToRgb(color2)

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4

                // Create wood grain with sine waves
                const grainX = Math.sin(x * 0.02) * grainStrength
                const grainY = Math.sin(y * 0.1 + grainX) * grainStrength
                const noise = (Math.random() - 0.5) * 0.1

                const factor = Math.abs(grainY + noise)
                
                // Interpolate between two wood colors
                data[index] = Math.floor(rgb1.r + (rgb2.r - rgb1.r) * factor)     // Red
                data[index + 1] = Math.floor(rgb1.g + (rgb2.g - rgb1.g) * factor) // Green
                data[index + 2] = Math.floor(rgb1.b + (rgb2.b - rgb1.b) * factor) // Blue
                data[index + 3] = 255 // Alpha
            }
        }

        ctx.putImageData(imageData, 0, 0)

        // Create THREE.js texture
        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true

        this.textureCache.set(cacheKey, texture)
        return texture
    }

    /**
     * Create a carpet texture procedurally
     */
    public createCarpetTexture(options: {
        width?: number
        height?: number
        color?: string
        roughness?: number
    } = {}): THREE.Texture {
        const {
            width = 512,
            height = 512,
            color = '#8B0000', // Dark red (Blockbuster style)
            roughness = 0.8
        } = options

        const cacheKey = `carpet_${width}_${height}_${color}_${roughness}`
        
        if (this.textureCache.has(cacheKey)) {
            const cachedTexture = this.textureCache.get(cacheKey)
            if (cachedTexture) {
                return cachedTexture
            }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Failed to get 2D canvas context for carpet texture')
        }

        const imageData = ctx.createImageData(width, height)
        const data = imageData.data
        const rgb = this.hexToRgb(color)

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4

                // Create carpet fiber texture with noise
                const noise1 = (Math.random() - 0.5) * roughness * 100
                const _noise2 = (Math.random() - 0.5) * roughness * 50
                
                // Add some directional pattern for carpet fibers
                const fiber = Math.sin(x * 0.1) * Math.sin(y * 0.1) * 20

                data[index] = Math.max(0, Math.min(255, rgb.r + noise1 + fiber))     // Red
                data[index + 1] = Math.max(0, Math.min(255, rgb.g + noise1 + fiber)) // Green
                data[index + 2] = Math.max(0, Math.min(255, rgb.b + noise1 + fiber)) // Blue
                data[index + 3] = 255 // Alpha
            }
        }

        ctx.putImageData(imageData, 0, 0)

        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true

        this.textureCache.set(cacheKey, texture)
        return texture
    }

    /**
     * Create a popcorn ceiling texture procedurally
     */
    public createCeilingTexture(options: {
        width?: number
        height?: number
        color?: string
        bumpiness?: number
    } = {}): THREE.Texture {
        const {
            width = 512,
            height = 512,
            color = '#F5F5DC', // Beige
            bumpiness = 0.4
        } = options

        const cacheKey = `ceiling_${width}_${height}_${color}_${bumpiness}`
        
        if (this.textureCache.has(cacheKey)) {
            const cachedTexture = this.textureCache.get(cacheKey)
            if (cachedTexture) {
                return cachedTexture
            }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Failed to get 2D canvas context for ceiling texture')
        }

        const imageData = ctx.createImageData(width, height)
        const data = imageData.data
        const rgb = this.hexToRgb(color)

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4

                // Create popcorn/stucco texture with random bumps
                const bump1 = Math.random() * bumpiness * 100
                const bump2 = Math.random() * bumpiness * 50
                const bump3 = Math.random() * bumpiness * 25

                // Combine different scales of noise
                const totalBump = bump1 + bump2 + bump3

                data[index] = Math.max(0, Math.min(255, rgb.r + totalBump))     // Red
                data[index + 1] = Math.max(0, Math.min(255, rgb.g + totalBump)) // Green
                data[index + 2] = Math.max(0, Math.min(255, rgb.b + totalBump)) // Blue
                data[index + 3] = 255 // Alpha
            }
        }

        ctx.putImageData(imageData, 0, 0)

        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true

        this.textureCache.set(cacheKey, texture)
        return texture
    }

    /**
     * Create a normal map for wood grain
     */
    public createWoodNormalMap(options: {
        width?: number
        height?: number
        strength?: number
    } = {}): THREE.Texture {
        const {
            width = 512,
            height = 512,
            strength = 0.5
        } = options

        const cacheKey = `wood_normal_${width}_${height}_${strength}`
        
        if (this.textureCache.has(cacheKey)) {
            const cachedTexture = this.textureCache.get(cacheKey)
            if (cachedTexture) {
                return cachedTexture
            }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Failed to get 2D canvas context for normal map')
        }

        const imageData = ctx.createImageData(width, height)
        const data = imageData.data

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4

                // Calculate normal map values for wood grain
                const grainX = Math.sin(x * 0.02) * strength
                const grainY = Math.sin(y * 0.1 + grainX) * strength

                // Convert to normal map format (R=X, G=Y, B=Z)
                const normalX = (grainX + 1) * 127.5
                const normalY = (grainY + 1) * 127.5
                const normalZ = 255 // Point upward

                data[index] = normalX     // Red = X normal
                data[index + 1] = normalY // Green = Y normal  
                data[index + 2] = normalZ // Blue = Z normal
                data[index + 3] = 255     // Alpha
            }
        }

        ctx.putImageData(imageData, 0, 0)

        const texture = new THREE.CanvasTexture(canvas)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true

        this.textureCache.set(cacheKey, texture)
        return texture
    }

    /**
     * Utility function to convert hex color to RGB
     */
    private hexToRgb(hex: string): { r: number; g: number; b: number } {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 }
    }

    /**
     * Clear texture cache to free memory
     */
    public clearCache(): void {
        this.textureCache.forEach(texture => texture.dispose())
        this.textureCache.clear()
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { count: number; keys: string[] } {
        return {
            count: this.textureCache.size,
            keys: Array.from(this.textureCache.keys())
        }
    }
}
