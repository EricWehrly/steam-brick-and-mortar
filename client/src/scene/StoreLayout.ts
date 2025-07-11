import * as THREE from 'three';
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator';
import { TextureManager } from '../utils/TextureManager';

/**
 * Store layout configuration
 */
export interface StoreLayoutConfig {
  // Room dimensions
  width: number;
  height: number;
  depth: number;
  
  // Shelf configuration
  shelfRows: number;
  shelfUnitsPerRow: number;
  shelfSpacing: number;
  aisleWidth: number;
  
  // Store sections
  sections: StoreSection[];
}

export interface StoreSection {
  name: string;
  position: THREE.Vector3;
  shelfCount: number;
  category: string;
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
   * Create a default Blockbuster-style store layout
   */
  public createDefaultLayout(): StoreLayoutConfig {
    return {
      width: 20,
      height: 3,
      depth: 15,
      shelfRows: 4,
      shelfUnitsPerRow: 6,
      shelfSpacing: 2.2,
      aisleWidth: 2.0,
      sections: [
        {
          name: 'New Releases',
          position: new THREE.Vector3(-8, 0, 5),
          shelfCount: 3,
          category: 'new-releases'
        },
        {
          name: 'Action',
          position: new THREE.Vector3(-2, 0, 5),
          shelfCount: 4,
          category: 'action'
        },
        {
          name: 'Comedy',
          position: new THREE.Vector3(4, 0, 5),
          shelfCount: 3,
          category: 'comedy'
        },
        {
          name: 'Family',
          position: new THREE.Vector3(-8, 0, 0),
          shelfCount: 4,
          category: 'family'
        },
        {
          name: 'Drama',
          position: new THREE.Vector3(-2, 0, 0),
          shelfCount: 3,
          category: 'drama'
        },
        {
          name: 'Horror',
          position: new THREE.Vector3(4, 0, 0),
          shelfCount: 2,
          category: 'horror'
        }
      ]
    };
  }

  /**
   * Generate the complete store layout
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

    // Create walls (simple for now)
    const wallMaterial = this.textureManager.createSimpleWoodMaterial(new THREE.Color(0xF5F5DC));
    
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
   * Add a section label above the shelves
   */
  private addSectionLabel(sectionGroup: THREE.Group, section: StoreSection): void {
    // Create a simple box as placeholder for section signage
    const labelGeometry = new THREE.BoxGeometry(1.5, 0.3, 0.1);
    const labelMaterial = this.textureManager.createSimpleWoodMaterial(new THREE.Color(0x000080));
    
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
