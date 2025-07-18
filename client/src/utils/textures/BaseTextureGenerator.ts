import * as THREE from 'three'
import type { TextureOptions } from './TextureBase'

/**
 * Base class for procedural texture generators
 */
export abstract class BaseTextureGenerator {
  protected textureCache: Map<string, THREE.Texture> = new Map()

  /**
   * Create a canvas with the specified dimensions
   */
  protected createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context')
    }
    return { canvas, ctx }
  }

  /**
   * Create a THREE.js texture from a canvas
   */
  protected createTextureFromCanvas(canvas: HTMLCanvasElement): THREE.Texture {
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.needsUpdate = true
    return texture
  }

  /**
   * Utility function to convert hex color to RGB
   */
  protected hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 }
  }

  /**
   * Get a cached texture or create a new one
   */
  protected getCachedTexture(cacheKey: string, createFn: () => THREE.Texture): THREE.Texture {
    if (this.textureCache.has(cacheKey)) {
      const cachedTexture = this.textureCache.get(cacheKey)
      if (cachedTexture) {
        return cachedTexture
      }
    }

    const texture = createFn()
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

  /**
   * Abstract method to be implemented by subclasses
   */
  abstract createTexture(options?: TextureOptions): THREE.Texture
}
