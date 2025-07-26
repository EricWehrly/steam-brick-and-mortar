import * as THREE from 'three'
import type { TextureOptions } from './TextureBase'
import { BaseTextureGenerator } from './BaseTextureGenerator'
import { NoiseGenerator } from '../NoiseGenerator'

export interface WoodTextureOptions extends TextureOptions {
  grainStrength?: number
  color1?: string
  color2?: string
}

export interface EnhancedWoodTextureOptions extends WoodTextureOptions {
  ringFrequency?: number
  color3?: string
}

export interface WoodNormalMapOptions extends TextureOptions {
  strength?: number
}

/**
 * Wood texture generator
 */
export class WoodTextureGenerator extends BaseTextureGenerator {
  /**
   * Create a wood grain texture procedurally
   */
  public createTexture(options: WoodTextureOptions = {}): THREE.Texture {
    const {
      width = 2048,
      height = 2048,
      grainStrength = 0.3,
      color1 = '#8B4513', // Saddle brown
      color2 = '#A0522D'  // Sienna
    } = options

    const cacheKey = `wood_${width}_${height}_${grainStrength}_${color1}_${color2}`
    
    return this.getCachedTexture(cacheKey, () => {
      const { canvas, ctx } = this.createCanvas(width, height)

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
      return this.createTextureFromCanvas(canvas)
    })
  }

  /**
   * Create an enhanced wood grain texture with realistic patterns
   */
  public createEnhancedTexture(options: EnhancedWoodTextureOptions = {}): THREE.Texture {
    const {
      width = 2048,
      height = 2048,
      grainStrength = 0.4,
      ringFrequency = 0.08,
      color1 = '#8B4513', // Saddle brown
      color2 = '#A0522D', // Sienna  
      color3 = '#654321'  // Dark brown
    } = options

    const cacheKey = `enhanced_wood_${width}_${height}_${grainStrength}_${ringFrequency}_${color1}_${color2}_${color3}`
    
    return this.getCachedTexture(cacheKey, () => {
      const { canvas, ctx } = this.createCanvas(width, height)

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
          
          // Add multiple layers of detail for high-resolution textures
          const coarseDetail = NoiseGenerator.octaveNoise(x * 0.03, y * 0.03, 3, 0.5, 1) * 0.12
          const fineDetail = NoiseGenerator.octaveNoise(x * 0.08, y * 0.08, 4, 0.4, 1) * 0.08
          const ultraFineDetail = NoiseGenerator.octaveNoise(x * 0.15, y * 0.15, 2, 0.3, 1) * 0.05
          
          const finalValue = Math.max(0, Math.min(1, grainValue + coarseDetail + fineDetail + ultraFineDetail))
          
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
      return this.createTextureFromCanvas(canvas)
    })
  }

  /**
   * Create a normal map for wood grain
   */
  public createNormalMap(options: WoodNormalMapOptions = {}): THREE.Texture {
    const {
      width = 2048,
      height = 2048,
      strength = 0.5
    } = options

    const cacheKey = `wood_normal_${width}_${height}_${strength}`
    
    return this.getCachedTexture(cacheKey, () => {
      const { canvas, ctx } = this.createCanvas(width, height)

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
      return this.createTextureFromCanvas(canvas)
    })
  }
}
