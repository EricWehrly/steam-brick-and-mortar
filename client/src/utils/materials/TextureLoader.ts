import * as THREE from 'three'
import type { TextureLoadOptions } from './MaterialBase'

/**
 * Service for loading and caching textures
 */
export class TextureLoader {
  private static instance: TextureLoader
  private loader: THREE.TextureLoader
  private textureCache: Map<string, THREE.Texture> = new Map()

  private constructor() {
    this.loader = new THREE.TextureLoader()
  }

  public static getInstance(): TextureLoader {
    if (!TextureLoader.instance) {
      TextureLoader.instance = new TextureLoader()
    }
    return TextureLoader.instance
  }

  /**
   * Load a texture with caching and VR optimization
   */
  public async loadTexture(url: string, options: TextureLoadOptions = {}): Promise<THREE.Texture> {
    const cacheKey = `${url}_${JSON.stringify(options)}`
    const cachedTexture = this.textureCache.get(cacheKey)
    
    if (cachedTexture) {
      return cachedTexture
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          // Apply VR optimizations
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.anisotropy = options.anisotropy ?? 16 // High anisotropy for VR
          
          // Apply repeat if specified
          if (options.repeat) {
            texture.repeat.set(options.repeat.x, options.repeat.y)
          }
          
          this.textureCache.set(cacheKey, texture)
          resolve(texture)
        },
        undefined,
        reject
      )
    })
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
