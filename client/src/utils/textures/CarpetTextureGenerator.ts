import * as THREE from 'three'
import type { TextureOptions } from './TextureBase'
import { BaseTextureGenerator } from './BaseTextureGenerator'
import { NoiseGenerator } from '../NoiseGenerator'

export interface CarpetTextureOptions extends TextureOptions {
  color?: string
  roughness?: number
}

export interface EnhancedCarpetTextureOptions extends CarpetTextureOptions {
  fiberDensity?: number
}

/**
 * Carpet texture generator
 */
export class CarpetTextureGenerator extends BaseTextureGenerator {
  /**
   * Create a carpet texture procedurally
   */
  public createTexture(options: CarpetTextureOptions = {}): THREE.Texture {
    const {
      width = 512,
      height = 512,
      color = '#8B0000', // Dark red (Blockbuster style)
      roughness = 0.8
    } = options

    const cacheKey = `carpet_${width}_${height}_${color}_${roughness}`
    
    return this.getCachedTexture(cacheKey, () => {
      const { canvas, ctx } = this.createCanvas(width, height)

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
      return this.createTextureFromCanvas(canvas)
    })
  }

  /**
   * Create an enhanced carpet texture with realistic fiber patterns
   */
  public createEnhancedTexture(options: EnhancedCarpetTextureOptions = {}): THREE.Texture {
    const {
      width = 512,
      height = 512,
      color = '#8B0000', // Dark red
      fiberDensity = 0.4,
      roughness = 0.8
    } = options

    const cacheKey = `enhanced_carpet_${width}_${height}_${color}_${fiberDensity}_${roughness}`
    
    return this.getCachedTexture(cacheKey, () => {
      const { canvas, ctx } = this.createCanvas(width, height)

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
      return this.createTextureFromCanvas(canvas)
    })
  }
}
