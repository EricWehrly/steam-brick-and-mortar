import * as THREE from 'three';

/**
 * Manages texture loading and material creation for the WebXR environment
 * Optimized for VR performance with proper texture formats and LOD
 */
export class TextureManager {
  private static instance: TextureManager;
  private textureLoader: THREE.TextureLoader;
  private textureCache: Map<string, THREE.Texture>;
  private materialCache: Map<string, THREE.Material>;

  private constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.textureCache = new Map();
    this.materialCache = new Map();
  }

  public static getInstance(): TextureManager {
    if (!TextureManager.instance) {
      TextureManager.instance = new TextureManager();
    }
    return TextureManager.instance;
  }

  /**
   * Load a texture with caching
   */
  public async loadTexture(url: string): Promise<THREE.Texture> {
    const cachedTexture = this.textureCache.get(url);
    if (cachedTexture) {
      return cachedTexture;
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          // Optimize texture for VR
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = 16; // High anisotropy for VR
          
          this.textureCache.set(url, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
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
