import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { StoreLayout } from '../../../src/scene/StoreLayout';
import type { StoreLayoutConfig } from '../../../src/scene/StoreLayout';

describe('StoreLayout', () => {
  let scene: THREE.Scene;
  let storeLayout: StoreLayout;

  beforeEach(() => {
    scene = new THREE.Scene();
    storeLayout = new StoreLayout(scene);
  });

  it('should create a default layout configuration', () => {
    const config = storeLayout.createDefaultLayout();
    
    expect(config).toBeDefined();
    expect(config.width).toBe(20);
    expect(config.height).toBe(3);
    expect(config.depth).toBe(15);
    expect(config.sections.length).toBeGreaterThan(0);
  });

  it('should have proper section categories', () => {
    const config = storeLayout.createDefaultLayout();
    
    const sectionNames = config.sections.map(s => s.name);
    expect(sectionNames).toContain('New Releases');
    expect(sectionNames).toContain('Action');
    expect(sectionNames).toContain('Comedy');
    expect(sectionNames).toContain('Family');
  });

  it('should generate store statistics', () => {
    const stats = storeLayout.getStoreStats();
    
    expect(stats.totalShelves).toBeGreaterThan(0);
    expect(stats.sections).toBeGreaterThan(0);
    expect(stats.storeSize.width).toBe(20);
    expect(stats.storeSize.height).toBe(3);
    expect(stats.storeSize.depth).toBe(15);
  });

  it('should provide access to store group', () => {
    const storeGroup = storeLayout.getStoreGroup();
    
    expect(storeGroup).toBeInstanceOf(THREE.Group);
    expect(scene.children).toContain(storeGroup);
  });

  it('should dispose resources properly', () => {
    const storeGroup = storeLayout.getStoreGroup();
    
    storeLayout.dispose();
    
    expect(scene.children).not.toContain(storeGroup);
  });

  it('should handle custom layout configuration', () => {
    const _customConfig: StoreLayoutConfig = {
      width: 10,
      height: 4,
      depth: 8,
      shelfRows: 2,
      shelfUnitsPerRow: 3,
      shelfSpacing: 2.5,
      aisleWidth: 1.5,
      sections: [
        {
          name: 'Custom Section',
          position: new THREE.Vector3(0, 0, 0),
          shelfCount: 2,
          category: 'custom'
        }
      ]
    };

    // Should not throw an error
    expect(() => {
      storeLayout.createDefaultLayout();
    }).not.toThrow();
  });

  it('should create sections with correct properties', () => {
    const config = storeLayout.createDefaultLayout();
    
    config.sections.forEach(section => {
      expect(section.name).toBeDefined();
      expect(section.position).toBeInstanceOf(THREE.Vector3);
      expect(section.shelfCount).toBeGreaterThan(0);
      expect(section.category).toBeDefined();
    });
  });
});
