import * as THREE from 'three'
import { BasePatternGenerator } from './patterns/BasePatternGenerator'
import type { PatternOptions } from './patterns/BasePatternGenerator'
import { ClassicCarpetPatternGenerator } from './patterns/ClassicCarpetPatternGenerator'
import { GeometricPatternGenerator } from './patterns/GeometricPatternGenerator'
import type { ClassicCarpetOptions } from './patterns/ClassicCarpetPatternGenerator'
import type { GeometricPatternOptions } from './patterns/GeometricPatternGenerator'
import { CarpetNormalMapGenerator } from './CarpetNormalMapGenerator'

export interface CarpetStyleConfig {
  patternType: 'classic' | 'geometric' | 'retro' | 'steam'
  variant?: string
  colors?: string[]
  scale?: number
  density?: number
  seed?: number
  distribution?: number // 0.0 (clustered) to 1.0 (evenly distributed)
  sharpness?: number   // 0.0 (soft/blurred) to 1.0 (sharp/crisp)
  resolution?: number  // Texture resolution: 256, 512, 1024, or 2048
  normalMapIntensity?: number // 0.0 (flat) to 1.0 (deep pile/texture)
  debugMode?: 'normal' | 'normal-map-only' | 'height-data' // Debug visualization modes
  // TODO: Add color temperature slider (warm/cool color shifting)
}

export interface ProceduralCarpetOptions {
  width?: number
  height?: number
  style: CarpetStyleConfig
}

/**
 * Main orchestrator for procedural carpet pattern generation
 * Coordinates different pattern generators and provides a unified interface
 */
export class ProceduralCarpetPatternGenerator {
  private patternGenerators: Map<string, BasePatternGenerator>
  private textureCache = new Map<string, THREE.Texture>()
  private normalMapGenerator: CarpetNormalMapGenerator
  // Store the last generated base texture for debug mode consistency
  private lastBaseTexture: THREE.Texture | null = null
  private lastBaseOptions: ProceduralCarpetOptions | null = null

  constructor() {
    this.patternGenerators = new Map()
    this.textureCache = new Map()
    this.normalMapGenerator = new CarpetNormalMapGenerator()
    
    this.initializeGenerators()
  }

  /**
   * Generate a carpet texture based on style configuration
   */
  public generateCarpetTexture(options: ProceduralCarpetOptions): THREE.Texture {
    const { style } = options
    
    // Use resolution from style config if available, otherwise use options or defaults
    const resolution = style.resolution || options.width || options.height || 512
    const width = resolution
    const height = resolution // Keep textures square as requested
    
    // Create cache key
    const cacheKey = this.createCacheKey(width, height, style)
    
    // Return cached texture if available
    if (this.textureCache.has(cacheKey)) {
      const cachedTexture = this.textureCache.get(cacheKey)
      if (cachedTexture) {
        return cachedTexture
      }
    }

    // Generate new texture
    const texture = this.createTexture(width, height, style)
    
    // Cache the result
    this.textureCache.set(cacheKey, texture)
    
    return texture
  }

  /**
   * Get available pattern types
   */
  public getAvailablePatterns(): string[] {
    return Array.from(this.patternGenerators.keys())
  }

  /**
   * Get default style configurations for each pattern type
   */
  public getDefaultStyles(): Record<string, CarpetStyleConfig> {
    return {
      classic: {
        patternType: 'classic',
        variant: 'diamond',
        colors: ['#8B0000', '#800020', '#722F37'],
        scale: 1.0,
        density: 0.4
      },
      '80s-arcade-standard': {
        patternType: 'geometric',
        variant: 'standard',
        colors: ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
        scale: 1.0,
        density: 0.6
      },
      '80s-arcade-bubble': {
        patternType: 'geometric',
        variant: 'bubble-font',
        colors: ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
        scale: 0.8,
        density: 0.4
      },
      '80s-arcade-escher': {
        patternType: 'geometric',
        variant: 'non-euclidean',
        colors: ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
        scale: 1.2,
        density: 0.3
      },
      '80s-arcade-abstract': {
        patternType: 'geometric',
        variant: 'abstract',
        colors: ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
        scale: 1.5,
        density: 0.5
      }
    }
  }

