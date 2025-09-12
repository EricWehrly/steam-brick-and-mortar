/**
 * Store Layout Configuration and Constants
 * 
 * VR ergonomic constants and Steam store section configuration
 * extracted from StoreLayout for better organization and reusability.
 */

import * as THREE from 'three'

/**
 * VR Ergonomic Constants based on Phase 2C research
 * See: docs/research/phase2c-store-layout-spatial-research.md
 */
export const VR_ERGONOMICS = {
  MINIMUM_INTERACTION_DISTANCE: 0.75,  // meters
  OPTIMAL_INTERACTION_DISTANCE: 1.2,   // meters  
  MAXIMUM_READABLE_DISTANCE: 20,       // meters
  PERSONAL_SPACE_BUFFER: 0.5,          // meters
  COMFORTABLE_AISLE_WIDTH: 2.2,        // meters (wider than retail 1.07m)
  TURNING_RADIUS: 0.75,                // meters (radius)
  SHELF_MIN_HEIGHT: 0.8,               // meters
  SHELF_MAX_HEIGHT: 2.0,               // meters
  SHELF_OPTIMAL_HEIGHT: 1.4            // meters (eye level)
} as const

/**
 * Steam Store Category Mapping
 * Maps Steam game genres to physical store sections
 */
export const STEAM_STORE_SECTIONS = {
  NEW_TRENDING: 'new-trending',
  ACTION: 'action',
  ADVENTURE: 'adventure', 
  RPG: 'rpg',
  STRATEGY: 'strategy',
  CASUAL: 'casual'
} as const

/**
 * Store layout configuration
 */
export interface StoreLayoutConfig {
  // Room dimensions (VR-optimized)
  width: number
  height: number
  depth: number
  
  // Entrance area
  entranceZone: {
    width: number
    depth: number
    position: THREE.Vector3
  }
  
  // Shelf configuration
  shelfRows: number
  shelfUnitsPerRow: number
  shelfSpacing: number
  aisleWidth: number
  mainAisleWidth: number
  wallClearance: number
  
  // Store sections
  sections: StoreSection[]
}

export interface StoreSection {
  name: string
  position: THREE.Vector3
  shelfCount: number
  category: string
  priority: 'high' | 'medium' | 'low'
  description?: string
}

/**
 * Store Layout Configuration Factory
 * Creates VR-optimized Steam store layouts
 */
export class StoreLayoutConfigFactory {
  /**
   * Create VR-optimized Steam store layout based on Phase 2C research
   * Enhanced dimensions, Steam categories, and VR ergonomics
   */
  static createDefaultLayout(): StoreLayoutConfig {
    return {
      // VR-optimized room dimensions
      width: 22,    // Enhanced from 20m for entrance buffer
      height: 3.2,  // Slightly higher ceiling
      depth: 16,    // Enhanced from 15m for back wall clearance
      
      shelfRows: 2,                               // Front and back rows
      shelfUnitsPerRow: 3,                        // 3 sections per row
      shelfSpacing: 6.5,                          // Between sections
      aisleWidth: VR_ERGONOMICS.COMFORTABLE_AISLE_WIDTH,  // 2.2m
      mainAisleWidth: 3.0,                        // Central aisle
      wallClearance: 1.0,                         // Distance from walls
      
      // Enhanced entrance zone for VR orientation
      entranceZone: {
        width: 6,                                 // Full width entrance
        depth: 3,                                 // 3m buffer for orientation
        position: new THREE.Vector3(0, 0, 6.5)
      },
      
      // Steam game categories mapped to store sections
      sections: [
        {
          name: 'New & Trending',
          position: new THREE.Vector3(-6.5, 0, 3),    // Front-left (high visibility)
          shelfCount: 3,
          category: STEAM_STORE_SECTIONS.NEW_TRENDING,
          priority: 'high',
          description: 'Recently Released & Popular Games'
        },
        {
          name: 'Action Games',
          position: new THREE.Vector3(0, 0, 3),        // Front-center  
          shelfCount: 4,
          category: STEAM_STORE_SECTIONS.ACTION,
          priority: 'high',
          description: 'Action, FPS & Fighting Games'
        },
        {
          name: 'Adventure & Story',
          position: new THREE.Vector3(6.5, 0, 3),      // Front-right
          shelfCount: 3,
          category: STEAM_STORE_SECTIONS.ADVENTURE,
          priority: 'medium',
          description: 'Adventure & Narrative Games'
        },
        {
          name: 'RPG & Fantasy',
          position: new THREE.Vector3(-6.5, 0, -3),    // Back-left
          shelfCount: 4,
          category: STEAM_STORE_SECTIONS.RPG,
          priority: 'medium',
          description: 'RPG, JRPG & Fantasy Games'
        },
        {
          name: 'Strategy & Sim',
          position: new THREE.Vector3(0, 0, -3),       // Back-center
          shelfCount: 3,
          category: STEAM_STORE_SECTIONS.STRATEGY,
          priority: 'medium',
          description: 'Strategy & Simulation Games'
        },
        {
          name: 'Casual & Family',
          position: new THREE.Vector3(6.5, 0, -3),     // Back-right
          shelfCount: 2,
          category: STEAM_STORE_SECTIONS.CASUAL,
          priority: 'low',
          description: 'Casual & Family Friendly Games'
        }
      ]
    }
  }

  /**
   * Get display name for section category
   */
  static getSectionDisplayName(sectionName: string): string {
    const displayNames: { [key: string]: string } = {
      'new-trending': 'NEW & TRENDING',
      'action': 'ACTION',
      'adventure': 'ADVENTURE & STORY',
      'rpg': 'RPG & FANTASY',
      'strategy': 'STRATEGY & SIM',
      'casual': 'CASUAL & FAMILY'
    }
    
    return displayNames[sectionName] || sectionName.toUpperCase()
  }
}
