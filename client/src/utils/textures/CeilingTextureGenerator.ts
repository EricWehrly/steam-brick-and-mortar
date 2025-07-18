import * as THREE from 'three'
import type { TextureOptions } from './TextureBase'
import { BaseTextureGenerator } from './BaseTextureGenerator'
import { NoiseGenerator } from '../NoiseGenerator'

export interface CeilingTextureOptions extends TextureOptions {
  color?: string
  bumpiness?: number
}

export interface EnhancedCeilingTextureOptions extends CeilingTextureOptions {
  bumpSize?: number
  density?: number
}

/**
 * Ceiling texture generator
 */
export class CeilingTextureGenerator extends BaseTextureGenerator {
  /**
   * Create a popcorn ceiling texture procedurally
   */
  public createTexture(options: CeilingTextureOptions = {}): THREE.Texture {
    const {
      width = 512,
      height = 512,
      color = '#F5F5DC', // Beige
      bumpiness = 0.4
    } = options

    const cacheKey = `ceiling_${width}_${height}_${color}_${bumpiness}`
    
    return this.getCachedTexture(cacheKey, () => {
      const { canvas, ctx } = this.createCanvas(width, height)

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
      return this.createTextureFromCanvas(canvas)
    })
  }

  /**
   * Create an enhanced popcorn ceiling texture with realistic bumps
   */
  public createEnhancedTexture(options: EnhancedCeilingTextureOptions = {}): THREE.Texture {
    const {
      width = 512,
      height = 512,
      color = '#F5F5DC', // Beige
      bumpSize = 0.5,
      density = 0.7
    } = options

    const cacheKey = `enhanced_ceiling_${width}_${height}_${color}_${bumpSize}_${density}`
    
    return this.getCachedTexture(cacheKey, () => {
      const { canvas, ctx } = this.createCanvas(width, height)

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
      return this.createTextureFromCanvas(canvas)
    })
  }
}
