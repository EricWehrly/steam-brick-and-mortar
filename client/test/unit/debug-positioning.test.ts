/**
 * 🔥🔥🔥 DEBUGGING HELPER 🔥🔥🔥
 * 
 * Copy/paste this into browser console to check positioning:
 * 
 * // Check if games are rendered
 * const gameBoxes = document.querySelectorAll('[name*="game"]')
 * console.log(`Found ${gameBoxes.length} game boxes`)
 * 
 * // Check positioning values
 * gameBoxes.forEach((box, i) => {
 *   const pos = box.position
 *   console.log(`Game ${i}: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`)
 * })
 * 
 * EXPECTED BEHAVIOR:
 * - Text should be readable (not upside down)
 * - Bottom shelf games should be lower Y values than top shelf
 * - Front side games should have negative Z (closer to camera)
 * - Back side games should have positive Z (further from camera)
 * - Games should not overlap vertically
 * 
 * CURRENT ISSUES:
 * 1. Text is upside-down ← Fix in InstancedLabelRenderer.ts shader UV coordinates
 * 2. Games positioned incorrectly ← Fix in SharedPropsUtils.ts calculateGamePositions()
 * 3. Z positioning wrong ← Check surface.frontZ/backZ usage and gameHalfDepth
 */

import { describe, it, expect } from 'vitest';
import { GameBoxUtils, ShelfSurfaceUtils } from '../../src/scene/props/SharedPropsUtils';
import type { SteamGameData } from '../../src/scene/game-box/types/GameData';
import * as THREE from 'three';

describe('🔥 DEBUGGING: Position Validation', () => {
    const mockGames: SteamGameData[] = [
        { appid: '1', name: 'Game 1', playtime_forever: 0 },
        { appid: '2', name: 'Game 2', playtime_forever: 0 }
    ];

    it('🔥 Shows actual calculated positions vs expected', () => {
        const shelfPosition = new THREE.Vector3(0, 0, 0);
        const surfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true);
        
        console.warn('🔥 =========================');
        console.warn('🔥 DEBUGGING POSITION CALCULATION');
        console.warn('🔥 =========================');
        
        surfaces.forEach((surface, index) => {
            const shelfName = index === 0 ? 'BOTTOM' : index === 1 ? 'MIDDLE' : 'TOP';
            
            const frontPositions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surface, mockGames, 'front'
            );
            
            const backPositions = GameBoxUtils.calculateGamePositions(
                shelfPosition, surface, mockGames, 'back'
            );
            
            console.warn(`🔥 ${shelfName} SHELF (surface.topY=${surface.topY.toFixed(3)}):`);
            console.warn(`🔥   Front game: Y=${frontPositions[0]?.y.toFixed(3)}, Z=${frontPositions[0]?.z.toFixed(3)}`);
            console.warn(`🔥   Back game:  Y=${backPositions[0]?.y.toFixed(3)}, Z=${backPositions[0]?.z.toFixed(3)}`);
        });
        
        console.warn('🔥 =========================');
        console.warn('🔥 EXPECTED:');
        console.warn('🔥 - Bottom Y < Middle Y < Top Y');
        console.warn('🔥 - Front Z < 0, Back Z > 0');
        console.warn('🔥 - No overlapping Y values');
        console.warn('🔥 =========================');
        
        // Always pass - this is just for debugging
        expect(true).toBe(true);
    });
});