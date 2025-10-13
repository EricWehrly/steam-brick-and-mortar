import * as THREE from 'three';

import { SharedMaterialManager } from '../utils/SharedMaterialManager';

/**
 * Default shelf configuration
 */
const DEFAULT_SHELF_CONFIG = {
  width: 2.0,
  height: 2.0,
  depth: 0.4,
  angle: 3, // 6 degrees from vertical (reduced for less steep angles)
  shelfCount: 3,
  boardThickness: 0.05,
  shelfExtensionPerLevel: 0.1 // How much each lower shelf extends forward
} as const;

/**
 * Procedural shelf generator for Phase 2 research
 * Creates a triangular shelf unit with angled boards and horizontal shelves
 */
export class ProceduralShelfGenerator {


    private get materialManager(): SharedMaterialManager {
        return SharedMaterialManager.getInstance();
    }

    /**
     * Create MDF veneer material for shelf external surfaces (Task 6.1.1.1)
     * Now uses shared material manager for performance optimization
     */
    private createMDFVeneerMaterial(): THREE.Material {
        return this.materialManager.getShelfMaterial('mdfVeneer');
    }

    /**
     * Create glossy white interior material for shelf compartments
     * Now uses shared material manager for performance optimization
     */
    private createShelfInteriorMaterial(): THREE.Material {
        return this.materialManager.getShelfMaterial('shelfInterior');
    }

