import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ProceduralShelfGenerator } from '../../src/scene/ProceduralShelfGenerator';
import { StoreLayout } from '../../src/scene/StoreLayout';

// Mock global performance
Object.defineProperty(globalThis, 'performance', {
  value: {
    now: vi.fn(() => Date.now())
  },
  writable: true
});

describe('Performance Tests', () => {
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let _camera: THREE.PerspectiveCamera;
  let shelfGenerator: ProceduralShelfGenerator;
  let storeLayout: StoreLayout;

  beforeEach(() => {
    // Create a minimal WebGL context for testing
    scene = new THREE.Scene();
    _camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    
    // Create a minimal canvas for WebGL context
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      renderer.setSize(512, 512);
    } catch {
      console.warn('WebGL not available in test environment, skipping renderer tests');
    }
    
    shelfGenerator = new ProceduralShelfGenerator(scene);
    storeLayout = new StoreLayout(scene);
  });

  describe('Shelf Generation Performance', () => {
    it('should generate a single shelf unit quickly', () => {
      const startTime = performance.now();
      
      const shelf = shelfGenerator.generateShelfUnit(new THREE.Vector3(0, 0, 0));
      
      const endTime = performance.now();
      const generationTime = endTime - startTime;
      
      expect(shelf).toBeInstanceOf(THREE.Group);
      // First shelf takes longer due to texture/material initialization
      expect(generationTime).toBeLessThan(5000); // Allow for cold start overhead
      
      console.log(`Single shelf generation time: ${generationTime.toFixed(2)}ms (includes initial setup)`);
    });

    it('should generate 10 shelf units quickly', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 10; i++) {
        const shelf = shelfGenerator.generateShelfUnit(new THREE.Vector3(i * 2.2, 0, 0));
        scene.add(shelf);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / 10;
      
      expect(totalTime).toBeLessThan(50); // Should be under 50ms total
      expect(avgTime).toBeLessThan(10); // Should be under 10ms per shelf
      
      console.log(`10 shelves generation time: ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(2)}ms per shelf)`);
    });

    it('should generate 50 shelf units within reasonable time', () => {
      const startTime = performance.now();
      
      // Create a 5x10 grid of shelves
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 10; col++) {
          const shelf = shelfGenerator.generateShelfUnit(
            new THREE.Vector3(col * 2.2, 0, row * 2.5)
          );
          scene.add(shelf);
        }
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / 50;
      
      expect(totalTime).toBeLessThan(250); // Should be under 250ms total
      expect(avgTime).toBeLessThan(10); // Should be under 10ms per shelf
      
      console.log(`50 shelves generation time: ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(2)}ms per shelf)`);
    });
  });

  describe('Memory Usage', () => {
    it('should track geometry and material creation', () => {
      // Track memory objects (for documentation purposes)
      const _initialMemory = {
        geometries: 0,
        materials: 0,
        textures: 0
      };

      // Create 20 shelf units
      const shelves = [];
      for (let i = 0; i < 20; i++) {
        const shelf = shelfGenerator.generateShelfUnit(new THREE.Vector3(i * 2.2, 0, 0));
        shelves.push(shelf);
        scene.add(shelf);
      }

      // Count created objects
      let geometryCount = 0;
      
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometryCount++;
        }
      });

      console.log(`20 shelves created ${geometryCount} mesh objects`);
      expect(geometryCount).toBeGreaterThan(0);
      
      // Each shelf should have 8 meshes (2 angled + 2 side + 4 horizontal)
      expect(geometryCount).toBe(20 * 8);
    });
  });

  describe('Store Layout Performance', () => {
    it('should generate complete store layout quickly', () => {
      const startTime = performance.now();
      
      // Generate a complete store (this is async, but we can test the sync parts)
      const config = storeLayout.createDefaultLayout();
      
      const endTime = performance.now();
      const configTime = endTime - startTime;
      
      expect(config).toBeDefined();
      expect(configTime).toBeLessThan(1); // Configuration should be instant
      
      console.log(`Store layout configuration time: ${configTime.toFixed(2)}ms`);
    });

    it('should provide store statistics', () => {
      const startTime = performance.now();
      
      const stats = storeLayout.getStoreStats();
      
      const endTime = performance.now();
      const statsTime = endTime - startTime;
      
      expect(stats.totalShelves).toBeGreaterThan(0);
      expect(stats.sections).toBeGreaterThan(0);
      expect(statsTime).toBeLessThan(2); // Stats should be very fast
      
      console.log(`Store statistics: ${stats.totalShelves} shelves, ${stats.sections} sections`);
      console.log(`Stats calculation time: ${statsTime.toFixed(2)}ms`);
    });
  });

  describe('Rendering Performance Estimation', () => {
    it('should estimate triangle count for performance', () => {
      // Generate 50 shelf units to match the claim
      const shelves = [];
      for (let i = 0; i < 50; i++) {
        const shelf = shelfGenerator.generateShelfUnit(new THREE.Vector3(i * 2.2, 0, 0));
        shelves.push(shelf);
        scene.add(shelf);
      }

      let totalTriangles = 0;
      let totalVertices = 0;
      
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.geometry) {
          const geometry = object.geometry;
          if (geometry instanceof THREE.BufferGeometry) {
            const positionAttr = geometry.getAttribute('position');
            if (positionAttr) {
              totalVertices += positionAttr.count;
              // BoxGeometry has 2 triangles per face, 6 faces = 12 triangles per box
              totalTriangles += 12;
            }
          }
        }
      });

      console.log(`50 shelf units statistics:`);
      console.log(`- Total triangles: ${totalTriangles}`);
      console.log(`- Total vertices: ${totalVertices}`);
      console.log(`- Average triangles per shelf: ${totalTriangles / 50}`);
      
      // Modern VR headsets can handle 10-100k triangles at 90fps
      // Our estimate should be well within that range
      expect(totalTriangles).toBeLessThan(10000); // Should be under 10k triangles
      expect(totalTriangles).toBeGreaterThan(0);
    });
  });

  describe('Performance Benchmark', () => {
    it('should benchmark realistic VR scenario', () => {
      console.log('\n=== VR Performance Benchmark ===');
      
      // Test 1: Generation time for full store
      const genStart = performance.now();
      const config = storeLayout.createDefaultLayout();
      const totalShelves = config.sections.reduce((sum, section) => sum + section.shelfCount, 0);
      
      for (let i = 0; i < totalShelves; i++) {
        const shelf = shelfGenerator.generateShelfUnit(new THREE.Vector3(i * 2.2, 0, 0));
        scene.add(shelf);
      }
      
      const genEnd = performance.now();
      const generationTime = genEnd - genStart;
      
      // Test 2: Memory usage
      let meshCount = 0;
      let triangleCount = 0;
      
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          meshCount++;
          triangleCount += 12; // BoxGeometry has 12 triangles
        }
      });
      
      console.log(`Full store generation results:`);
      console.log(`- Total shelves: ${totalShelves}`);
      console.log(`- Generation time: ${generationTime.toFixed(2)}ms`);
      console.log(`- Average time per shelf: ${(generationTime / totalShelves).toFixed(2)}ms`);
      console.log(`- Total mesh objects: ${meshCount}`);
      console.log(`- Total triangles: ${triangleCount}`);
      console.log(`- Triangles per shelf: ${triangleCount / totalShelves}`);
      
      // VR Performance Assessment
      const triangleLimit = 50000; // Conservative estimate for VR
      const frameTimeLimit = 11.11; // 90fps = 11.11ms per frame
      
      console.log(`\nVR Performance Assessment:`);
      console.log(`- Triangle count: ${triangleCount} / ${triangleLimit} (${((triangleCount / triangleLimit) * 100).toFixed(1)}%)`);
      console.log(`- Generation fits in frame budget: ${generationTime < frameTimeLimit ? 'YES' : 'NO'}`);
      
      // Realistic expectations
      expect(triangleCount).toBeLessThan(triangleLimit);
      expect(generationTime).toBeLessThan(100); // Should generate within 100ms
    });
  });
});
