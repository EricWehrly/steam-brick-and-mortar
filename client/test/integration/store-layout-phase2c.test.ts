import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';

// Mock TextureManager to avoid async texture loading issues
vi.mock('../../src/utils/TextureManager', async () => {
  const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock');
  return {
    TextureManager: {
      getInstance: () => MockTextureManager.getInstance()
    }
  };
});

import { StoreLayout, VR_ERGONOMICS, STEAM_STORE_SECTIONS } from '../../src/scene/StoreLayout';

describe('StoreLayout - Phase 2C Integration', () => {
  let scene: THREE.Scene;
  let storeLayout: StoreLayout;

  beforeEach(() => {
    scene = new THREE.Scene();
    storeLayout = new StoreLayout(scene);
  });

  it('should generate complete VR-optimized store layout', async () => {
    // Generate the complete store
    await storeLayout.generateStore();
    
    const storeGroup = storeLayout.getStoreGroup();
    expect(storeGroup.children.length).toBeGreaterThan(10); // Should have multiple elements
    
    // Verify VR ergonomic constants are properly set
    expect(VR_ERGONOMICS.COMFORTABLE_AISLE_WIDTH).toBe(2.2);
    expect(VR_ERGONOMICS.OPTIMAL_INTERACTION_DISTANCE).toBe(1.2);
    expect(VR_ERGONOMICS.SHELF_MAX_HEIGHT).toBe(2.0);
  }, 10000); // Increase timeout to 10 seconds for texture loading

  it('should include all Steam store section categories', () => {
    const config = storeLayout.createDefaultLayout();
    
    // Verify all Steam categories are present
    const categories = config.sections.map(s => s.category);
    
    expect(categories).toContain(STEAM_STORE_SECTIONS.NEW_TRENDING);
    expect(categories).toContain(STEAM_STORE_SECTIONS.ACTION);
    expect(categories).toContain(STEAM_STORE_SECTIONS.ADVENTURE);
    expect(categories).toContain(STEAM_STORE_SECTIONS.RPG);
    expect(categories).toContain(STEAM_STORE_SECTIONS.STRATEGY);
    expect(categories).toContain(STEAM_STORE_SECTIONS.CASUAL);
  });

  it('should have VR-optimized room dimensions and spacing', () => {
    const config = storeLayout.createDefaultLayout();
    
    // VR-enhanced room dimensions
    expect(config.width).toBe(22);   // Enhanced from 20m
    expect(config.depth).toBe(16);   // Enhanced from 15m
    expect(config.height).toBe(3.2); // Enhanced from 3m
    
    // VR-optimized spacing
    expect(config.aisleWidth).toBe(VR_ERGONOMICS.COMFORTABLE_AISLE_WIDTH);
    expect(config.mainAisleWidth).toBe(3.0); // Wide central aisle
    expect(config.wallClearance).toBe(1.0);  // Safety clearance
    
    // Enhanced entrance zone
    expect(config.entranceZone.width).toBe(6);  // Full width
    expect(config.entranceZone.depth).toBe(3);  // 3m orientation buffer
  });

  afterEach(() => {
    storeLayout.dispose();
  });
});
