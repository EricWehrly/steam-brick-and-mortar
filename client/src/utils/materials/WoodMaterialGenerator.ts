import * as THREE from 'three'
import type { MaterialOptions } from './MaterialBase'
import { BaseMaterialGenerator } from './BaseMaterialGenerator'
import { TextureLoader } from './TextureLoader'
import { WoodTextureGenerator } from '../textures/WoodTextureGenerator'
import { BlockbusterColors } from '../Colors'

export interface WoodMaterialOptions extends MaterialOptions {
  color?: THREE.Color
  diffuseUrl?: string
  normalUrl?: string
  roughnessUrl?: string
}

export interface SimpleWoodMaterialOptions extends MaterialOptions {
  color?: THREE.Color
}

export interface ProceduralWoodMaterialOptions extends MaterialOptions {
  color1?: string
  color2?: string
  grainStrength?: number
}

export interface EnhancedProceduralWoodMaterialOptions extends ProceduralWoodMaterialOptions {
  ringFrequency?: number
  color3?: string
}

export interface MDFVeneerMaterialOptions extends MaterialOptions {
  veneerColor?: string
  glossiness?: number  // For semi-gloss finish
  grainSubtlety?: number  // Subtle grain pattern
}

export interface ShelfInteriorMaterialOptions extends MaterialOptions {
  glossLevel?: number  // High gloss for white interiors
}

export interface BrandAccentMaterialOptions extends MaterialOptions {
  brandColor?: string
  glossLevel?: number  // For brand blue accents
}

/**
 * Wood material generator
 */
export class WoodMaterialGenerator extends BaseMaterialGenerator {
  private textureLoader: TextureLoader
  private woodTextureGenerator: WoodTextureGenerator

  constructor() {
    super()
    this.textureLoader = TextureLoader.getInstance()
    this.woodTextureGenerator = new WoodTextureGenerator()
  }

  /**
   * Create a wood material with PBR properties from texture files
   */
  public createMaterial(options: WoodMaterialOptions = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      diffuseUrl = '/textures/wood/wood_diffuse.jpg',
      normalUrl = '/textures/wood/wood_normal.jpg',
      roughnessUrl = '/textures/wood/wood_roughness.jpg',
      repeat = { x: 1, y: 1 },
      color = new THREE.Color(0x8B4513),
      roughness = 0.8,
      metalness = 0.1
    } = options

    const cacheKey = `wood_${diffuseUrl}_${normalUrl}_${roughnessUrl}_${repeat.x}_${repeat.y}`
    
    return this.getCachedMaterial(cacheKey, async () => {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
      })

      try {
        // Load diffuse texture
        if (diffuseUrl) {
          const diffuseTexture = await this.textureLoader.loadTexture(diffuseUrl, { repeat })
          material.map = diffuseTexture
        }

        // Load normal map
        if (normalUrl) {
          const normalTexture = await this.textureLoader.loadTexture(normalUrl, { repeat })
          material.normalMap = normalTexture
        }

        // Load roughness map
        if (roughnessUrl) {
          const roughnessTexture = await this.textureLoader.loadTexture(roughnessUrl, { repeat })
          material.roughnessMap = roughnessTexture
        }

      } catch (error) {
        console.warn('Some wood textures failed to load, using base material:', error)
      }

