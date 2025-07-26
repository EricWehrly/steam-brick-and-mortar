import * as THREE from 'three';

/**
 * Mock TextureManager for testing
 * Returns mock materials immediately without async texture loading
 */
export class MockTextureManager {
  private static instance: MockTextureManager;
  private textureCache: Map<string, THREE.Texture>;
  private materialCache: Map<string, THREE.Material>;

  private constructor() {
    this.textureCache = new Map();
    this.materialCache = new Map();
  }

  public static getInstance(): MockTextureManager {
    if (!MockTextureManager.instance) {
      MockTextureManager.instance = new MockTextureManager();
    }
    return MockTextureManager.instance;
  }

  /**
   * Mock texture loading - returns a simple texture immediately
   */
  public async loadTexture(url: string): Promise<THREE.Texture> {
    const cachedTexture = this.textureCache.get(url);
    if (cachedTexture) {
      return cachedTexture;
    }

    // Create a simple mock texture
    const texture = new THREE.Texture();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 16;
    
    this.textureCache.set(url, texture);
    return texture;
  }

  /**
   * Create a mock wood material
   */
  public async createWoodMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    roughnessUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      repeat = { x: 1, y: 1 },
      color = new THREE.Color(0x8B4513)
    } = options;

    const cacheKey = `wood_${options.diffuseUrl}_${options.normalUrl}_${options.roughnessUrl}_${repeat.x}_${repeat.y}`;
    
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
   * Create a mock carpet material
   */
  public async createCarpetMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      repeat = { x: 1, y: 1 },
      color = new THREE.Color(0x8B0000)
    } = options;

    const cacheKey = `carpet_${options.diffuseUrl}_${options.normalUrl}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a mock ceiling material
   */
  public async createCeilingMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    const {
      repeat = { x: 1, y: 1 },
      color = new THREE.Color(0xF5F5DC)
    } = options;

    const cacheKey = `ceiling_${options.diffuseUrl}_${options.normalUrl}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a simple wood material (non-async version)
   */
  public createSimpleWoodMaterial(options: { color?: THREE.Color } | THREE.Color = new THREE.Color(0x8B4513)): THREE.MeshStandardMaterial {
    // Handle both direct Color and options object
    const color = options instanceof THREE.Color ? options : (options.color || new THREE.Color(0x8B4513));
    const cacheKey = `simple_wood_${color.getHexString()}`;
    
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
   * Create a mock procedural wood material
   */
  public createProceduralWoodMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    grainIntensity?: number;
    ringIntensity?: number;
    noiseScale?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#8B4513',
      color2 = '#654321'
    } = options;

    const cacheKey = `procedural_wood_${color1}_${color2}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color1),
      roughness: 0.8,
      metalness: 0.1,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a mock procedural carpet material
   */
  public createProceduralCarpetMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    fiberIntensity?: number;
    weaveIntensity?: number;
    noiseScale?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#8B0000',
      color2 = '#660000'
    } = options;

    const cacheKey = `procedural_carpet_${color1}_${color2}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color1),
      roughness: 0.9,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a mock procedural ceiling material
   */
  public createProceduralCeilingMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    textureIntensity?: number;
    tileSize?: number;
    noiseScale?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#F5F5DC',
      color2 = '#E5E5D0'
    } = options;

    const cacheKey = `procedural_ceiling_${color1}_${color2}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color1),
      roughness: 0.7,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a mock enhanced procedural wood material
   */
  public createEnhancedProceduralWoodMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    grainIntensity?: number;
    ringIntensity?: number;
    noiseScale?: number;
    warpIntensity?: number;
    plankWidth?: number;
    plankLength?: number;
    plankVariation?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#8B4513',
      color2 = '#654321'
    } = options;

    const cacheKey = `enhanced_procedural_wood_${color1}_${color2}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color1),
      roughness: 0.8,
      metalness: 0.1,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a mock enhanced procedural carpet material
   */
  public createEnhancedProceduralCarpetMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    fiberIntensity?: number;
    weaveIntensity?: number;
    noiseScale?: number;
    threadThickness?: number;
    pileHeight?: number;
    fuzziness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#8B0000',
      color2 = '#660000'
    } = options;

    const cacheKey = `enhanced_procedural_carpet_${color1}_${color2}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color1),
      roughness: 0.9,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create a mock enhanced procedural ceiling material
   */
  public createEnhancedProceduralCeilingMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    textureIntensity?: number;
    tileSize?: number;
    noiseScale?: number;
    groutWidth?: number;
    groutDepth?: number;
    surfaceRoughness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const {
      repeat = { x: 1, y: 1 },
      color1 = '#F5F5DC',
      color2 = '#E5E5D0'
    } = options;

    const cacheKey = `enhanced_procedural_ceiling_${color1}_${color2}_${repeat.x}_${repeat.y}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey) as THREE.MeshStandardMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color1),
      roughness: 0.7,
      metalness: 0.0,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Mock getMemoryUsage method
   */
  public getMemoryUsage(): {
    textures: number;
    materials: number;
    memoryMB: number;
  } {
    return {
      textures: this.textureCache.size,
      materials: this.materialCache.size,
      memoryMB: 0 // Mock value
    };
  }

  /**
   * Mock dispose method
   */
  public dispose(): void {
    // Clean up caches
    this.textureCache.forEach(texture => texture.dispose());
    this.materialCache.forEach(material => material.dispose());
    this.textureCache.clear();
    this.materialCache.clear();
  }
}

/**
 * Async factory function to create mock TextureManager
 */
export async function createMockTextureManager(): Promise<MockTextureManager> {
  return MockTextureManager.getInstance();
}

/**
 * Default mock export
 */
export default MockTextureManager;
