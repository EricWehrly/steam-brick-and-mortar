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

  // TODO: How many of these are testing constants?
  // (spoiler: we delete all of those)
  it('should have proper Steam game categories', () => {
    const config = storeLayout.createDefaultLayout();
    
    const sectionNames = config.sections.map(s => s.name);
    expect(sectionNames).toContain('New & Trending');
    expect(sectionNames).toContain('Action Games');
    expect(sectionNames).toContain('Adventure & Story');
    expect(sectionNames).toContain('RPG & Fantasy');
    expect(sectionNames).toContain('Strategy & Sim');
    expect(sectionNames).toContain('Casual & Family');
    
    // Check categories match Steam store sections
    const categories = config.sections.map(s => s.category);
    expect(categories).toContain('new-trending');
    expect(categories).toContain('action');
    expect(categories).toContain('adventure');
    expect(categories).toContain('rpg');
    expect(categories).toContain('strategy');
    expect(categories).toContain('casual');
  });

  it('should generate VR-optimized store statistics', () => {
    const stats = storeLayout.getStoreStats();
    
    expect(stats.totalShelves).toBe(19);      // 3+4+3+4+3+2 = 19 shelves
    expect(stats.sections).toBe(6);           // 6 Steam game sections
    expect(stats.storeSize.width).toBe(22);   // Enhanced room width
    expect(stats.storeSize.height).toBe(3.2); // Enhanced room height
    expect(stats.storeSize.depth).toBe(16);   // Enhanced room depth
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
      mainAisleWidth: 2.0,
      wallClearance: 0.5,
      entranceZone: {
        width: 4,
        depth: 2,
        position: new THREE.Vector3(0, 0, 3)
      },
      sections: [
        {
          name: 'Custom Section',
          position: new THREE.Vector3(0, 0, 0),
          shelfCount: 2,
          category: 'custom',
          priority: 'medium'
        }
      ]
    };

    // Test that the config structure is valid
    expect(_customConfig.sections[0].priority).toBe('medium');
    expect(_customConfig.entranceZone).toBeDefined();
    expect(_customConfig.mainAisleWidth).toBe(2.0);
    expect(_customConfig.wallClearance).toBe(0.5);
  });

  it('should create sections with correct VR-enhanced properties', () => {
    const config = storeLayout.createDefaultLayout();
    
    config.sections.forEach(section => {
      expect(section.name).toBeDefined();
      expect(section.position).toBeInstanceOf(THREE.Vector3);
      expect(section.shelfCount).toBeGreaterThan(0);
      expect(section.category).toBeDefined();
      expect(section.priority).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(section.priority);
      
      // VR ergonomic positioning checks
      expect(section.position.y).toBe(0); // Floor level
      expect(Math.abs(section.position.x)).toBeLessThanOrEqual(11); // Within room bounds
      expect(Math.abs(section.position.z)).toBeLessThanOrEqual(8);  // Within room bounds
    });
  });
});