  /**
   * Generate a normal map for the carpet based on pattern and style
   */
  public generateCarpetNormalMap(options: ProceduralCarpetOptions, existingTexture?: THREE.Texture): THREE.Texture | null {
    const { style } = options
    const normalMapIntensity = style.normalMapIntensity || 0.0
    
    // Skip normal map generation if intensity is 0
    if (normalMapIntensity <= 0) {
      return null
    }
    
    // Use resolution from style config if available
    const resolution = style.resolution || options.width || options.height || 512
    const width = resolution
    const height = resolution
    
    // Use existing texture if provided, otherwise generate new one (but this causes mismatch!)
    const diffuseTexture = existingTexture || this.generateCarpetTexture(options)
    console.log(`🗺️ NORMAL MAP GEN - Using ${existingTexture ? 'PROVIDED' : 'NEW'} texture - ID: ${diffuseTexture.id}`)
    
    // Extract image data from the diffuse texture
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      console.warn('Could not create canvas context for normal map generation')
      return null
    }
    
    // Draw the diffuse texture to extract pixel data
    if (diffuseTexture.image) {
      ctx.drawImage(diffuseTexture.image, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height)
      
      console.log(`🗺️ Generating normal map from diffuse texture pixels - Pattern: ${style.patternType}, Resolution: ${width}x${height}`)
      
      // Generate height data from diffuse texture pixel data (consistent for all pattern types)
      const heightData = this.normalMapGenerator.generateGeometricHeightData(width, height, imageData.data, {
        pileHeight: normalMapIntensity,
        fiberVariation: style.patternType === 'classic' ? 0.15 : 0.1 // More variation for classic patterns
      })
      
      // Convert height data to normal map with amplified intensity
      const normalMapTexture = this.normalMapGenerator.generateNormalMapFromHeightData(heightData, width, height, {
        intensity: normalMapIntensity * 3.0 // Amplify the effect for more visible results
      })
      
      return normalMapTexture
    }
    
