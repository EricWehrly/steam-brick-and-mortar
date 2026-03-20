/**
 * StoreLayout
 * 
 * ROLE: Store environment layout calculations and procedural shelf generation.
 * Calculates store dimensions based on shelf requirements and VR ergonomics.
 * 
 * OWNS:
 * - Store dimension calculations
 * - Procedural shelf generation via ProceduralShelfGenerator
 * - Store layout configuration
 * - Store group container in scene
 * 
 * RECEIVES:
 * - calculateDynamicStoreDimensions(shelvesNeeded) → Returns required dimensions
 * - createSection(config) → Creates shelf section
 * 
 * EMITS:
 * - (none currently)
 * 
 * DELEGATES TO:
 * - ProceduralShelfGenerator: Actual shelf mesh generation (non-instanced)
 * - StoreLayoutConfigFactory: Layout configuration creation
 * 
 * NOTE: This is for the PROCEDURAL/LEGACY path. GPU-instanced shelves use
 * InstancedShelfRenderer directly. Consider consolidating layout logic.
 * 
 * RELATED:
 * - VRLayoutUtils in SharedPropsUtils: VR-optimized spacing calculations
 * - StoreLayoutConfig: Configuration types and factory
 */

import * as THREE from 'three';
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator';
import { Logger } from '../utils/Logger';

import { 
  VR_ERGONOMICS, 
  STEAM_STORE_SECTIONS, 
  StoreLayoutConfigFactory,
  type StoreLayoutConfig, 
  type StoreSection 
} from './StoreLayoutConfig';

// TODO: not this:
// Re-export for backward compatibility
export { VR_ERGONOMICS, STEAM_STORE_SECTIONS, type StoreLayoutConfig, type StoreSection };

export class StoreLayout {
  private static readonly logger = Logger.createLogFunctions(StoreLayout.name)
  
  private scene: THREE.Scene;
  private shelfGenerator: ProceduralShelfGenerator | null = null;
  private readonly storeGroup: THREE.Group;

  constructor(scene?: THREE.Scene) {
    this.storeGroup = new THREE.Group()
    this.storeGroup.name = "StoreLayout"
    
    if (scene) {
      this.scene = scene;
      this.shelfGenerator = new ProceduralShelfGenerator();
    }
  }

  public createDefaultLayout(): StoreLayoutConfig {
    return StoreLayoutConfigFactory.createDefaultLayout();
  }

  /**
   * Calculate required store dimensions for dynamic shelf layout
   * Proper home for store dimension calculations
   */
  public calculateDynamicStoreDimensions(shelvesNeeded: number, options: {
    shelfSpacingX?: number;
    shelfSpacingZ?: number;
    entranceClearance?: number;
    wallClearance?: number;
    backClearance?: number;
    ceilingHeight?: number;
  } = {}): { width: number; depth: number; height: number } {
    const {
      shelfSpacingX = 2.5,
      shelfSpacingZ = 3,
      entranceClearance = 6,
      wallClearance = 2,
      backClearance = 2,
      ceilingHeight = 3.2
    } = options;
    
    const maxShelvesPerRow = 4;
    const rows = Math.ceil(shelvesNeeded / maxShelvesPerRow);
    const maxShelvesInAnyRow = Math.min(maxShelvesPerRow, shelvesNeeded);
    
    // Calculate width: shelves + spacing + wall clearance
    const totalShelfWidth = maxShelvesInAnyRow * shelfSpacingX;
    const requiredWidth = totalShelfWidth + (wallClearance * 2);
    
    // Calculate depth: rows + spacing + entrance + back clearance
    const totalShelfDepth = rows * shelfSpacingZ;
    const requiredDepth = totalShelfDepth + entranceClearance + backClearance;
    
    return {
      width: Math.max(requiredWidth, 12), // Minimum store width
      depth: Math.max(requiredDepth, 10), // Minimum store depth
      height: ceilingHeight
    };
  }














  

  


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

  public getStoreStats() {
    const config = this.createDefaultLayout();
    return {
      totalShelves: config.sections.reduce((sum, section) => sum + section.shelfCount, 0),
      sections: config.sections.length,
      storeSize: { width: config.width, height: config.height, depth: config.depth }
    };
  }

  public dispose(): void {
    this.clearStore();
    this.scene.remove(this.storeGroup);
  }
}
