import * as THREE from 'three';
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator';
import { TextureManager } from '../utils/TextureManager';

/**
 * VR Ergonomic Constants based on Phase 2C research
 * See: docs/research/phase2c-store-layout-spatial-research.md
 */
export const VR_ERGONOMICS = {
  MINIMUM_INTERACTION_DISTANCE: 0.75,  // meters
  OPTIMAL_INTERACTION_DISTANCE: 1.2,   // meters  
  MAXIMUM_READABLE_DISTANCE: 20,       // meters
  PERSONAL_SPACE_BUFFER: 0.5,          // meters
  COMFORTABLE_AISLE_WIDTH: 2.2,        // meters (wider than retail 1.07m)
  TURNING_RADIUS: 0.75,                // meters (radius)
  SHELF_MIN_HEIGHT: 0.8,               // meters
  SHELF_MAX_HEIGHT: 2.0,               // meters
  SHELF_OPTIMAL_HEIGHT: 1.4            // meters (eye level)
} as const;

/**
 * Steam Store Category Mapping
 * Maps Steam game genres to physical store sections
 */
export const STEAM_STORE_SECTIONS = {
  NEW_TRENDING: 'new-trending',
  ACTION: 'action',
  ADVENTURE: 'adventure', 
  RPG: 'rpg',
  STRATEGY: 'strategy',
  CASUAL: 'casual'
} as const;

/**
 * Store layout configuration
 */
export interface StoreLayoutConfig {
  // Room dimensions (VR-optimized)
  width: number;
  height: number;
  depth: number;
  
  // Entrance area
  entranceZone: {
    width: number;
    depth: number;
    position: THREE.Vector3;
  };
  
  // Shelf configuration
  shelfRows: number;
  shelfUnitsPerRow: number;
  shelfSpacing: number;
  aisleWidth: number;
  mainAisleWidth: number;
  wallClearance: number;
  
  // Store sections
  sections: StoreSection[];
}

export interface StoreSection {
  name: string;
  position: THREE.Vector3;
  shelfCount: number;
  category: string;
  priority: 'high' | 'medium' | 'low';
  description?: string;
}

/**
 * Manages the overall store layout and shelf placement
 * Based on Blockbuster store design principles
 */
