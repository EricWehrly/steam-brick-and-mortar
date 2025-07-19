import * as THREE from 'three'
import type { MaterialOptions } from './MaterialBase'
import { BaseMaterialGenerator } from './BaseMaterialGenerator'
import { TextureLoader } from './TextureLoader'
import { WoodTextureGenerator } from '../textures/WoodTextureGenerator'

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
      // Create procedural textures
      const diffuseTexture = this.woodTextureGenerator.createTexture({
        color1,
        color2,
        grainStrength
      })
      diffuseTexture.repeat.set(repeat.x, repeat.y)

      const normalTexture = this.woodTextureGenerator.createNormalMap({
        strength: grainStrength * 0.5
      })
      normalTexture.repeat.set(repeat.x, repeat.y)

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
      diffuseTexture.repeat.set(repeat.x, repeat.y)

      // Create normal map for wood grain depth
      const normalTexture = this.woodTextureGenerator.createNormalMap({
        strength: grainStrength * 0.6
      })
      normalTexture.repeat.set(repeat.x, repeat.y)

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        normalMap: normalTexture,
        roughness,
        metalness,
      })
    }) as THREE.MeshStandardMaterial
  }
}
