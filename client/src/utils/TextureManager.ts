import * as THREE from 'three';
import { TextureLoader } from './materials/TextureLoader';
import { WoodMaterialGenerator } from './materials/WoodMaterialGenerator';
import { CarpetMaterialGenerator } from './materials/CarpetMaterialGenerator';
import { CeilingMaterialGenerator } from './materials/CeilingMaterialGenerator';

/**
 * Manages texture loading and material creation for the store environment
 * Provides both file-based and procedural material generation with caching
 */
export class TextureManager {
  private static instance: TextureManager;
  
  private textureLoader: TextureLoader;
  private woodMaterialGenerator: WoodMaterialGenerator;
  private carpetMaterialGenerator: CarpetMaterialGenerator;
  private ceilingMaterialGenerator: CeilingMaterialGenerator;

  private constructor() {
    this.textureLoader = TextureLoader.getInstance();
    this.woodMaterialGenerator = new WoodMaterialGenerator();
    this.carpetMaterialGenerator = new CarpetMaterialGenerator();
    this.ceilingMaterialGenerator = new CeilingMaterialGenerator();
  }

  public static getInstance(): TextureManager {
    if (!TextureManager.instance) {
      TextureManager.instance = new TextureManager();
    }
    return TextureManager.instance;
  }

  // Texture loading methods
  public async loadTexture(url: string): Promise<THREE.Texture> {
    return this.textureLoader.loadTexture(url);
  }

  // Wood material methods
  public async createWoodMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    roughnessUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    return this.woodMaterialGenerator.createMaterial(options);
  }

  public createSimpleWoodMaterial(options: {
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createSimpleMaterial(options);
  }

  public createProceduralWoodMaterial(options: {
    repeat?: { x: number; y: number };
    color1?: string;
    color2?: string;
    grainStrength?: number;
    roughness?: number;
    metalness?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createProceduralMaterial(options);
  }

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
    return this.woodMaterialGenerator.createEnhancedProceduralMaterial(options);
  }

  // MDF Veneer material methods (Task 6.1.1.1)
  public createMDFVeneerMaterial(options: {
    repeat?: { x: number; y: number };
    veneerColor?: string;
    glossiness?: number;
    grainSubtlety?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createMDFVeneerMaterial(options);
  }

  public createShelfInteriorMaterial(options: {
    glossLevel?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createShelfInteriorMaterial(options);
  }

  public createBrandAccentMaterial(options: {
    brandColor?: string;
    glossLevel?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.woodMaterialGenerator.createBrandAccentMaterial(options);
  }

  // Carpet material methods
  public async createCarpetMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    return this.carpetMaterialGenerator.createMaterial(options);
  }

  public createProceduralCarpetMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    roughness?: number;
    metalness?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.carpetMaterialGenerator.createProceduralMaterial(options);
  }

  public createEnhancedProceduralCarpetMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    fiberDensity?: number;
    roughness?: number;
    metalness?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.carpetMaterialGenerator.createEnhancedProceduralMaterial(options);
  }

  // Ceiling material methods
  public async createCeilingMaterial(options: {
    diffuseUrl?: string;
    normalUrl?: string;
    repeat?: { x: number; y: number };
    color?: THREE.Color;
  } = {}): Promise<THREE.MeshStandardMaterial> {
    return this.ceilingMaterialGenerator.createMaterial(options);
  }

  public createProceduralCeilingMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    bumpiness?: number;
    roughness?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.ceilingMaterialGenerator.createProceduralMaterial(options);
  }

  public createEnhancedProceduralCeilingMaterial(options: {
    repeat?: { x: number; y: number };
    color?: string;
    bumpSize?: number;
    density?: number;
    roughness?: number;
  } = {}): THREE.MeshStandardMaterial {
    return this.ceilingMaterialGenerator.createEnhancedProceduralMaterial(options);
  }

  // Management methods
  public clearCache(): void {
    this.textureLoader.clearCache();
    this.woodMaterialGenerator.clearCache();
    this.carpetMaterialGenerator.clearCache();
    this.ceilingMaterialGenerator.clearCache();
  }

  public dispose(): void {
    this.textureLoader.clearCache();
    this.woodMaterialGenerator.clearCache();
    this.carpetMaterialGenerator.clearCache();
    this.ceilingMaterialGenerator.clearCache();
  }

  public getMemoryUsage(): {
    textureCount: number;
    materialCount: number;
  } {
    const textureStats = this.textureLoader.getCacheStats();
    const woodStats = this.woodMaterialGenerator.getCacheStats();
    const carpetStats = this.carpetMaterialGenerator.getCacheStats();
    const ceilingStats = this.ceilingMaterialGenerator.getCacheStats();
    
    return {
      textureCount: textureStats.count,
      materialCount: woodStats.count + carpetStats.count + ceilingStats.count
    }
  }
}
