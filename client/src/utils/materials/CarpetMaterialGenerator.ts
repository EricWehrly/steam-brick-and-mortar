import * as THREE from 'three'
import type { MaterialOptions } from './MaterialBase'
import { BaseMaterialGenerator } from './BaseMaterialGenerator'
import { TextureLoader } from './TextureLoader'
import { CarpetTextureGenerator } from '../textures/CarpetTextureGenerator'

export interface CarpetMaterialOptions extends MaterialOptions {
  diffuseUrl?: string
  normalUrl?: string
  color?: THREE.Color | string
  roughness?: number
  metalness?: number
}

export interface ProceduralCarpetMaterialOptions extends MaterialOptions {
  color?: string
  roughness?: number
  metalness?: number
}

export interface EnhancedProceduralCarpetMaterialOptions extends MaterialOptions {
  color?: string
  fiberDensity?: number
  roughness?: number
  metalness?: number
}

/**
 * Carpet material generator
 */
export class CarpetMaterialGenerator extends BaseMaterialGenerator {
  private textureLoader: TextureLoader
  private carpetTextureGenerator: CarpetTextureGenerator

  constructor() {
    super()
    this.textureLoader = TextureLoader.getInstance()
    this.carpetTextureGenerator = new CarpetTextureGenerator()
  }

  /**
   * Create a carpet material from texture files
   */
  public async createMaterial(options: CarpetMaterialOptions = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      diffuseUrl,
      normalUrl,
      repeat = { x: 4, y: 4 },
      color = new THREE.Color(0x8B0000)
    } = options

    const colorStr = color instanceof THREE.Color ? `#${color.getHexString()}` : color
    const cacheKey = `carpet_${diffuseUrl || 'none'}_${normalUrl || 'none'}_${repeat.x}_${repeat.y}_${colorStr}`
    
    return this.getCachedMaterial(cacheKey, async () => {
      const material = new THREE.MeshStandardMaterial({
        color: color instanceof THREE.Color ? color : new THREE.Color(color),
        roughness: 0.9,
        metalness: 0.0
      })

      if (diffuseUrl) {
        const diffuseTexture = await this.textureLoader.loadTexture(diffuseUrl)
        this.applyTextureOptions(diffuseTexture, { repeat })
        material.map = diffuseTexture
      }

      if (normalUrl) {
        const normalTexture = await this.textureLoader.loadTexture(normalUrl)
        this.applyTextureOptions(normalTexture, { repeat })
        material.normalMap = normalTexture
      }

      return material
    })
  }

  /**
   * Create a carpet material using basic procedural textures
   * NOTE: Using enhanced textures by default for Phase 1 development to test quality limits
   */
  public createProceduralMaterial(options: ProceduralCarpetMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 4, y: 4 },
      color = '#8B0000',
      roughness = 0.9,
      metalness = 0.0
    } = options

    const cacheKey = `proc_carpet_${repeat.x}_${repeat.y}_${color}_${roughness}`
    
    return this.getCachedMaterial(cacheKey, () => {
      // Create enhanced procedural textures by default for Phase 1 development
      const diffuseTexture = this.carpetTextureGenerator.createEnhancedTexture({
        color,
        fiberDensity: 0.4,
        roughness: 0.8
      })
      this.applyTextureOptions(diffuseTexture, { repeat })

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        roughness,
        metalness,
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Create an enhanced carpet material with realistic fiber patterns
   */
  public createEnhancedProceduralMaterial(options: EnhancedProceduralCarpetMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 4, y: 4 },
      color = '#8B0000',
      fiberDensity = 0.4,
      roughness = 0.9,
      metalness = 0.0
    } = options

    const cacheKey = `enhanced_proc_carpet_${repeat.x}_${repeat.y}_${color}_${fiberDensity}_${roughness}`
    
    return this.getCachedMaterial(cacheKey, () => {
      const diffuseTexture = this.carpetTextureGenerator.createEnhancedTexture({
        color,
        fiberDensity,
        roughness: 0.8
      })
      this.applyTextureOptions(diffuseTexture, { repeat })

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        roughness,
        metalness,
      })
    }) as THREE.MeshStandardMaterial
  }
}