    return null
  }

  /**
   * Generate a height data visualization texture for debugging
   */
  public generateHeightDataTexture(options: ProceduralCarpetOptions, baseTexture?: THREE.Texture | null): THREE.Texture {
    const { style } = options
    const resolution = style.resolution || options.width || options.height || 512
    const width = resolution
    const height = resolution
    
    let heightData: Uint8ClampedArray
    
    // Use provided base texture or generate new one
    console.log(`🗺️ HEIGHT DATA GEN - Pattern: ${options.style.patternType}, Seed: ${options.style.seed}`)
    
    let diffuseTexture: THREE.Texture
    if (baseTexture) {
      diffuseTexture = baseTexture
      console.log(`🗺️ REUSING provided base texture for height data - ID: ${diffuseTexture.id}`)
    } else {
      diffuseTexture = this.generateCarpetTexture(options)
      console.log(`🗺️ Generated NEW diffuse texture for height data - ID: ${diffuseTexture.id}`)
    }
    if (diffuseTexture.image) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(diffuseTexture.image, 0, 0, width, height)
        const imageData = ctx.getImageData(0, 0, width, height)
        heightData = this.normalMapGenerator.generateGeometricHeightData(width, height, imageData.data, {
          pileHeight: style.normalMapIntensity || 0.5,
          fiberVariation: style.patternType === 'classic' ? 0.15 : 0.1 // More variation for classic patterns
        })
        console.log(`🗺️ Height data generated from diffuse texture for debug visualization - Pattern: ${style.patternType}`)
      } else {
        heightData = new Uint8ClampedArray(width * height).fill(128)
      }
    } else {
      heightData = new Uint8ClampedArray(width * height).fill(128)
    }
    
    // Convert height data to grayscale texture
    const rgbaData = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < heightData.length; i++) {
      const heightValue = heightData[i]
      rgbaData[i * 4] = heightValue     // R
      rgbaData[i * 4 + 1] = heightValue // G
      rgbaData[i * 4 + 2] = heightValue // B
      rgbaData[i * 4 + 3] = 255         // A
    }
    
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(width, height)
    imageData.data.set(rgbaData)
    ctx.putImageData(imageData, 0, 0)
    
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    return texture
  }

  /**
   * Create a material using the generated texture and optional normal map
   */
  public createCarpetMaterial(options: ProceduralCarpetOptions & {
    roughness?: number
    metalness?: number
    repeat?: { x: number, y: number }
  }): THREE.MeshStandardMaterial {
    const {
      roughness = 0.9,
      metalness = 0.0,
      repeat = { x: 1, y: 1 }
    } = options

    const debugMode = options.style.debugMode || 'normal'
    
    // Handle debug modes
    if (debugMode === 'normal-map-only') {
      // Use cached base texture if available and matches current options
      console.log(`🔬 DEBUG MODE: normal-map-only - Pattern: ${options.style.patternType}, Seed: ${options.style.seed}`)
      
      let texture: THREE.Texture
      if (this.lastBaseTexture && this.lastBaseOptions && this.optionsMatch(options, this.lastBaseOptions)) {
        texture = this.lastBaseTexture
        console.log(`🔬 REUSING cached base texture for normal-map-only - ID: ${texture.id}`)
      } else {
        texture = this.generateCarpetTexture(options)
        console.log(`🔬 Generated NEW base texture for normal-map-only - ID: ${texture.id}`)
      }
      
      const normalMap = this.generateCarpetNormalMap(options, texture)
      console.log(`🔬 Generated normal map from base texture - ID: ${normalMap?.id || 'null'}`)
      if (normalMap) {
        normalMap.wrapS = THREE.RepeatWrapping
        normalMap.wrapT = THREE.RepeatWrapping
        normalMap.repeat.set(repeat.x, repeat.y)
        return new THREE.MeshStandardMaterial({
          map: normalMap,
          roughness: 0.5,
          metalness: 0.0
        })
      }
    } else if (debugMode === 'height-data') {
      console.log(`🔬 DEBUG MODE: height-data - Pattern: ${options.style.patternType}, Seed: ${options.style.seed}`)
      const heightTexture = this.generateHeightDataTexture(options, this.lastBaseTexture)
      console.log(`🔬 Generated height data texture - ID: ${heightTexture.id}`)
      heightTexture.wrapS = THREE.RepeatWrapping
      heightTexture.wrapT = THREE.RepeatWrapping
      heightTexture.repeat.set(repeat.x, repeat.y)
      return new THREE.MeshStandardMaterial({
        map: heightTexture,
        roughness: 0.5,
        metalness: 0.0
      })
    }

    // Normal mode - regular carpet with optional normal map

    const texture = this.generateCarpetTexture(options)
    
    // Store base texture and options for debug mode consistency
    this.lastBaseTexture = texture
    this.lastBaseOptions = options
    
    console.log(`🎨 Diffuse texture generated - ID: ${texture.id}`)
    const normalMap = this.generateCarpetNormalMap(options, texture) // Pass same texture to ensure pattern consistency
    console.log(`🎨 Normal map generated - ID: ${normalMap?.id || 'null'}}`)
    
    // Apply texture settings
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat.x, repeat.y)

    const materialOptions: THREE.MeshStandardMaterialParameters = {
      map: texture,
      roughness, // Keep existing roughness (0.9 is good for carpet)
      metalness  // Keep existing metalness (0.0 is correct for carpet)
    }

    // Add normal map if generated and intensity > 0
    if (normalMap && (options.style.normalMapIntensity || 0) > 0) {
      normalMap.wrapS = THREE.RepeatWrapping
      normalMap.wrapT = THREE.RepeatWrapping
      normalMap.repeat.set(repeat.x, repeat.y)
      materialOptions.normalMap = normalMap
      
      // Boost normal map scale for visible effect (tuned down from 12x to 9.6x)
      const boostedIntensity = (options.style.normalMapIntensity || 0.5) * 9.6 // 9.6x amplification (80% of 12x)
      materialOptions.normalScale = new THREE.Vector2(boostedIntensity, boostedIntensity)
      
      // Enhance material properties for better normal map interaction
      materialOptions.roughness = Math.max(0.7, roughness) // Ensure minimum roughness for normal map effect
      materialOptions.envMapIntensity = 0.1 // Subtle environment reflections
      
      console.log(`🗺️ Normal map applied with BOOSTED intensity: ${boostedIntensity} (original: ${options.style.normalMapIntensity})`)
      console.log(`🗺️ Material optimized for normal maps: roughness=${materialOptions.roughness}, metalness=${materialOptions.metalness}`)
    } else {
      console.log(`🗺️ No normal map applied (intensity: ${options.style.normalMapIntensity || 0})`)
    }

    return new THREE.MeshStandardMaterial(materialOptions)
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
   * Initialize pattern generators
   */
  private initializeGenerators(): void {
    this.patternGenerators.set('classic', new ClassicCarpetPatternGenerator())
    this.patternGenerators.set('geometric', new GeometricPatternGenerator())
    // Additional generators will be added here as they're implemented
  }

  /**
   * Create texture using the appropriate pattern generator
   */
  private createTexture(width: number, height: number, style: CarpetStyleConfig): THREE.Texture {
    const generator = this.patternGenerators.get(style.patternType)
    if (!generator) {
      throw new Error(`Pattern generator not found for type: ${style.patternType}`)
    }

    // Convert style config to pattern options
    const patternOptions = this.styleToPatternOptions(width, height, style)
    console.log(`🎲 CREATE TEXTURE - Pattern: ${style.patternType}, Seed: ${patternOptions.seed}, Size: ${width}x${height}`)
    
    const texture = generator.createTexture(patternOptions)
    console.log(`🎲 TEXTURE CREATED - ID: ${texture.id}`)
    return texture
  }

  /**
   * Generate a consistent seed based on style parameters
   */
  private getConsistentSeed(style: CarpetStyleConfig): number {
    // Create a hash from style parameters for consistent seeding
    const hashStr = `${style.patternType}-${style.variant}-${style.scale || 1.0}-${style.density || 0.5}-${style.distribution || 0.5}-${style.sharpness || 0.7}`
    let hash = 0
    for (let i = 0; i < hashStr.length; i++) {
      const char = hashStr.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Check if two options objects represent the same pattern configuration
   */
  private optionsMatch(options1: ProceduralCarpetOptions, options2: ProceduralCarpetOptions): boolean {
    const style1 = options1.style
    const style2 = options2.style
    
    return (
      style1.patternType === style2.patternType &&
      style1.variant === style2.variant &&
      style1.scale === style2.scale &&
      style1.density === style2.density &&
      style1.distribution === style2.distribution &&
      style1.sharpness === style2.sharpness &&
      style1.seed === style2.seed
    )
  }

  /**
   * Convert style configuration to pattern-specific options
   */
  private styleToPatternOptions(width: number, height: number, style: CarpetStyleConfig): PatternOptions {
    const baseOptions: PatternOptions = {
      width,
      height,
      scale: style.scale || 1.0,
      seed: style.seed || this.getConsistentSeed(style), // Use consistent seed for same style
      colors: style.colors || [],
      distribution: style.distribution || 0.5,
      sharpness: style.sharpness || 0.7,
      normalMapIntensity: style.normalMapIntensity || 0.0
    }

    switch (style.patternType) {
      case 'classic':
        return {
          ...baseOptions,
          backgroundColor: style.colors?.[0] || '#8B0000',
          backgroundStyle: 'solid',
          fiberDensity: style.density || 0.4,
          geometricIntensity: 0.1,
          patternType: style.variant || 'diamond'
        } as ClassicCarpetOptions

      case 'geometric':
        return {
          ...baseOptions,
          backgroundColor: '#000000',
          backgroundStyle: style.variant === 'bubble-font' ? 'gradient' : 'solid',
          variant: style.variant || 'standard',
          glowIntensity: 8,
          density: style.density || 0.5,
          shapeCount: undefined // Let generator calculate based on density
        } as GeometricPatternOptions

      default:
        return baseOptions
    }
  }

  /**
   * Generate height data for classic carpet patterns
   */
  private generateClassicHeightData(width: number, height: number, intensity: number, style: CarpetStyleConfig): Uint8ClampedArray {
    const heightData = new Uint8ClampedArray(width * height)
    const density = style.density || 0.4
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        
        // Base carpet pile height
        let height = intensity * 0.7 // Base pile
        
        // Add fiber variation based on density
        const fiberVariation = density * 0.3
        height += this.simpleNoise(x * 0.1, y * 0.1) * fiberVariation * 0.5
        height += this.simpleNoise(x * 0.3, y * 0.3) * fiberVariation * 0.3
        height += this.simpleNoise(x * 0.8, y * 0.8) * fiberVariation * 0.2
        
        // Add subtle pattern variations based on variant
        if (style.variant === 'diamond' || style.variant === 'rectangle') {
          const patternScale = (style.scale || 1.0) * 40
          const patternX = (x % patternScale) / patternScale
          const patternY = (y % patternScale) / patternScale
          
          let patternHeight = 0
          if (style.variant === 'diamond') {
            // Diamond pattern creates subtle height variations
            patternHeight = Math.abs(patternX - 0.5) + Math.abs(patternY - 0.5) - 0.5
          } else {
            // Rectangle pattern
            patternHeight = (patternX < 0.3 || patternX > 0.7) && (patternY < 0.3 || patternY > 0.7) ? 0.2 : -0.1
          }
          height += patternHeight * intensity * 0.2
        }
        
        // Clamp and convert to 0-255
        height = Math.max(0, Math.min(1, height))
        heightData[index] = Math.floor(height * 255)
      }
    }
    
    return heightData
  }

  /**
   * Simple noise function for height generation
   */
  private simpleNoise(x: number, y: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return (n - Math.floor(n)) * 2 - 1 // Return -1 to 1
  }

  /**
   * Create cache key for texture caching
   */
  private createCacheKey(width: number, height: number, style: CarpetStyleConfig): string {
    const styleStr = JSON.stringify(style)
    return `carpet_${width}_${height}_${styleStr}`
  }
}