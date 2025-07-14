import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { StoreLayout, VR_ERGONOMICS, STEAM_STORE_SECTIONS } from '../../src/scene/StoreLayout';

describe('StoreLayout - Phase 2C Integration', () => {
  let scene: THREE.Scene;
  let storeLayout: StoreLayout;

  beforeEach(() => {
    scene = new THREE.Scene();
    storeLayout = new StoreLayout(scene);
  });

  it('should generate complete VR-optimized store with navigation aids', async () => {
    // Generate the complete store
    await storeLayout.generateStore();
    
    const storeGroup = storeLayout.getStoreGroup();
    expect(storeGroup.children.length).toBeGreaterThan(10); // Should have multiple elements
    
    // Verify VR ergonomic constants are properly set
    expect(VR_ERGONOMICS.COMFORTABLE_AISLE_WIDTH).toBe(2.2);
    expect(VR_ERGONOMICS.OPTIMAL_INTERACTION_DISTANCE).toBe(1.2);
    expect(VR_ERGONOMICS.SHELF_MAX_HEIGHT).toBe(2.0);
  });

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

  it('should position sections for optimal VR interaction', () => {
    const config = storeLayout.createDefaultLayout();
    const waypoints = storeLayout.getNavigationWaypoints();
    
    // Check high-priority sections are in front (easier access)
    const frontSections = config.sections.filter(s => s.position.z > 0);
    const highPrioritySections = frontSections.filter(s => s.priority === 'high');
    
    expect(highPrioritySections.length).toBeGreaterThan(0);
    
    // Check that section waypoints are positioned for comfortable interaction
    const sectionWaypoints = waypoints.filter(w => w.type === 'section');
    sectionWaypoints.forEach(waypoint => {
      const distance = waypoint.position.length();
      expect(distance).toBeGreaterThan(VR_ERGONOMICS.MINIMUM_INTERACTION_DISTANCE);
      expect(distance).toBeLessThan(VR_ERGONOMICS.MAXIMUM_READABLE_DISTANCE);
    });
  });

  it('should create category-specific visual navigation aids', () => {
    const waypoints = storeLayout.getNavigationWaypoints();
    
    // Should have proper navigation waypoint structure
    waypoints.forEach(waypoint => {
      expect(waypoint.id).toBeDefined();
      expect(waypoint.position).toBeInstanceOf(THREE.Vector3);
      expect(['entrance', 'section', 'aisle', 'checkout']).toContain(waypoint.type);
      
      if (waypoint.type === 'section') {
        expect(waypoint.category).toBeDefined();
        expect(waypoint.description).toBeDefined();
      }
    });
    
    // Should have correct number of different waypoint types
    const entranceWaypoints = waypoints.filter(w => w.type === 'entrance');
    const sectionWaypoints = waypoints.filter(w => w.type === 'section');
    const aisleWaypoints = waypoints.filter(w => w.type === 'aisle');
    
    expect(entranceWaypoints.length).toBe(1);  // One entrance
    expect(sectionWaypoints.length).toBe(6);   // Six game sections
    expect(aisleWaypoints.length).toBe(3);     // Three navigation points
  });

  afterEach(() => {
    storeLayout.dispose();
  });
});
