import * as THREE from 'three'
import type { MaterialOptions } from './MaterialBase'
import { BaseMaterialGenerator } from './BaseMaterialGenerator'
import { TextureLoader } from './TextureLoader'
import { CeilingTextureGenerator } from '../textures/CeilingTextureGenerator'

export interface CeilingMaterialOptions extends MaterialOptions {
  diffuseUrl?: string
  normalUrl?: string
  color?: THREE.Color | string
  roughness?: number
  metalness?: number
}

export interface ProceduralCeilingMaterialOptions extends MaterialOptions {
  color?: string
  bumpiness?: number
  roughness?: number
}

export interface EnhancedProceduralCeilingMaterialOptions extends MaterialOptions {
  color?: string
  bumpSize?: number
  density?: number
  roughness?: number
}

/**
 * Ceiling material generator
 */
export class CeilingMaterialGenerator extends BaseMaterialGenerator {
  private textureLoader: TextureLoader
  private ceilingTextureGenerator: CeilingTextureGenerator

  constructor() {
    super()
    this.textureLoader = TextureLoader.getInstance()
    this.ceilingTextureGenerator = new CeilingTextureGenerator()
  }

  /**
   * Create a ceiling material from texture files
   */
  public async createMaterial(options: CeilingMaterialOptions = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      diffuseUrl,
      normalUrl,
      repeat = { x: 2, y: 2 },
      color = new THREE.Color(0xF5F5DC)
    } = options

    const colorStr = color instanceof THREE.Color ? color.getHexString() : color
    const cacheKey = `ceiling_${diffuseUrl || 'none'}_${normalUrl || 'none'}_${repeat.x}_${repeat.y}_${colorStr}`
    
    return this.getCachedMaterial(cacheKey, async () => {
      const material = new THREE.MeshStandardMaterial({
        color: color instanceof THREE.Color ? color : new THREE.Color(color),
        roughness: 0.7,
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
   * Create a ceiling material using basic procedural textures
   */
  public createProceduralMaterial(options: ProceduralCeilingMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 2, y: 2 },
      color = '#F5F5DC',
      bumpiness = 0.4,
      roughness = 0.7
    } = options

    const cacheKey = `proc_ceiling_${repeat.x}_${repeat.y}_${color}_${bumpiness}`
    
    return this.getCachedMaterial(cacheKey, () => {
      const diffuseTexture = this.ceilingTextureGenerator.createTexture({
        color,
        bumpiness
      })
      this.applyTextureOptions(diffuseTexture, { repeat })

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        roughness,
        metalness: 0.0,
      })
    }) as THREE.MeshStandardMaterial
  }

  /**
   * Create an enhanced ceiling material with realistic popcorn texture
   */
  public createEnhancedProceduralMaterial(options: EnhancedProceduralCeilingMaterialOptions = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 2, y: 2 },
      color = '#F5F5DC',
      bumpSize = 0.5,
      density = 0.7,
      roughness = 0.7
    } = options

    const cacheKey = `enhanced_proc_ceiling_${repeat.x}_${repeat.y}_${color}_${bumpSize}_${density}`
    
    return this.getCachedMaterial(cacheKey, () => {
      const diffuseTexture = this.ceilingTextureGenerator.createEnhancedTexture({
        color,
        bumpSize,
        density
      })
      this.applyTextureOptions(diffuseTexture, { repeat })

      return new THREE.MeshStandardMaterial({
        map: diffuseTexture,
        roughness,
        metalness: 0.0,
      })
    }) as THREE.MeshStandardMaterial
  }
}
