import * as THREE from 'three'

export interface NormalMapOptions {
  width?: number
  height?: number
  intensity?: number // 0.0 to 1.0, controls normal map strength
  pileHeight?: number // Base carpet pile height
  fiberVariation?: number // Random fiber height variation
}

/**
 * Generates normal maps for carpet textures to simulate pile height and fiber texture
 */
export class CarpetNormalMapGenerator {
  
  /**
   * Generate a normal map from height data
   * @param heightData Grayscale height data (0-255 values)
   * @param width Image width
   * @param height Image height
   * @param options Normal map generation options
   */
  public generateNormalMapFromHeightData(
    heightData: Uint8ClampedArray, 
    width: number, 
    height: number, 
    options: NormalMapOptions = {}
  ): THREE.Texture {
    const { intensity = 0.5 } = options
    
    const normalData = new Uint8ClampedArray(width * height * 4)
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4
        
        // Sample neighboring heights for gradient calculation
        const heightL = this.sampleHeight(heightData, x - 1, y, width, height)
        const heightR = this.sampleHeight(heightData, x + 1, y, width, height)
        const heightU = this.sampleHeight(heightData, x, y - 1, width, height)
        const heightD = this.sampleHeight(heightData, x, y + 1, width, height)
        
        // Calculate gradients with stronger effect
        const gradX = (heightR - heightL) * intensity * 2.0 // Increased from 0.5 to 2.0
        const gradY = (heightD - heightU) * intensity * 2.0 // Increased from 0.5 to 2.0
        
        // Calculate normal vector
        const normalX = -gradX
        const normalY = -gradY
        const normalZ = 1.0
        
        // Normalize
        const length = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ)
        const invLength = 1.0 / length
        
        // Convert to 0-255 range and store
        normalData[index] = Math.floor(((normalX * invLength) * 0.5 + 0.5) * 255)     // R
        normalData[index + 1] = Math.floor(((normalY * invLength) * 0.5 + 0.5) * 255) // G
        normalData[index + 2] = Math.floor(((normalZ * invLength) * 0.5 + 0.5) * 255) // B
        normalData[index + 3] = 255 // A
      }
    }
    
    return this.createTextureFromImageData(normalData, width, height)
  }
  
  /**
   * Generate a carpet normal map with fiber texture and pile variations
   */
  public generateCarpetNormalMap(options: NormalMapOptions = {}): THREE.Texture {
    const {
      width = 512,
      height = 512,
      intensity = 0.5,
      pileHeight = 0.3,
      fiberVariation = 0.2
    } = options
    
    // Generate height data for carpet fibers
    const heightData = this.generateCarpetHeightData(width, height, pileHeight, fiberVariation)
    
    // Convert to normal map
    return this.generateNormalMapFromHeightData(heightData, width, height, { intensity })
  }
  
  /**
   * Generate height data representing carpet pile and fiber texture
   */
  private generateCarpetHeightData(
    width: number, 
    height: number, 
    pileHeight: number, 
    fiberVariation: number
  ): Uint8ClampedArray {
    const heightData = new Uint8ClampedArray(width * height)
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        
        // Base pile height with noise
        let height = pileHeight
        
        // Add fiber variation using multiple octaves of noise
        height += this.noise(x * 0.1, y * 0.1) * fiberVariation * 0.5
        height += this.noise(x * 0.3, y * 0.3) * fiberVariation * 0.3
        height += this.noise(x * 0.8, y * 0.8) * fiberVariation * 0.2
        
        // Clamp and convert to 0-255
        height = Math.max(0, Math.min(1, height))
        heightData[index] = Math.floor(height * 255)
      }
    }
    
    return heightData
  }
  
  /**
   * Generate height data for geometric patterns with raised/recessed areas
   */
  public generateGeometricHeightData(
    width: number,
    height: number,
    patternData: Uint8ClampedArray,
    options: NormalMapOptions = {}
  ): Uint8ClampedArray {
    const { pileHeight = 0.3, fiberVariation = 0.1 } = options
    const heightData = new Uint8ClampedArray(width * height)
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        const pixelIndex = index * 4
        
        // Use pattern brightness to determine height
        const r = patternData[pixelIndex]
        const g = patternData[pixelIndex + 1]
        const b = patternData[pixelIndex + 2]
        const brightness = (r + g + b) / (3 * 255)
        
        // Bright areas are raised, dark areas are recessed
        let height = pileHeight * (0.3 + brightness * 0.7) // Range: 0.3 to 1.0 of pile height
        
        // Add subtle fiber texture
        height += this.noise(x * 0.5, y * 0.5) * fiberVariation * 0.5
        height += this.noise(x * 1.2, y * 1.2) * fiberVariation * 0.3
        
        // Clamp and convert to 0-255
        height = Math.max(0, Math.min(1, height))
        heightData[index] = Math.floor(height * 255)
      }
    }
    
    return heightData
  }
  
  /**
   * Sample height data with boundary clamping
   */
  private sampleHeight(heightData: Uint8ClampedArray, x: number, y: number, width: number, height: number): number {
    // Clamp coordinates to image bounds
    x = Math.max(0, Math.min(width - 1, x))
    y = Math.max(0, Math.min(height - 1, y))
    
    const index = y * width + x
    return heightData[index] / 255.0 // Normalize to 0-1
  }
  
  /**
   * Simple noise function for fiber texture
   */
  private noise(x: number, y: number): number {
    // Simple pseudo-random noise based on coordinates
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return (n - Math.floor(n)) * 2 - 1 // Return -1 to 1
  }
  
  /**
   * Create a THREE.js texture from image data
   */
  private createTextureFromImageData(data: Uint8ClampedArray, width: number, height: number): THREE.Texture {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get canvas context')
    }
    
    const imageData = ctx.createImageData(width, height)
    imageData.data.set(data)
    ctx.putImageData(imageData, 0, 0)
    
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    
    return texture
  }
}