    /**
     * Create brand blue material for support posts and brackets
     * Now uses shared material manager for performance optimization
     */
    private createBrandAccentMaterial(): THREE.Material {
        return this.materialManager.getShelfMaterial('brandAccent');
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
    shelfExtensionPerLevel?: number;
  } = {}): THREE.Group {
    const {
      width = DEFAULT_SHELF_CONFIG.width,
      height = DEFAULT_SHELF_CONFIG.height,
      depth = DEFAULT_SHELF_CONFIG.depth,
      angle = DEFAULT_SHELF_CONFIG.angle,
      shelfCount = DEFAULT_SHELF_CONFIG.shelfCount,
      boardThickness = DEFAULT_SHELF_CONFIG.boardThickness,
      shelfExtensionPerLevel = DEFAULT_SHELF_CONFIG.shelfExtensionPerLevel
    } = options;

    const shelfGroup = new THREE.Group();
    shelfGroup.position.copy(position);

    // Calculate dimensions
    const angleRad = (angle * Math.PI) / 180;
    // Note: topWidth calculated but not used in this simple version
    // const topWidth = width - 2 * height * Math.tan(angleRad);
    
    // Get materials for different components (Task 6.1.1.1)
    const mdfVeneerMaterial = this.createMDFVeneerMaterial(); // External surfaces
    const shelfInteriorMaterial = this.createShelfInteriorMaterial(); // Interior compartments  
    const brandAccentMaterial = this.createBrandAccentMaterial(); // Support posts/brackets
    
    // Create the two angled boards (front and back) - MDF veneer exterior
    // TODO: Replace with InstancedMesh for better draw call batching
    const angledBoardGeometry = new THREE.BoxGeometry(
      width,
      height,
      boardThickness
    );

    // Front angled board
    const frontBoard = new THREE.Mesh(angledBoardGeometry, mdfVeneerMaterial);
    frontBoard.position.set(0, height / 2, depth / 2);
    frontBoard.rotation.x = -angleRad; // Changed from z to x, negative for backward lean
    shelfGroup.add(frontBoard);

    // Back angled board  
    const backBoard = new THREE.Mesh(angledBoardGeometry, mdfVeneerMaterial);
    backBoard.position.set(0, height / 2, -depth / 2);
    backBoard.rotation.x = angleRad; // Changed from z to x, positive for backward lean
    shelfGroup.add(backBoard);

    // Create the two side boards - Brand blue support posts
    // TODO: Replace with InstancedMesh for better draw call batching
    const sideBoardGeometry = new THREE.BoxGeometry(
      boardThickness,
      height,
      depth
    );

    // Left side board (brand blue support post) - moved slightly outward to prevent clipping
    const leftBoard = new THREE.Mesh(sideBoardGeometry, brandAccentMaterial);
    leftBoard.position.set(-width / 2 - boardThickness * 0.5, height / 2, 0);
    shelfGroup.add(leftBoard);

    // Right side board (brand blue support post) - moved slightly outward to prevent clipping
    const rightBoard = new THREE.Mesh(sideBoardGeometry, brandAccentMaterial);
    rightBoard.position.set(width / 2 + boardThickness * 0.5, height / 2, 0);
    shelfGroup.add(rightBoard);

    [frontBoard, backBoard, leftBoard, rightBoard].forEach(board => {
      board.castShadow = true;
      board.receiveShadow = true;
    });

    // Create horizontal shelves with different materials for top/bottom surfaces
    this.addHorizontalShelvesWithMaterials(shelfGroup, width, height, depth * 1.5, shelfCount, boardThickness, angleRad, mdfVeneerMaterial, shelfInteriorMaterial, shelfExtensionPerLevel);

    return shelfGroup;
  }

  /**
   * Add horizontal shelves with MDF veneer exterior and white interior (Task 6.1.1.1)
   */
  private addHorizontalShelvesWithMaterials(
    parent: THREE.Group,
    width: number,
    height: number,
    depth: number,
    shelfCount: number,
    boardThickness: number,
    angleRad: number,
    exteriorMaterial: THREE.Material,
    interiorMaterial: THREE.Material,
    shelfExtensionPerLevel: number
  ): void {
    const shelfSpacing = height / (shelfCount + 1);

    for (let i = 1; i <= shelfCount; i++) {
      const shelfY = i * shelfSpacing;
      
      // Calculate shelf width at this height due to angled sides
      const widthAtHeight = width - 2 * (height - shelfY) * Math.tan(angleRad);
      
      // Make lower shelves progressively extend forward (depth direction)
      const shelfFromBottom = shelfCount - i + 1; // 1 for top shelf, shelfCount for bottom
      const depthExtension = (shelfFromBottom - 1) * shelfExtensionPerLevel; // Each lower shelf extends forward
      const shelfDepth = depth - boardThickness * 2 + depthExtension; // Account for front/back board thickness + extension
      
      // Create shelf board with MDF veneer exterior
      // TODO: Replace with InstancedMesh for better draw call batching
      const shelfGeometry = new THREE.BoxGeometry(
        widthAtHeight,
        boardThickness,
        shelfDepth
      );

      const shelf = new THREE.Mesh(shelfGeometry, exteriorMaterial);
      shelf.position.set(0, shelfY, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      parent.add(shelf);

      // Create white interior surface on top of shelf (compartment floor)
      // TODO: Replace with InstancedMesh for better draw call batching
      const interiorGeometry = new THREE.BoxGeometry(
        widthAtHeight * 0.98, // Slightly smaller to sit on top
        boardThickness * 0.1, // Very thin interior surface
        shelfDepth * 0.98 // Match the extended shelf depth
      );

      const interiorSurface = new THREE.Mesh(interiorGeometry, interiorMaterial);
      interiorSurface.position.set(0, shelfY + boardThickness * 0.55, 0); // Slightly above shelf
      interiorSurface.receiveShadow = true;
      parent.add(interiorSurface);
    }
  }

  /**
   * @deprecated Legacy method - use addHorizontalShelvesWithMaterials instead
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
    // Fallback to new method with same material for all surfaces
    this.addHorizontalShelvesWithMaterials(parent, width, height, depth, shelfCount, boardThickness, angleRad, woodMaterial, woodMaterial, DEFAULT_SHELF_CONFIG.shelfExtensionPerLevel);
  }

  /**
   * Create a simple test scene with one shelf unit
   */
  public createTestScene(): THREE.Group {
    const testGroup = new THREE.Group();
    
    // Create a single shelf unit for testing using default configuration
    const shelf = this.generateShelfUnit(
      new THREE.Vector3(0, 0, 0)
      // Uses DEFAULT_SHELF_CONFIG values
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