export class StoreLayout {
  private scene: THREE.Scene;
  private shelfGenerator: ProceduralShelfGenerator;
  private textureManager: TextureManager;
  private storeGroup: THREE.Group;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.shelfGenerator = new ProceduralShelfGenerator(scene);
    this.textureManager = TextureManager.getInstance();
    this.storeGroup = new THREE.Group();
    this.scene.add(this.storeGroup);
  }

  /**
   * Create VR-optimized Steam store layout based on Phase 2C research
   * Enhanced dimensions, Steam categories, and VR ergonomics
   */
  public createDefaultLayout(): StoreLayoutConfig {
    return {
      // VR-optimized room dimensions
      width: 22,    // Enhanced from 20m for entrance buffer
      height: 3.2,  // Slightly higher ceiling
      depth: 16,    // Enhanced from 15m for back wall clearance
      

      shelfRows: 2,                               // Front and back rows
      shelfUnitsPerRow: 3,                        // 3 sections per row
      shelfSpacing: 6.5,                          // Between sections
      aisleWidth: VR_ERGONOMICS.COMFORTABLE_AISLE_WIDTH,  // 2.2m
      mainAisleWidth: 3.0,                        // Central aisle
      wallClearance: 1.0,                         // Distance from walls
      
      // Enhanced entrance zone for VR orientation
      entranceZone: {
        width: 6,                                 // Full width entrance
        depth: 3,                                 // 3m buffer for orientation
        position: new THREE.Vector3(0, 0, 6.5)
      },
      
      // Steam game categories mapped to store sections
      sections: [
        {
          name: 'New & Trending',
          position: new THREE.Vector3(-6.5, 0, 3),    // Front-left (high visibility)
          shelfCount: 3,
          category: STEAM_STORE_SECTIONS.NEW_TRENDING,
          priority: 'high',
          description: 'Recently Released & Popular Games'
        },
        {
          name: 'Action Games',
          position: new THREE.Vector3(0, 0, 3),        // Front-center  
          shelfCount: 4,
          category: STEAM_STORE_SECTIONS.ACTION,
          priority: 'high',
          description: 'Action, FPS & Fighting Games'
        },
        {
          name: 'Adventure & Story',
          position: new THREE.Vector3(6.5, 0, 3),      // Front-right
          shelfCount: 3,
          category: STEAM_STORE_SECTIONS.ADVENTURE,
          priority: 'medium',
          description: 'Adventure & Narrative Games'
        },
        {
          name: 'RPG & Fantasy',
          position: new THREE.Vector3(-6.5, 0, -3),    // Back-left
          shelfCount: 4,
          category: STEAM_STORE_SECTIONS.RPG,
          priority: 'medium',
          description: 'RPG, JRPG & Fantasy Games'
        },
        {
          name: 'Strategy & Sim',
          position: new THREE.Vector3(0, 0, -3),       // Back-center
          shelfCount: 3,
          category: STEAM_STORE_SECTIONS.STRATEGY,
          priority: 'medium',
          description: 'Strategy & Simulation Games'
        },
        {
          name: 'Casual & Family',
          position: new THREE.Vector3(6.5, 0, -3),     // Back-right
          shelfCount: 2,
          category: STEAM_STORE_SECTIONS.CASUAL,
          priority: 'low',
          description: 'Casual & Family Friendly Games'
        }
      ]
    };
  }

  /**
   * Generate the complete VR-optimized store layout
   */
  public async generateStore(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<void> {
    // Clear existing store
    this.clearStore();

    // Create room structure
    await this.createRoomStructure(config);

    // Create shelf sections
    await this.createShelfSections(config);

    // Add entrance and checkout area
    this.createEntranceArea(config);
  }

  /**
   * Create the basic room structure (floor, walls, ceiling)
   */
  private async createRoomStructure(config: StoreLayoutConfig): Promise<void> {
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(config.width, config.depth);
    const carpetMaterial = await this.textureManager.createCarpetMaterial({
      color: new THREE.Color(0x8B0000), // Dark red carpet
      repeat: { x: 4, y: 3 }
    });
    
    const floor = new THREE.Mesh(floorGeometry, carpetMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.storeGroup.add(floor);

    // Create ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(config.width, config.depth);
    const ceilingMaterial = await this.textureManager.createCeilingMaterial({
      color: new THREE.Color(0xF5F5DC), // Beige ceiling
      repeat: { x: 2, y: 2 }
    });
    
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = config.height;
    this.storeGroup.add(ceiling);

    // Create walls with proper textures
    const wallMaterial = await this.textureManager.createWoodMaterial({
      color: new THREE.Color(0xF5F5DC), // Beige
      repeat: { x: 4, y: 2 }
    });
    
    // Back wall
    const backWallGeometry = new THREE.PlaneGeometry(config.width, config.height);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, config.height / 2, -config.depth / 2);
    this.storeGroup.add(backWall);

    // Side walls
    const sideWallGeometry = new THREE.PlaneGeometry(config.depth, config.height);
    
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-config.width / 2, config.height / 2, 0);
    this.storeGroup.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(config.width / 2, config.height / 2, 0);
    this.storeGroup.add(rightWall);
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
        
        const shelfUnit = this.shelfGenerator.generateShelfUnit(shelfPosition, {
          width: 2.0,
          height: 2.0,
          depth: 0.4,
          angle: 12,
          shelfCount: 4,
          boardThickness: 0.05
        });
        
        sectionGroup.add(shelfUnit);
      }
      
      // Add section label (simple text for now)
      this.addSectionLabel(sectionGroup, section);
      
      this.storeGroup.add(sectionGroup);
    }
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
    const displayName = this.getSectionDisplayName(section.name);
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
   * Get display name for section
   */
  private getSectionDisplayName(sectionName: string): string {
    const displayNames: { [key: string]: string } = {
      'new-trending': 'NEW & TRENDING',
      'action': 'ACTION',
      'adventure': 'ADVENTURE & STORY',
      'rpg': 'RPG & FANTASY',
      'strategy': 'STRATEGY & SIM',
      'casual': 'CASUAL & FAMILY'
    };
    
    return displayNames[sectionName] || sectionName.toUpperCase();
  }

  /**
   * Create entrance area with checkout
   */
  private createEntranceArea(config: StoreLayoutConfig): void {
    // Simple entrance marker (can be enhanced later)
    const entranceGeometry = new THREE.BoxGeometry(3, 0.1, 2);
    const entranceMaterial = this.textureManager.createSimpleWoodMaterial(new THREE.Color(0x8B4513));
    
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
