/**
 * Procedural Texture Generator
 * Creates textures programmatically for better performance and no file dependencies
 */

import * as THREE from 'three'
import { 
  WoodTextureGenerator, 
  CarpetTextureGenerator, 
  CeilingTextureGenerator,
  type WoodTextureOptions,
  type EnhancedWoodTextureOptions,
  type WoodNormalMapOptions,
  type CarpetTextureOptions,
  type EnhancedCarpetTextureOptions,
  type CeilingTextureOptions,
  type EnhancedCeilingTextureOptions
} from './textures'

export class ProceduralTextures {
    private static instance: ProceduralTextures
    private woodGenerator: WoodTextureGenerator
    private carpetGenerator: CarpetTextureGenerator
    private ceilingGenerator: CeilingTextureGenerator

    private constructor() {
        this.woodGenerator = new WoodTextureGenerator()
        this.carpetGenerator = new CarpetTextureGenerator()
        this.ceilingGenerator = new CeilingTextureGenerator()
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
    public createWoodTexture(options: WoodTextureOptions = {}): THREE.Texture {
        return this.woodGenerator.createTexture(options)
    }

    /**
     * Create a carpet texture procedurally
     */
    public createCarpetTexture(options: CarpetTextureOptions = {}): THREE.Texture {
        return this.carpetGenerator.createTexture(options)
    }

    /**
     * Create a popcorn ceiling texture procedurally
     */
    public createCeilingTexture(options: CeilingTextureOptions = {}): THREE.Texture {
        return this.ceilingGenerator.createTexture(options)
    }

    /**
     * Create a normal map for wood grain
     */
    public createWoodNormalMap(options: WoodNormalMapOptions = {}): THREE.Texture {
        return this.woodGenerator.createNormalMap(options)
    }

    /**
     * Create an enhanced wood grain texture with realistic patterns
     */
    public createEnhancedWoodTexture(options: EnhancedWoodTextureOptions = {}): THREE.Texture {
        return this.woodGenerator.createEnhancedTexture(options)
    }

    /**
     * Create an enhanced carpet texture with realistic fiber patterns
     */
    public createEnhancedCarpetTexture(options: EnhancedCarpetTextureOptions = {}): THREE.Texture {
        return this.carpetGenerator.createEnhancedTexture(options)
    }

    /**
     * Create an enhanced popcorn ceiling texture with realistic bumps
     */
    public createEnhancedCeilingTexture(options: EnhancedCeilingTextureOptions = {}): THREE.Texture {
        return this.ceilingGenerator.createEnhancedTexture(options)
    }

    /**
     * Clear texture cache to free memory
     */
    public clearCache(): void {
        this.woodGenerator.clearCache()
        this.carpetGenerator.clearCache()
        this.ceilingGenerator.clearCache()
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { count: number; keys: string[] } {
        const woodStats = this.woodGenerator.getCacheStats()
        const carpetStats = this.carpetGenerator.getCacheStats()
        const ceilingStats = this.ceilingGenerator.getCacheStats()
        
        return {
            count: woodStats.count + carpetStats.count + ceilingStats.count,
            keys: [...woodStats.keys, ...carpetStats.keys, ...ceilingStats.keys]
        }
    }
}
