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
   * Create MDF veneer material for shelf external surfaces (Task 6.1.1.1)
   */
  private createMDFVeneerMaterial(): THREE.Material {
    return this.textureManager.createMDFVeneerMaterial({
      repeat: { x: 2, y: 1 }, // Wood grain runs along the length
      veneerColor: '#E6D3B7', // Light oak veneer
      glossiness: 0.4, // Semi-gloss finish
      grainSubtlety: 0.2 // Subtle grain pattern
    });
  }

  /**
   * Create glossy white interior material for shelf compartments
   */
  private createShelfInteriorMaterial(): THREE.Material {
    return this.textureManager.createShelfInteriorMaterial({
      glossLevel: 0.8 // High gloss white
    });
  }

  /**
   * Create brand blue material for support posts and brackets
   */
  private createBrandAccentMaterial(): THREE.Material {
    return this.textureManager.createBrandAccentMaterial({
      brandColor: '#0066CC', // Consistent brand blue
      glossLevel: 0.7 // Semi-gloss finish
    });
  }

  /**
   * @deprecated Legacy wood material - use MDF veneer materials instead
   */
  private createWoodMaterial(): THREE.Material {
    // Fallback to MDF veneer for compatibility
    return this.createMDFVeneerMaterial();
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
    
    // Get materials for different components (Task 6.1.1.1)
    const mdfVeneerMaterial = this.createMDFVeneerMaterial(); // External surfaces
    const shelfInteriorMaterial = this.createShelfInteriorMaterial(); // Interior compartments  
    const brandAccentMaterial = this.createBrandAccentMaterial(); // Support posts/brackets
    
    // Create the two angled boards (front and back) - MDF veneer exterior
    const angledBoardGeometry = new THREE.BoxGeometry(
      width,
      height,
      boardThickness
    );

    // Front angled board
    const frontBoard = new THREE.Mesh(angledBoardGeometry, mdfVeneerMaterial);
    frontBoard.position.set(0, height / 2, depth / 2);
    frontBoard.rotation.x = -angleRad; // Changed from z to x, negative for backward lean
    frontBoard.castShadow = true;
    frontBoard.receiveShadow = true;
    shelfGroup.add(frontBoard);

    // Back angled board  
    const backBoard = new THREE.Mesh(angledBoardGeometry, mdfVeneerMaterial);
    backBoard.position.set(0, height / 2, -depth / 2);
    backBoard.rotation.x = angleRad; // Changed from z to x, positive for backward lean
    backBoard.castShadow = true;
    backBoard.receiveShadow = true;
    shelfGroup.add(backBoard);

    // Create the two side boards - Brand blue support posts
    const sideBoardGeometry = new THREE.BoxGeometry(
      boardThickness,
      height,
      depth
    );

    // Left side board (brand blue support post)
    const leftBoard = new THREE.Mesh(sideBoardGeometry, brandAccentMaterial);
    leftBoard.position.set(-width / 2, height / 2, 0);
    leftBoard.castShadow = true;
    leftBoard.receiveShadow = true;
    shelfGroup.add(leftBoard);

    // Right side board (brand blue support post)
    const rightBoard = new THREE.Mesh(sideBoardGeometry, brandAccentMaterial);
    rightBoard.position.set(width / 2, height / 2, 0);
    rightBoard.castShadow = true;
    rightBoard.receiveShadow = true;
    shelfGroup.add(rightBoard);

    // Create horizontal shelves with different materials for top/bottom surfaces
    this.addHorizontalShelvesWithMaterials(shelfGroup, width, height, depth, shelfCount, boardThickness, angleRad, mdfVeneerMaterial, shelfInteriorMaterial);

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
    interiorMaterial: THREE.Material
  ): void {
    const shelfSpacing = height / (shelfCount + 1);

    for (let i = 1; i <= shelfCount; i++) {
      const shelfY = i * shelfSpacing;
      
      // Calculate shelf width at this height due to angled sides
      const widthAtHeight = width - 2 * (height - shelfY) * Math.tan(angleRad);
      
      // Create shelf board with MDF veneer exterior
      const shelfGeometry = new THREE.BoxGeometry(
        widthAtHeight,
        boardThickness,
        depth - boardThickness * 2 // Account for front/back board thickness
      );

      const shelf = new THREE.Mesh(shelfGeometry, exteriorMaterial);
      shelf.position.set(0, shelfY, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      parent.add(shelf);

      // Create white interior surface on top of shelf (compartment floor)
      const interiorGeometry = new THREE.BoxGeometry(
        widthAtHeight * 0.98, // Slightly smaller to sit on top
        boardThickness * 0.1, // Very thin interior surface
        (depth - boardThickness * 2) * 0.98
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
    this.addHorizontalShelvesWithMaterials(parent, width, height, depth, shelfCount, boardThickness, angleRad, woodMaterial, woodMaterial);
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
