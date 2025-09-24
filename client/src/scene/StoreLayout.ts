import * as THREE from 'three';
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator';
import { TextureManager } from '../utils/TextureManager';
import { RoomStructureBuilder } from './RoomStructureBuilder';
import { Logger } from '../utils/Logger';
import { 
  VR_ERGONOMICS, 
  STEAM_STORE_SECTIONS, 
  StoreLayoutConfigFactory,
  type StoreLayoutConfig, 
  type StoreSection 
} from './StoreLayoutConfig';

// Re-export for backward compatibility
export { VR_ERGONOMICS, STEAM_STORE_SECTIONS, type StoreLayoutConfig, type StoreSection };

/**
 * Standard shelf unit configuration
 */
const STANDARD_SHELF_CONFIG = {
  width: 2.0,
  height: 2.0,
  depth: 0.4,
  angle: 12,
  shelfCount: 4,
  boardThickness: 0.05
} as const;

export class StoreLayout {
  private static readonly logger = Logger.withContext('StoreLayout')
  
  private scene: THREE.Scene;
  private shelfGenerator: ProceduralShelfGenerator;
  private textureManager: TextureManager;
  private roomBuilder: RoomStructureBuilder;
  private storeGroup: THREE.Group;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.shelfGenerator = new ProceduralShelfGenerator(scene);
    this.textureManager = TextureManager.getInstance();
    this.roomBuilder = new RoomStructureBuilder();
    this.storeGroup = new THREE.Group();
    this.scene.add(this.storeGroup);
  }

  /**
   * Create VR-optimized Steam store layout based on Phase 2C research
   * Enhanced dimensions, Steam categories, and VR ergonomics
   */
  public createDefaultLayout(): StoreLayoutConfig {
    return StoreLayoutConfigFactory.createDefaultLayout();
  }

  /**
   * Generate the complete VR-optimized store layout
   */
  public async generateStore(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<void> {
    // Clear existing store
    this.clearStore();

    // Create only shelves - room structure handled by EnvironmentRenderer
    await this.createShelfSections(config);
    this.createEntranceArea(config);
    
    StoreLayout.logger.info('Store shelves generated (room structure handled by EnvironmentRenderer)')
  }

  /**
   * Generate just the basic room structure without shelves (for fast startup)
   */
  public async generateBasicRoom(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<void> {
    // Clear existing store
    this.clearStore();

    // Create only entrance area - room structure handled by EnvironmentRenderer
    this.createEntranceArea(config);
    
    StoreLayout.logger.info('Basic room ready (room structure handled by EnvironmentRenderer)')
  }

  /**
   * Generate and add shelves to the existing room (called asynchronously)
   */
  public async generateShelves(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<void> {
    // Only create shelf sections, assuming room structure already exists
    await this.createShelfSections(config);
    
    StoreLayout.logger.info('Store shelves added to existing room')
  }

  /**
   * Generate shelves using chunked processing to avoid blocking the event loop
   */
  public async generateShelvesChunked(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<void> {
    await this.createShelfSectionsChunked(config);
    StoreLayout.logger.info('Store shelves added to existing room (chunked)')
  }

  /**
   * Generate shelves using GPU-optimized instanced rendering for maximum performance
   */
  public async generateShelvesGPUOptimized(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<void> {
    // Clear existing store
    this.clearStore();

    // Create only GPU-optimized shelves - room structure handled by EnvironmentRenderer
    await this.createShelfSectionsGPUOptimized(config);
    this.createEntranceArea(config);
    
    StoreLayout.logger.info('GPU-optimized shelves generated (room structure handled by EnvironmentRenderer)')
  }

  /**
   * Create the basic room structure (floor, walls, ceiling)
   */
  private async createRoomStructure(config: StoreLayoutConfig): Promise<void> {
    await this.roomBuilder.createRoomStructure(config, this.storeGroup);
  }

  /**
   * Create shelf sections based on configuration
   */
  private async createShelfSections(config: StoreLayoutConfig): Promise<void> {
    for (const section of config.sections) {
      const sectionGroup = new THREE.Group();
      sectionGroup.name = section.name;
      
      // Create shelves for this section
      for (let i = 0; i < section.shelfCount; i++) {
        const shelfPosition = new THREE.Vector3(
          section.position.x + i * config.shelfSpacing,
          section.position.y,
          section.position.z
        );
        
        const shelfUnit = this.shelfGenerator.generateShelfUnit(shelfPosition, STANDARD_SHELF_CONFIG);
        
        sectionGroup.add(shelfUnit);
      }
      
      // Add section label (simple text for now)
      this.addSectionLabel(sectionGroup, section);
      
      this.storeGroup.add(sectionGroup);
    }
  }

  /**
   * Create shelf sections with chunked processing to avoid blocking the event loop
   */
  private async createShelfSectionsChunked(config: StoreLayoutConfig): Promise<void> {
    const SHELF_CHUNK_SIZE = 2; // Process 2 shelves at a time
    const CHUNK_DELAY = 16; // ~60fps (16ms between chunks)
    
    for (const section of config.sections) {
      const sectionGroup = new THREE.Group();
      sectionGroup.name = section.name;
      
      StoreLayout.logger.info(`Creating section: ${section.name} (${section.shelfCount} shelves)`);
      
      // Create shelves in chunks
      for (let i = 0; i < section.shelfCount; i += SHELF_CHUNK_SIZE) {
        const chunkEnd = Math.min(i + SHELF_CHUNK_SIZE, section.shelfCount);
        
        // Process this chunk
        for (let j = i; j < chunkEnd; j++) {
          const shelfPosition = new THREE.Vector3(
            section.position.x + j * config.shelfSpacing,
            section.position.y,
            section.position.z
          );
          
          const shelfUnit = this.shelfGenerator.generateShelfUnit(shelfPosition, STANDARD_SHELF_CONFIG);
          
          sectionGroup.add(shelfUnit);
        }
        
        // Yield control back to the event loop after each chunk
        if (chunkEnd < section.shelfCount) {
          await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
        }
      }
      
      // Add section label
      this.addSectionLabel(sectionGroup, section);
      this.storeGroup.add(sectionGroup);
      
      StoreLayout.logger.info(`Section ${section.name} complete`);
    }
  }

  /**
   * Create shelf sections using GPU-optimized rendering
   * Uses the existing ProceduralShelfGenerator but with optimized batching
   */
  private async createShelfSectionsGPUOptimized(config: StoreLayoutConfig): Promise<void> {
    const totalShelves = config.sections.reduce((sum, section) => sum + section.shelfCount, 0);
    StoreLayout.logger.info(`GPU: Creating ${totalShelves} shelves with optimized batching`);
    
    // Pre-create shared materials for better performance
    const woodMaterial = this.textureManager.createSimpleWoodMaterial({ color: new THREE.Color(0x8B4513) });
    
    // Generate all shelves using the existing generator but with batched approach
    for (const section of config.sections) {
      const sectionGroup = new THREE.Group();
      sectionGroup.name = section.name;
      
      // Create all shelves for this section at once (better for GPU batching)
      const sectionShelves: THREE.Group[] = [];
      for (let i = 0; i < section.shelfCount; i++) {
        const shelfPosition = new THREE.Vector3(
          section.position.x + i * config.shelfSpacing,
          section.position.y,
          section.position.z
        );
        
        // Use standard generator but with shared material for GPU efficiency
        const shelfUnit = this.shelfGenerator.generateShelfUnit(shelfPosition, STANDARD_SHELF_CONFIG);
        
        // Apply shared material to all meshes in the shelf for GPU batching
        shelfUnit.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = woodMaterial;
          }
        });
        
        sectionShelves.push(shelfUnit);
      }
      
      // Add all shelves to section group at once
      sectionShelves.forEach(shelf => sectionGroup.add(shelf));
      
      // Add section label
      this.addSectionLabel(sectionGroup, section);
      this.storeGroup.add(sectionGroup);
    }
    
    StoreLayout.logger.info(`GPU: Optimized shelf generation complete with shared materials`);
  }

  /**
   * Add a section label above the shelves using proper text signage
   */
  private addSectionLabel(sectionGroup: THREE.Group, section: StoreSection): void {
    // Create a canvas for the text
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Style the text
    ctx.fillStyle = '#000080'; // Blue background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#FFFFFF'; // White text
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Get display name for the section
    const displayName = StoreLayoutConfigFactory.getSectionDisplayName(section.name);
    ctx.fillText(displayName, canvas.width / 2, canvas.height / 2);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    // Create sign geometry and material
    const labelGeometry = new THREE.PlaneGeometry(2.0, 0.5);
    const labelMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true
    });
    
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.set(
      section.shelfCount * 1.1, // Center above shelves
      2.3, // Above shelf height
      section.position.z
    );
    
    sectionGroup.add(label);
  }

  /**
   * Create entrance area with checkout
   */
  private createEntranceArea(config: StoreLayoutConfig): void {
    // Simple entrance marker (can be enhanced later)
    const entranceGeometry = new THREE.BoxGeometry(3, 0.1, 2);
    const entranceMaterial = this.textureManager.createSimpleWoodMaterial({ color: new THREE.Color(0x8B4513) });
    
    const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
    entrance.position.set(0, 0.05, config.depth / 2 - 1);
    this.storeGroup.add(entrance);
  }

  /**
   * Clear the current store layout
   */
  private clearStore(): void {
    while (this.storeGroup.children.length > 0) {
      const child = this.storeGroup.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
      this.storeGroup.remove(child);
    }
  }

  /**
   * Get the store group for positioning or manipulation
   */
  public getStoreGroup(): THREE.Group {
    return this.storeGroup;
  }

  /**
   * Get statistics about the generated store
   */
  public getStoreStats(): {
    totalShelves: number;
    sections: number;
    storeSize: { width: number; height: number; depth: number };
  } {
    const config = this.createDefaultLayout();
    const totalShelves = config.sections.reduce((sum, section) => sum + section.shelfCount, 0);
    
    return {
      totalShelves,
      sections: config.sections.length,
      storeSize: {
        width: config.width,
        height: config.height,
        depth: config.depth
      }
    };
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.clearStore();
    this.scene.remove(this.storeGroup);
  }
}