      return material
    }) as Promise<THREE.MeshStandardMaterial>
  }

  /**
   * Create a simple wood material without textures (for development/testing)
   */
  public createSimpleMaterial(options: SimpleWoodMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      color = new THREE.Color(0x8B4513),
      roughness = 0.8,
      metalness = 0.1
    } = options

    const cacheKey = `simple_wood_${color.getHex()}`
    
    return this.getCachedMaterial(cacheKey, () => {
      return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Create a wood material using procedural textures (no file dependencies)
   * NOTE: Using enhanced textures by default for Phase 1 development to test quality limits
   */
  public createProceduralMaterial(options: ProceduralWoodMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#8B4513',
      color2 = '#A0522D',
      grainStrength = 0.3,
      roughness = 0.8,
      metalness = 0.1
    } = options

    const cacheKey = `proc_wood_${repeat.x}_${repeat.y}_${color1}_${color2}_${grainStrength}`
    
    return this.getCachedMaterial(cacheKey, () => {
      // Create enhanced procedural textures by default for Phase 1 development
      const diffuseTexture = this.woodTextureGenerator.createEnhancedTexture({
        grainStrength,
        ringFrequency: 0.08,
        color1,
        color2,
        color3: '#654321'
      })
      this.applyTextureOptions(diffuseTexture, { repeat })

      const normalTexture = this.woodTextureGenerator.createNormalMap({
        strength: grainStrength * 0.6  // Enhanced strength for better visual feedback
      })
      this.applyTextureOptions(normalTexture, { repeat })

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        normalMap: normalTexture,
        roughness,
        metalness,
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Create enhanced procedural wood material with realistic grain patterns
   */
  public createEnhancedProceduralMaterial(options: EnhancedProceduralWoodMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      grainStrength = 0.4,
      ringFrequency = 0.08,
      color1 = '#8B4513',
      color2 = '#A0522D',
      color3 = '#654321',
      roughness = 0.8,
      metalness = 0.1
    } = options

    const cacheKey = `enhanced_proc_wood_${repeat.x}_${repeat.y}_${grainStrength}_${ringFrequency}_${color1}_${color2}_${color3}`
    
    return this.getCachedMaterial(cacheKey, () => {
      // Create enhanced procedural texture
      const diffuseTexture = this.woodTextureGenerator.createEnhancedTexture({
        grainStrength,
        ringFrequency,
        color1,
        color2,
        color3
      })
      this.applyTextureOptions(diffuseTexture, { repeat })

      // Create normal map for wood grain depth
      const normalTexture = this.woodTextureGenerator.createNormalMap({
        strength: grainStrength * 0.6
      })
      this.applyTextureOptions(normalTexture, { repeat })

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        normalMap: normalTexture,
        roughness,
        metalness,
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Create MDF veneer material with realistic characteristics
   * - Light oak veneer appearance over MDF core
   * - Subtle wood grain (less pronounced than solid wood)
   * - Semi-gloss finish typical of prefab shelving
   */
  public createMDFVeneerMaterial(options: MDFVeneerMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 2, y: 1 },
      veneerColor = '#E6D3B7',  // Light oak veneer
      glossiness = 0.4,  // Semi-gloss finish
      grainSubtlety = 0.2,  // Subtle grain pattern
      roughness = 0.5,  // Semi-gloss surface
      metalness = 0.0
    } = options

    const cacheKey = `mdf_veneer_${repeat.x}_${repeat.y}_${veneerColor}_${glossiness}_${grainSubtlety}`
    
    return this.getCachedMaterial(cacheKey, () => {
      // Create subtle veneer texture
      const diffuseTexture = this.woodTextureGenerator.createEnhancedTexture({
        grainStrength: grainSubtlety,  // Very subtle grain
        ringFrequency: 0.05,  // Minimal ring patterns
        color1: veneerColor,
        color2: this.adjustColorBrightness(veneerColor, -0.1),  // Slightly darker variation
        color3: this.adjustColorBrightness(veneerColor, 0.05)   // Slightly lighter variation
      })
      this.applyTextureOptions(diffuseTexture, { repeat })

      // Very light normal map for smooth veneer finish
      const normalTexture = this.woodTextureGenerator.createNormalMap({
        strength: grainSubtlety * 0.3  // Very subtle surface variation
      })
      this.applyTextureOptions(normalTexture, { repeat })

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        normalMap: normalTexture,
        roughness,
        metalness,
        color: new THREE.Color(veneerColor)
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Create glossy white interior material for shelf compartments
   */
  public createShelfInteriorMaterial(options: ShelfInteriorMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      glossLevel = 0.8,  // High gloss
      roughness = 0.2,   // Very smooth
      metalness = 0.0
    } = options

    const cacheKey = `shelf_interior_${glossLevel}`
    
    return this.getCachedMaterial(cacheKey, () => {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(BlockbusterColors.shelfInterior),
        roughness,
        metalness,
        // Add slight emissive for bright white appearance
        emissive: new THREE.Color(BlockbusterColors.shelfInterior),
        emissiveIntensity: 0.05
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Create brand blue accent material for support posts and brackets
   */
  public createBrandAccentMaterial(options: BrandAccentMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      brandColor = '#0066CC',
      glossLevel = 0.7,  // Semi-gloss
      roughness = 0.3,   // Smooth finish
      metalness = 0.1    // Slight metallic look
    } = options

    const cacheKey = `brand_accent_${brandColor}_${glossLevel}`
    
    return this.getCachedMaterial(cacheKey, () => {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(brandColor),
        roughness,
        metalness,
        // Add slight emissive for vibrant color
        emissive: new THREE.Color(brandColor),
        emissiveIntensity: 0.02
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Helper method to adjust color brightness
   */
  private adjustColorBrightness(hexColor: string, adjustment: number): string {
    const color = new THREE.Color(hexColor)
    const hsl = { h: 0, s: 0, l: 0 }
    color.getHSL(hsl)
    hsl.l = Math.max(0, Math.min(1, hsl.l + adjustment))
    color.setHSL(hsl.h, hsl.s, hsl.l)
    return '#' + color.getHexString()
  }
}
