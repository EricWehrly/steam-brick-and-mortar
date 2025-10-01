import * as THREE from 'three';
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator';
import { TextureManager } from '../utils/TextureManager';
import { RoomStructureBuilder } from './RoomStructureBuilder';
import { Logger } from '../utils/Logger';
import { GameBoxRenderer } from './GameBoxRenderer';

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
  private static readonly logger = Logger.withContext('StoreLayout')
  
  private scene: THREE.Scene;
  private shelfGenerator: ProceduralShelfGenerator | null = null;
  private textureManager: TextureManager;
  private roomBuilder: RoomStructureBuilder;
  private gameBoxRenderer: GameBoxRenderer;
  private readonly storeGroup: THREE.Group;

  constructor(scene?: THREE.Scene) {
    this.storeGroup = new THREE.Group()
    this.storeGroup.name = "StoreLayout"
    this.gameBoxRenderer = new GameBoxRenderer()
    this.textureManager = TextureManager.getInstance()
    this.roomBuilder = new RoomStructureBuilder()
    
    if (scene) {
      this.scene = scene;
      this.shelfGenerator = new ProceduralShelfGenerator(scene);
    }
  }

  // TODO: I think we can delete this method and just call the configfactory directly.
  // some tests are gonna need to get updated (or deleted) tho
  /**
   * Create VR-optimized Steam store layout based on Phase 2C research
   * Enhanced dimensions, Steam categories, and VR ergonomics
   */
  public createDefaultLayout(): StoreLayoutConfig {
    return StoreLayoutConfigFactory.createDefaultLayout();
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
   * Create single test shelf for game spawning development
   * Uses ProceduralShelfGenerator with optional signage
   */
  private async createShelfSectionsGPUOptimized(config: StoreLayoutConfig): Promise<void> {
    // Creating single test shelf "The Shelf" for game spawning development
    
    // Create single centered shelf for testing
    const testShelfGroup = new THREE.Group();
    testShelfGroup.name = "TheShelf";
    
    // Position shelf in front of player (offset forward)
    const shelfPosition = new THREE.Vector3(0, 0, -3);
    testShelfGroup.position.copy(shelfPosition);
    
    // Initialize shelf generator if needed (fallback for when no scene was provided)
    if (!this.shelfGenerator) {
      this.shelfGenerator = new ProceduralShelfGenerator(this.scene || this.storeGroup as any);
    }
    
    // Generate single shelf with MDF veneer materials (at origin since parent group handles positioning)
    const shelfUnit = this.shelfGenerator.generateShelfUnit(new THREE.Vector3(0, 0, 0));
    testShelfGroup.add(shelfUnit);
    
    // Add optional signage - example with "The Shelf" title
    this.addOptionalSectionLabel(testShelfGroup, "The Shelf", shelfPosition);
    
    // Add spotlight above the shelf
    this.addShelfSpotlight(shelfPosition);
    
    // Spawn game boxes using smart shelf positioning
    this.spawnGamesOnShelf(shelfUnit, testShelfGroup);

    this.storeGroup.add(testShelfGroup);    // Single test shelf created with spotlight and game boxes
  }

  /**
   * Add optional section label above shelves - only if title is provided
   */
  private addOptionalSectionLabel(sectionGroup: THREE.Group, title: string | null, position: THREE.Vector3): void {
    if (!title) return; // No label if no title provided
    
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
    
    ctx.fillText(title, canvas.width / 2, canvas.height / 2);
    
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
      position.x,
      2.3, // Above shelf height
      position.z
    );
    
    sectionGroup.add(label);
  }

  /**
   * Add a section label above the shelves using proper text signage (legacy method)
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
   * Add spotlight above a shelf for focused illumination
   */
  private addShelfSpotlight(position: THREE.Vector3): void {
    const spotlight = new THREE.SpotLight(0xffffff, 2.0, 10, Math.PI / 6, 0.5, 2);
    spotlight.position.set(
      position.x,
      4.0, // Above the shelf
      position.z + 1.0 // Slightly forward for better angle
    );
    spotlight.target.position.copy(position);
    
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 1024;
    spotlight.shadow.mapSize.height = 1024;
    spotlight.shadow.camera.near = 0.5;
    spotlight.shadow.camera.far = 10;
    
    this.storeGroup.add(spotlight);
    this.storeGroup.add(spotlight.target);
  }

  /**
   * Create entrance area with checkout (Task 6.1.1.1: Updated with MDF veneer material)
   */
  private createEntranceArea(config: StoreLayoutConfig): void {
    // Simple entrance marker with MDF veneer finish
    const entranceGeometry = new THREE.BoxGeometry(3, 0.1, 2);
    const entranceMaterial = this.textureManager.createMDFVeneerMaterial({
      repeat: { x: 3, y: 2 },
      veneerColor: '#E6D3B7'
    });
    
    const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
    entrance.position.set(0, 0.05, config.depth / 2 - 1);
    this.storeGroup.add(entrance);
  }

  /**
   * Spawn test game boxes on the shelf using GameBoxRenderer
   */
  /**
   * Smart game spawning that analyzes shelf geometry to find proper positioning
   */
  private spawnGamesOnShelf(shelfUnit: THREE.Group, parentGroup: THREE.Group): void {
    console.log(`🎯 SMART POSITIONING: Analyzing shelf geometry for game placement`);
    
    // Find all shelf surfaces in the unit
    const shelfSurfaces = this.findShelfSurfaces(shelfUnit);
    console.log(`📚 Found ${shelfSurfaces.length} shelf surfaces`);
    
    // Use all shelf surfaces now that positioning is working
    console.log(`🎯 SPAWNING: Using all ${shelfSurfaces.length} shelf surface(s)`);
    
    // Spawn games on each shelf surface
    shelfSurfaces.forEach((surface, index) => {
      console.log(`📦 Spawning games on shelf ${index + 1} at height ${surface.topY.toFixed(3)}`);
      this.spawnGamesOnSurface(surface, parentGroup, index);
    });
  }
  
  /**
   * Find shelf surfaces by analyzing the shelf unit geometry
   */
  private findShelfSurfaces(shelfUnit: THREE.Group): Array<{topY: number, frontZ: number, centerX: number, width: number}> {
    const surfaces: Array<{topY: number, frontZ: number, centerX: number, width: number}> = [];
    
    // Traverse the shelf unit to find horizontal surfaces (shelves)
    shelfUnit.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
        const box = new THREE.Box3().setFromObject(child);
        const size = box.getSize(new THREE.Vector3());
        
        // Look for horizontal surfaces (wide, not very tall, reasonable depth)
        if (size.x > 1.5 && size.y < 0.1 && size.z > 0.3) { // Wide, thin, deep = shelf surface
          surfaces.push({
            topY: box.max.y,
            frontZ: box.min.z, // Front edge of shelf
            centerX: (box.min.x + box.max.x) / 2,
            width: size.x
          });
          console.log(`� Found shelf surface: Y=${box.max.y.toFixed(3)}, frontZ=${box.min.z.toFixed(3)}, width=${size.x.toFixed(2)}`);
        }
      }
    });
    
    // Sort by height (bottom to top)
    return surfaces.sort((a, b) => a.topY - b.topY);
  }
  
  /**
   * Spawn games on a specific shelf surface using GameBoxRenderer
   */
  private spawnGamesOnSurface(surface: {topY: number, frontZ: number, centerX: number, width: number}, parentGroup: THREE.Group, shelfIndex: number): void {
    // === TUNING PARAMETERS - Easy to adjust! ===
    const GAME_HEIGHT = 0.2;           // Height of game boxes
    const Z_OFFSET = -0.25;            // FLIPPED SIGN! Move games toward player (negative Z = toward camera)
    const Y_OFFSET_ABOVE_SHELF = 0.1;  // How high above shelf surface to place games
    
    // === Convert world coordinates to local coordinates ===
    const parentWorldPos = parentGroup.getWorldPosition(new THREE.Vector3());
    console.log(`   📐 Parent group world position:`, parentWorldPos);
    
    // Calculate game position in world coordinates first
    const gameWorldY = surface.topY + Y_OFFSET_ABOVE_SHELF + GAME_HEIGHT / 2;
    const gameWorldZ = surface.frontZ// + Z_OFFSET; // FLIPPED: negative means toward player  
    const gameWorldX = surface.centerX;
    
    // Convert to local coordinates relative to parent group
    const gameY = gameWorldY - parentWorldPos.y;
    const gameZ = gameWorldZ// - parentWorldPos.z;
    const gameX = gameWorldX - parentWorldPos.x;
    
    console.log(`SHELF ${shelfIndex + 1} POSITIONING:`);
    
    console.log(`🎯 POSITIONING DEBUG for shelf ${shelfIndex + 1}:`);
    console.log(`   📚 Shelf surface (world): X=${surface.centerX.toFixed(3)}, Y=${surface.topY.toFixed(3)}, Z=${surface.frontZ.toFixed(3)}`);
    console.log(`   📐 Parent group (world): X=${parentWorldPos.x.toFixed(3)}, Y=${parentWorldPos.y.toFixed(3)}, Z=${parentWorldPos.z.toFixed(3)}`);
    console.log(`   � Game position (world): X=${gameWorldX.toFixed(3)}, Y=${gameWorldY.toFixed(3)}, Z=${gameWorldZ.toFixed(3)}`);
    console.log(`   🎯 Game position (local): X=${gameX.toFixed(3)}, Y=${gameY.toFixed(3)}, Z=${gameZ.toFixed(3)}`);
    console.log(`   ⚙️ Offsets: Y_OFFSET=${Y_OFFSET_ABOVE_SHELF}, Z_OFFSET=${Z_OFFSET}`);
    
    // === Simple config for GameBoxRenderer ===
    const shelfConfig = {
      surfaceY: gameY,
      centerZ: gameZ,
      centerX: gameX,
      maxGames: 5,
      spacing: 0.35
    };
    
    console.log(`📦 GameBoxRenderer config for shelf ${shelfIndex + 1}:`, shelfConfig);
    
    // Update GameBoxRenderer configuration using proper method
    this.gameBoxRenderer.updateShelfConfig(shelfConfig);
    
    // Create games with GameBoxRenderer
    const gameBoxes = this.gameBoxRenderer.createPlaceholderBoxes(5);
    
    // Move games to our parent group and log their final positions
    gameBoxes.forEach((box, boxIndex) => {
      box.name = `game-shelf${shelfIndex + 1}-box${boxIndex + 1}`;
      console.log(`   🎮 Game box ${boxIndex + 1} local position before:`, box.position);
      parentGroup.add(box);
      const worldPos = box.getWorldPosition(new THREE.Vector3());
      console.log(`   🌍 Game box ${boxIndex + 1} world position after:`, worldPos);
    });
    
    console.log(`✅ Added ${gameBoxes.length} games to shelf ${shelfIndex + 1} using GameBoxRenderer`);
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
