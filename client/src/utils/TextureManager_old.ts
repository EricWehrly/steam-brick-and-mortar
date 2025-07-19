import * as THREE from 'three'
import { 
  WoodMaterialGenerator, 
  CarpetMaterialGenerator, 
  CeilingMaterialGenerator,
  TextureLoader,
  type WoodMaterialOptions,
  type SimpleWoodMaterialOptions,
  type ProceduralWoodMaterialOptions,
  type EnhancedProceduralWoodMaterialOptions,
  type CarpetMaterialOptions,
  type ProceduralCarpetMaterialOptions,
  type EnhancedProceduralCarpetMaterialOptions,
  type CeilingMaterialOptions,
  type ProceduralCeilingMaterialOptions,
  type EnhancedProceduralCeilingMaterialOptions
} from './materials'

/**
 * Manages texture loading and material creation for the WebXR environment
 * Optimized for VR performance with proper texture formats and LOD
 */
export class TextureManager {
  private static instance: TextureManager
  private textureLoader: TextureLoader
  private woodMaterialGenerator: WoodMaterialGenerator
  private carpetMaterialGenerator: CarpetMaterialGenerator
  private ceilingMaterialGenerator: CeilingMaterialGenerator

  private constructor() {
    this.textureLoader = TextureLoader.getInstance()
    this.woodMaterialGenerator = new WoodMaterialGenerator()
    this.carpetMaterialGenerator = new CarpetMaterialGenerator()
    this.ceilingMaterialGenerator = new CeilingMaterialGenerator()
  }

  public static getInstance(): TextureManager {
    if (!TextureManager.instance) {
      TextureManager.instance = new TextureManager()
    }
    return TextureManager.instance
  }

  /**
   * Load a texture with caching
   */
  public async loadTexture(url: string): Promise<THREE.Texture> {
    return this.textureLoader.loadTexture(url)
  }

  // === WOOD MATERIALS ===

  /**
   * Create a wood material from texture files
   */
  public async createWoodMaterial(options: WoodMaterialOptions = {}): Promise<THREE.MeshStandardMaterial> {
    return this.woodMaterialGenerator.createMaterial(options)
  }

  /**
   * Create a simple wood material with solid color
   */
  public createSimpleWoodMaterial(options: SimpleWoodMaterialOptions = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createSimpleMaterial(options)
  }

  /**
   * Create a wood material using procedural textures (no file dependencies)
   */
  public createProceduralWoodMaterial(options: ProceduralWoodMaterialOptions = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createProceduralMaterial(options)
  }

  /**
   * Create enhanced procedural wood material with realistic grain patterns
   */
  public createEnhancedProceduralWoodMaterial(options: EnhancedProceduralWoodMaterialOptions = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createEnhancedProceduralMaterial(options)
  }

  // === CARPET MATERIALS ===

  /**
   * Create a carpet material from texture files
   */
  public async createCarpetMaterial(options: CarpetMaterialOptions = {}): Promise<THREE.MeshStandardMaterial> {
    return this.carpetMaterialGenerator.createMaterial(options)
  }

  /**
   * Create a carpet material using procedural textures
   */
  public createProceduralCarpetMaterial(options: ProceduralCarpetMaterialOptions = {}): THREE.MeshStandardMaterial {
    return this.carpetMaterialGenerator.createProceduralMaterial(options)
  }

  /**
   * Create enhanced procedural carpet material with realistic fiber patterns
   */
  public createEnhancedProceduralCarpetMaterial(options: EnhancedProceduralCarpetMaterialOptions = {}): THREE.MeshStandardMaterial {
    return this.carpetMaterialGenerator.createEnhancedProceduralMaterial(options)
  }

  // === CEILING MATERIALS ===

  /**
   * Create a ceiling material from texture files
   */
  public async createCeilingMaterial(options: CeilingMaterialOptions = {}): Promise<THREE.MeshStandardMaterial> {
    return this.ceilingMaterialGenerator.createMaterial(options)
  }

  /**
   * Create a ceiling material using procedural textures
   */
  public createProceduralCeilingMaterial(options: ProceduralCeilingMaterialOptions = {}): THREE.MeshStandardMaterial {
    return this.ceilingMaterialGenerator.createProceduralMaterial(options)
  }

  /**
   * Create enhanced procedural ceiling material with realistic popcorn texture
   */
  public createEnhancedProceduralCeilingMaterial(options: EnhancedProceduralCeilingMaterialOptions = {}): THREE.MeshStandardMaterial {
    return this.ceilingMaterialGenerator.createEnhancedProceduralMaterial(options)
  }

  // === UTILITY METHODS ===

  /**
   * Dispose of all cached textures and materials
   */
  public dispose(): void {
    this.textureLoader.clearCache()
    this.woodMaterialGenerator.clearCache()
    this.carpetMaterialGenerator.clearCache()
    this.ceilingMaterialGenerator.clearCache()
  }

