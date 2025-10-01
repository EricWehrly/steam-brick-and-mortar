import * as THREE from 'three';
import { ProceduralShelfGenerator } from './ProceduralShelfGenerator';
import { TextureManager } from '../utils/TextureManager';
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
  private gameBoxRenderer: GameBoxRenderer;
  private readonly storeGroup: THREE.Group;

  constructor(scene?: THREE.Scene) {
    this.storeGroup = new THREE.Group()
    this.storeGroup.name = "StoreLayout"
    this.gameBoxRenderer = new GameBoxRenderer()
    this.textureManager = TextureManager.getInstance()
    
    if (scene) {
      this.scene = scene;
      this.shelfGenerator = new ProceduralShelfGenerator(scene);
    }
  }

  public createDefaultLayout(): StoreLayoutConfig {
    return StoreLayoutConfigFactory.createDefaultLayout();
  }

  public async generateBasicRoom(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<THREE.Group> {
    this.clearStore();
    this.createEntranceArea(config);
    StoreLayout.logger.info('Basic room ready');
    return this.storeGroup;
  }

  public async generateShelvesGPUOptimized(config: StoreLayoutConfig = this.createDefaultLayout()): Promise<THREE.Group> {
    this.clearStore();
    await this.createShelfSectionsGPUOptimized(config);
    this.createEntranceArea(config);
    StoreLayout.logger.info('GPU-optimized shelves generated');
    return this.storeGroup;
  }

  private async createShelfSectionsGPUOptimized(config: StoreLayoutConfig): Promise<void> {
    
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
    
    this.addSectionLabel(testShelfGroup, "The Shelf", shelfPosition);
    
    // Add spotlight above the shelf
    this.addShelfSpotlight(shelfPosition);
    
    // Spawn game boxes using smart shelf positioning
    this.spawnGamesOnShelf(shelfUnit, testShelfGroup);

    this.storeGroup.add(testShelfGroup);    // Single test shelf created with spotlight and game boxes
  }

  private addSectionLabel(sectionGroup: THREE.Group, title: string, position: THREE.Vector3): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#000080';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.5),
      new THREE.MeshStandardMaterial({ map: texture, transparent: true })
    );
    label.position.set(position.x, 2.3, position.z);
    sectionGroup.add(label);
  }

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

  private createEntranceArea(config: StoreLayoutConfig): void {
    const entranceGeometry = new THREE.BoxGeometry(3, 0.1, 2);
    const entranceMaterial = this.textureManager.createMDFVeneerMaterial({
      repeat: { x: 3, y: 2 },
      veneerColor: '#E6D3B7'
    });
    
    const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
    entrance.position.set(0, 0.05, config.depth / 2 - 1);
    this.storeGroup.add(entrance);
  }

  private spawnGamesOnShelf(shelfUnit: THREE.Group, parentGroup: THREE.Group): void {
    const shelfSurfaces = this.findShelfSurfaces(shelfUnit);
    console.log(`📚 Found ${shelfSurfaces.length} shelf surfaces`);
    
    shelfSurfaces.forEach((surface, index) => {
      this.spawnGamesOnSurface(surface, parentGroup, index);
    });
  }
  
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
    
    const gameBoxes = this.gameBoxRenderer.createPlaceholderBoxes(5, shelfConfig);
    
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
