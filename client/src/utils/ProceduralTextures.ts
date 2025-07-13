/**
 * Procedural Texture Generator
 * Creates textures programmatically for better performance and no file dependencies
 */

import * as THREE from 'three'
import { NoiseGenerator } from './NoiseGenerator'

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
     * Create an enhanced wood grain texture with realistic patterns
     */
    public createEnhancedWoodTexture(options: {
        width?: number
        height?: number
        grainStrength?: number
        ringFrequency?: number
        color1?: string
        color2?: string
        color3?: string
    } = {}): THREE.Texture {
        const {
            width = 512,
            height = 512,
            grainStrength = 0.4,
            ringFrequency = 0.08,
            color1 = '#8B4513', // Saddle brown
            color2 = '#A0522D', // Sienna  
            color3 = '#654321'  // Dark brown
        } = options

        const cacheKey = `enhanced_wood_${width}_${height}_${grainStrength}_${ringFrequency}_${color1}_${color2}_${color3}`
        
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
            throw new Error('Failed to get 2D canvas context for enhanced wood texture')
        }

        const imageData = ctx.createImageData(width, height)
        const data = imageData.data

        // Convert hex colors to RGB
        const rgb1 = this.hexToRgb(color1)
        const rgb2 = this.hexToRgb(color2)
        const rgb3 = this.hexToRgb(color3)

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4

                // Use advanced wood grain noise
                const centerX = width / 2
                const centerY = height / 2
                const offsetX = x - centerX
                const offsetY = y - centerY
                
                const grainValue = NoiseGenerator.woodGrain(offsetX, offsetY, ringFrequency, grainStrength)
                
                // Add fine detail with octave noise
                const detail = NoiseGenerator.octaveNoise(x * 0.05, y * 0.05, 3, 0.5, 1) * 0.15
                
                const finalValue = Math.max(0, Math.min(1, grainValue + detail))
                
                // Interpolate between three colors for more realistic wood
                let r, g, b
                if (finalValue < 0.5) {
                    const factor = finalValue * 2
                    r = rgb1.r + (rgb2.r - rgb1.r) * factor
                    g = rgb1.g + (rgb2.g - rgb1.g) * factor
                    b = rgb1.b + (rgb2.b - rgb1.b) * factor
                } else {
                    const factor = (finalValue - 0.5) * 2
                    r = rgb2.r + (rgb3.r - rgb2.r) * factor
                    g = rgb2.g + (rgb3.g - rgb2.g) * factor
                    b = rgb2.b + (rgb3.b - rgb2.b) * factor
                }
                
                data[index] = Math.floor(r)     // Red
                data[index + 1] = Math.floor(g) // Green
                data[index + 2] = Math.floor(b) // Blue
                data[index + 3] = 255           // Alpha
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
     * Create an enhanced carpet texture with realistic fiber patterns
     */
    public createEnhancedCarpetTexture(options: {
        width?: number
        height?: number
        color?: string
        fiberDensity?: number
        roughness?: number
    } = {}): THREE.Texture {
        const {
            width = 512,
            height = 512,
            color = '#8B0000', // Dark red
            fiberDensity = 0.4,
            roughness = 0.8
        } = options

        const cacheKey = `enhanced_carpet_${width}_${height}_${color}_${fiberDensity}_${roughness}`
        
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
            throw new Error('Failed to get 2D canvas context for enhanced carpet texture')
        }

        const imageData = ctx.createImageData(width, height)
        const data = imageData.data
        const rgb = this.hexToRgb(color)

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4

                // Use advanced carpet fiber noise
                const fiberValue = NoiseGenerator.carpetFiber(x, y, fiberDensity)
                
                // Add color variation
                const colorVariation = NoiseGenerator.octaveNoise(x * 0.01, y * 0.01, 2, 0.6, 1) * 0.2
                
                const finalValue = fiberValue + colorVariation
                const intensity = 1 + finalValue * roughness

                data[index] = Math.max(0, Math.min(255, rgb.r * intensity))     // Red
                data[index + 1] = Math.max(0, Math.min(255, rgb.g * intensity)) // Green
                data[index + 2] = Math.max(0, Math.min(255, rgb.b * intensity)) // Blue
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
     * Create an enhanced popcorn ceiling texture with realistic bumps
     */
    public createEnhancedCeilingTexture(options: {
        width?: number
        height?: number
        color?: string
        bumpSize?: number
        density?: number
    } = {}): THREE.Texture {
        const {
            width = 512,
            height = 512,
            color = '#F5F5DC', // Beige
            bumpSize = 0.5,
            density = 0.7
        } = options

        const cacheKey = `enhanced_ceiling_${width}_${height}_${color}_${bumpSize}_${density}`
        
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
            throw new Error('Failed to get 2D canvas context for enhanced ceiling texture')
        }

        const imageData = ctx.createImageData(width, height)
        const data = imageData.data
        const rgb = this.hexToRgb(color)

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4

                // Use advanced popcorn ceiling noise
                const bumpValue = NoiseGenerator.popcornCeiling(x, y, bumpSize, density)
                
                // Add subtle color variation
                const colorVariation = NoiseGenerator.octaveNoise(x * 0.02, y * 0.02, 2, 0.3, 1) * 0.1
                
                const finalValue = 1 + bumpValue + colorVariation

                data[index] = Math.max(0, Math.min(255, rgb.r * finalValue))     // Red
                data[index + 1] = Math.max(0, Math.min(255, rgb.g * finalValue)) // Green
                data[index + 2] = Math.max(0, Math.min(255, rgb.b * finalValue)) // Blue
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
