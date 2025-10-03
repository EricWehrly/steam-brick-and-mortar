import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ProceduralShelfGenerator } from '../../../src/scene/ProceduralShelfGenerator';

describe('ProceduralShelfGenerator', () => {
  let scene: THREE.Scene;
  let generator: ProceduralShelfGenerator;

  beforeEach(() => {
    scene = new THREE.Scene();
    generator = new ProceduralShelfGenerator();
  });

  it('should create a shelf unit with correct structure', () => {
    const position = new THREE.Vector3(0, 0, 0);
    const shelf = generator.generateShelfUnit(position);

    expect(shelf).toBeInstanceOf(THREE.Group);
    expect(shelf.position.equals(position)).toBe(true);
    
    // Should have 4 boards + shelves + interior surfaces (Task 6.1.1.1)
    // 2 angled boards + 2 side boards + 3 horizontal shelves + 3 interior surfaces = 10 children (DEFAULT_SHELF_CONFIG.shelfCount = 3)
    expect(shelf.children.length).toBe(10);
  });

  it('should create shelves with correct dimensions', () => {
    const options = {
      width: 2.0,
      height: 2.0,
      depth: 0.4,
      shelfCount: 3,
      boardThickness: 0.05
    };

    const shelf = generator.generateShelfUnit(new THREE.Vector3(0, 0, 0), options);
    
    // Should have 4 boards + 3 shelves + 3 interior surfaces = 10 children (Task 6.1.1.1)
    expect(shelf.children.length).toBe(10);
  });

  it('should create a test scene', () => {
    const testScene = generator.createTestScene();
    
    expect(testScene).toBeInstanceOf(THREE.Group);
    expect(testScene.children.length).toBe(1); // One shelf unit
  });

  it('should create a row of shelf units', () => {
    const startPosition = new THREE.Vector3(0, 0, 0);
    const unitCount = 3;
    const row = generator.generateShelfRow(startPosition, unitCount);

    expect(row).toBeInstanceOf(THREE.Group);
    expect(row.children.length).toBe(unitCount);
  });

  it('should handle different angle configurations', () => {
    const shelf10deg = generator.generateShelfUnit(new THREE.Vector3(0, 0, 0), { angle: 10 });
    const shelf15deg = generator.generateShelfUnit(new THREE.Vector3(0, 0, 0), { angle: 15 });

    expect(shelf10deg).toBeInstanceOf(THREE.Group);
    expect(shelf15deg).toBeInstanceOf(THREE.Group);
    
    // Both should have the same structure
    expect(shelf10deg.children.length).toBe(shelf15deg.children.length);
  });
});
