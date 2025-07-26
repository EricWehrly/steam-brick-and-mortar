import * as THREE from 'three'
import type { MaterialOptions, TextureLoadOptions } from './MaterialBase'

/**
 * Base class for material generators
 */
export abstract class BaseMaterialGenerator {
  protected materialCache: Map<string, THREE.Material> = new Map()

  /**
   * Get a cached material or create a new one
   */
  protected getCachedMaterial<T extends THREE.Material>(
    cacheKey: string, 
    createFn: () => T | Promise<T>
  ): T | Promise<T> {
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as T
    }

    const result = createFn()
    
    if (result instanceof Promise) {
      return result.then(material => {
        this.materialCache.set(cacheKey, material)
        return material
      })
    } else {
      this.materialCache.set(cacheKey, result)
      return result
    }
  }

  /**
   * Apply common texture options
   */
  protected applyTextureOptions(texture: THREE.Texture, options: TextureLoadOptions): void {
    if (options.repeat) {
      texture.repeat.set(options.repeat.x, options.repeat.y)
    }
    
    if (options.anisotropy !== undefined) {
      texture.anisotropy = options.anisotropy
    }
    
    // Common VR optimizations
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
  }

  /**
   * Clear material cache to free memory
   */
  public clearCache(): void {
    this.materialCache.forEach(material => material.dispose())
    this.materialCache.clear()
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { count: number; keys: string[] } {
    return {
      count: this.materialCache.size,
      keys: Array.from(this.materialCache.keys())
    }
  }

  /**
   * Abstract method to be implemented by subclasses
   */
  abstract createMaterial(options?: MaterialOptions): THREE.Material | Promise<THREE.Material>
}
