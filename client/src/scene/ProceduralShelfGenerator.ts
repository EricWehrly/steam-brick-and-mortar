import * as THREE from 'three';
import { TextureManager } from '../utils/TextureManager';

/**
 * Procedural shelf generator for Phase 2 research
 * Creates a triangular shelf unit with angled boards and horizontal shelves
 */
export class ProceduralShelfGenerator {
  private scene: THREE.Scene;
  private textureManager: TextureManager;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.textureManager = TextureManager.getInstance();
  }

  /**
   * Create a wood material for shelves
   */
  private createWoodMaterial(): THREE.Material {
    // Use simple wood material for now, can be enhanced with textures later
    return this.textureManager.createSimpleWoodMaterial(new THREE.Color(0x8B4513));
  }

  /**
   * Generate a triangular shelf unit with the specified design:
   * - Two angled boards forming a /\ shape (10-15 degree angle)
   * - Two side boards for support
   * - Horizontal shelves spanning across
   */
  public generateShelfUnit(position: THREE.Vector3, options: {
    width?: number;
    height?: number;
    depth?: number;
    angle?: number; // Angle of the slanted boards in degrees
    shelfCount?: number;
    boardThickness?: number;
  } = {}): THREE.Group {
    const {
      width = 2.0,
      height = 2.0,
      depth = 0.4,
      angle = 12, // 12 degrees from vertical
      shelfCount = 4,
      boardThickness = 0.05
    } = options;

    const shelfGroup = new THREE.Group();
    shelfGroup.position.copy(position);

    // Calculate dimensions
    const angleRad = (angle * Math.PI) / 180;
    // Note: topWidth calculated but not used in this simple version
    // const topWidth = width - 2 * height * Math.tan(angleRad);
    
    // Get wood material
    const woodMaterial = this.createWoodMaterial();
    
    // Create the two angled boards (front and back)
    const angledBoardGeometry = new THREE.BoxGeometry(
      width,
      height,
      boardThickness
    );

    // Front angled board
    const frontBoard = new THREE.Mesh(angledBoardGeometry, woodMaterial);
    frontBoard.position.set(0, height / 2, depth / 2);
    frontBoard.rotation.z = angleRad;
    shelfGroup.add(frontBoard);

    // Back angled board
    const backBoard = new THREE.Mesh(angledBoardGeometry, woodMaterial);
    backBoard.position.set(0, height / 2, -depth / 2);
    backBoard.rotation.z = -angleRad;
    shelfGroup.add(backBoard);

    // Create the two side boards
    const sideBoardGeometry = new THREE.BoxGeometry(
      boardThickness,
      height,
      depth
    );

    // Left side board
    const leftBoard = new THREE.Mesh(sideBoardGeometry, woodMaterial);
    leftBoard.position.set(-width / 2, height / 2, 0);
    shelfGroup.add(leftBoard);

    // Right side board
    const rightBoard = new THREE.Mesh(sideBoardGeometry, woodMaterial);
    rightBoard.position.set(width / 2, height / 2, 0);
    shelfGroup.add(rightBoard);

    // Create horizontal shelves
    this.addHorizontalShelves(shelfGroup, width, height, depth, shelfCount, boardThickness, angleRad, woodMaterial);

    return shelfGroup;
  }

  /**
   * Add horizontal shelves that span across the triangular unit
   */
  private addHorizontalShelves(
    parent: THREE.Group,
    width: number,
    height: number,
    depth: number,
    shelfCount: number,
    boardThickness: number,
    angleRad: number,
    woodMaterial: THREE.Material
  ): void {
    const shelfSpacing = height / (shelfCount + 1);

    for (let i = 1; i <= shelfCount; i++) {
      const shelfY = i * shelfSpacing;
      
      // Calculate shelf width at this height due to angled sides
      const widthAtHeight = width - 2 * (height - shelfY) * Math.tan(angleRad);
      
      const shelfGeometry = new THREE.BoxGeometry(
        widthAtHeight,
        boardThickness,
        depth - boardThickness * 2 // Account for front/back board thickness
      );

      const shelf = new THREE.Mesh(shelfGeometry, woodMaterial);
      shelf.position.set(0, shelfY, 0);
      parent.add(shelf);
    }
  }

  /**
   * Create a simple test scene with one shelf unit
   */
  public createTestScene(): THREE.Group {
    const testGroup = new THREE.Group();
    
    // Create a single shelf unit for testing
    const shelf = this.generateShelfUnit(
      new THREE.Vector3(0, 0, 0),
      {
        width: 2.0,
        height: 2.0,
        depth: 0.4,
        angle: 12,
        shelfCount: 4,
        boardThickness: 0.05
      }
    );

    testGroup.add(shelf);
    return testGroup;
  }

  /**
   * Generate a row of shelf units for store layout
   */
  public generateShelfRow(
    startPosition: THREE.Vector3,
    unitCount: number,
    spacing: number = 2.2
  ): THREE.Group {
    const rowGroup = new THREE.Group();
    
    for (let i = 0; i < unitCount; i++) {
      const position = new THREE.Vector3(
        startPosition.x + i * spacing,
        startPosition.y,
        startPosition.z
      );
      
      const shelf = this.generateShelfUnit(position);
      rowGroup.add(shelf);
    }
    
    return rowGroup;
  }
}