  /**
   * Get memory usage statistics
   */
  public getMemoryUsage(): {
    textureCount: number
    materialCount: number
  } {
    const textureStats = this.textureLoader.getCacheStats()
    const woodStats = this.woodMaterialGenerator.getCacheStats()
    const carpetStats = this.carpetMaterialGenerator.getCacheStats()
    const ceilingStats = this.ceilingMaterialGenerator.getCacheStats()
    
    return {
      textureCount: textureStats.count,
      materialCount: woodStats.count + carpetStats.count + ceilingStats.count
    }
  }
}

  /**
   * Create a wood material with PBR properties
   */
  public async createWoodMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    roughnessUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      diffuseUrl = '/textures/wood/wood_diffuse.jpg',
      normalUrl = '/textures/wood/wood_normal.jpg',
      roughnessUrl = '/textures/wood/wood_roughness.jpg',
      repeat = { x: 1, y: 1 },
      color = new THREE.Color(0x8B4513)
    } = options;

    const cacheKey = `wood_${diffuseUrl}_${normalUrl}_${roughnessUrl}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.1,
    });

    try {
      // Load diffuse texture
      if (diffuseUrl) {
        const diffuseTexture = await this.loadTexture(diffuseUrl);
        diffuseTexture.repeat.set(repeat.x, repeat.y);
        material.map = diffuseTexture;
      }

      // Load normal map
      if (normalUrl) {
        const normalTexture = await this.loadTexture(normalUrl);
        normalTexture.repeat.set(repeat.x, repeat.y);
        material.normalMap = normalTexture;
      }

      // Load roughness map
      if (roughnessUrl) {
        const roughnessTexture = await this.loadTexture(roughnessUrl);
        roughnessTexture.repeat.set(repeat.x, repeat.y);
        material.roughnessMap = roughnessTexture;
      }

    } catch (error) {
      console.warn('Some wood textures failed to load, using base material:', error);
    }

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a simple wood material without textures (for development/testing)
   */
  public createSimpleWoodMaterial(color: THREE.Color = new THREE.Color(0x8B4513)): THREE.MeshStandardMaterial {
    const cacheKey = `simple_wood_${color.getHex()}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a carpet material
   */
  public async createCarpetMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      diffuseUrl = '/textures/carpet/carpet_diffuse.jpg',
      normalUrl = '/textures/carpet/carpet_normal.jpg',
      repeat = { x: 4, y: 4 },
      color = new THREE.Color(0x8B0000)
    } = options;

    const cacheKey = `carpet_${diffuseUrl}_${normalUrl}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.0,
    });

    try {
      if (diffuseUrl) {
        const diffuseTexture = await this.loadTexture(diffuseUrl);
        diffuseTexture.repeat.set(repeat.x, repeat.y);
        material.map = diffuseTexture;
      }

      if (normalUrl) {
        const normalTexture = await this.loadTexture(normalUrl);
        normalTexture.repeat.set(repeat.x, repeat.y);
        material.normalMap = normalTexture;
      }
    } catch (error) {
      console.warn('Some carpet textures failed to load, using base material:', error);
    }

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a ceiling material (popcorn ceiling)
   */
  public async createCeilingMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      diffuseUrl = '/textures/ceiling/ceiling_diffuse.jpg',
      normalUrl = '/textures/ceiling/ceiling_normal.jpg',
      repeat = { x: 2, y: 2 },
      color = new THREE.Color(0xF5F5DC)
    } = options;

    const cacheKey = `ceiling_${diffuseUrl}_${normalUrl}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.0,
    });

    try {
      if (diffuseUrl) {
        const diffuseTexture = await this.loadTexture(diffuseUrl);
        diffuseTexture.repeat.set(repeat.x, repeat.y);
        material.map = diffuseTexture;
      }

      if (normalUrl) {
        const normalTexture = await this.loadTexture(normalUrl);
        normalTexture.repeat.set(repeat.x, repeat.y);
        material.normalMap = normalTexture;
      }
    } catch (error) {
      console.warn('Some ceiling textures failed to load, using base material:', error);
    }

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a wood material using procedural textures (no file dependencies)
   */
  public createProceduralWoodMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    grainStrength?: number;
    roughness?: number;
    metalness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#8B4513',
      color2 = '#A0522D',
      grainStrength = 0.3,
      roughness = 0.8,
      metalness = 0.1
    } = options;

    const cacheKey = `proc_wood_${repeat.x}_${repeat.y}_${color1}_${color2}_${grainStrength}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    // Create procedural textures
    const diffuseTexture = this.proceduralTextures.createWoodTexture({
      color1,
      color2,
      grainStrength
    });
    diffuseTexture.repeat.set(repeat.x, repeat.y);

    const normalTexture = this.proceduralTextures.createWoodNormalMap({
      strength: grainStrength * 0.5
    });
    normalTexture.repeat.set(repeat.x, repeat.y);

    const material = new THREE.MeshStandardMaterial({
      map: diffuseTexture,
      normalMap: normalTexture,
      roughness,
      metalness,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a carpet material using procedural textures
   */
  public createProceduralCarpetMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    roughness?: number;
    metalness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 4, y: 4 }, // More repeats for carpet
      color = '#8B0000',
      roughness = 0.9,
      metalness = 0.0
    } = options;

    const cacheKey = `proc_carpet_${repeat.x}_${repeat.y}_${color}_${roughness}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const diffuseTexture = this.proceduralTextures.createCarpetTexture({
      color,
      roughness: 0.8
    });
    diffuseTexture.repeat.set(repeat.x, repeat.y);

    const material = new THREE.MeshStandardMaterial({
      map: diffuseTexture,
      roughness,
      metalness,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a ceiling material using procedural textures
   */
  public createProceduralCeilingMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    bumpiness?: number;
    roughness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 2, y: 2 },
      color = '#F5F5DC',
      bumpiness = 0.4,
      roughness = 0.7
    } = options;

    const cacheKey = `proc_ceiling_${repeat.x}_${repeat.y}_${color}_${bumpiness}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const diffuseTexture = this.proceduralTextures.createCeilingTexture({
      color,
      bumpiness
    });
    diffuseTexture.repeat.set(repeat.x, repeat.y);

    const material = new THREE.MeshStandardMaterial({
      map: diffuseTexture,
      roughness,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create enhanced procedural wood material with realistic grain patterns
   */
  public createEnhancedProceduralWoodMaterial(options: {
    repeat?: { x: number; y: number };
    grainStrength?: number;
    ringFrequency?: number;
    color1?: string;
    color2?: string;
    color3?: string;
    roughness?: number;
    metalness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      grainStrength = 0.4,
      ringFrequency = 0.08,
      color1 = '#8B4513',
      color2 = '#A0522D',
      color3 = '#654321',
      roughness = 0.8,
      metalness = 0.1
    } = options;

    const cacheKey = `enhanced_proc_wood_${repeat.x}_${repeat.y}_${grainStrength}_${ringFrequency}_${color1}_${color2}_${color3}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    // Create enhanced procedural texture
    const diffuseTexture = this.proceduralTextures.createEnhancedWoodTexture({
      grainStrength,
      ringFrequency,
      color1,
      color2,
      color3
    });
    diffuseTexture.repeat.set(repeat.x, repeat.y);

    // Create normal map for wood grain depth
    const normalTexture = this.proceduralTextures.createWoodNormalMap({
      strength: grainStrength * 0.6
    });
    normalTexture.repeat.set(repeat.x, repeat.y);

    const material = new THREE.MeshStandardMaterial({
      map: diffuseTexture,
      normalMap: normalTexture,
      roughness,
      metalness,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create enhanced procedural carpet material with realistic fiber patterns
   */
  public createEnhancedProceduralCarpetMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    fiberDensity?: number;
    roughness?: number;
    metalness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 4, y: 4 },
      color = '#8B0000',
      fiberDensity = 0.4,
      roughness = 0.9,
      metalness = 0.0
    } = options;

    const cacheKey = `enhanced_proc_carpet_${repeat.x}_${repeat.y}_${color}_${fiberDensity}_${roughness}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const diffuseTexture = this.proceduralTextures.createEnhancedCarpetTexture({
      color,
      fiberDensity,
      roughness: 0.8
    });
    diffuseTexture.repeat.set(repeat.x, repeat.y);

    const material = new THREE.MeshStandardMaterial({
      map: diffuseTexture,
      roughness,
      metalness,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create enhanced procedural ceiling material with realistic popcorn texture
   */
  public createEnhancedProceduralCeilingMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    bumpSize?: number;
    density?: number;
    roughness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 2, y: 2 },
      color = '#F5F5DC',
      bumpSize = 0.5,
      density = 0.7,
      roughness = 0.7
    } = options;

    const cacheKey = `enhanced_proc_ceiling_${repeat.x}_${repeat.y}_${color}_${bumpSize}_${density}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const diffuseTexture = this.proceduralTextures.createEnhancedCeilingTexture({
      color,
      bumpSize,
      density
    });
    diffuseTexture.repeat.set(repeat.x, repeat.y);

    const material = new THREE.MeshStandardMaterial({
      map: diffuseTexture,
      roughness,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Dispose of all cached textures and materials
   */
  public dispose(): void {
    this.textureCache.forEach((texture) => texture.dispose());
    this.materialCache.forEach((material) => material.dispose());
    this.textureCache.clear();
    this.materialCache.clear();
  }

  /**
   * Get memory usage statistics
   */
  public getMemoryUsage(): {
    textureCount: number;
    materialCount: number;
  } {
    return {
      textureCount: this.textureCache.size,
      materialCount: this.materialCache.size
    };
  }
}
