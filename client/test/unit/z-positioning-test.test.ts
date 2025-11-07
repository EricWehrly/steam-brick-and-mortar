import { describe, it, expect } from 'vitest';
import { GameBoxUtils, ShelfSurfaceUtils } from '../../src/scene/props/SharedPropsUtils';
import type { SteamGameData } from '../../src/scene/game-box/types/GameData';
import * as THREE from 'three';

describe('Z-Axis Positioning Changes', () => {
    const mockGames: SteamGameData[] = [
        {
            appid: '123',
            name: 'Test Game 1',
            playtime_forever: 0,
        },
        {
            appid: '456', 
            name: 'Test Game 2',
            playtime_forever: 0,
        }
    ];

    it('should use different Z offsets for different shelf levels', () => {
        // Test different shelf levels with same side
        const shelfPosition = new THREE.Vector3(0, 0, 0);
        
        const surfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true);
        const bottomSurface = surfaces[0]; // bottom
        const middleSurface = surfaces[1]; // middle  
        const topSurface = surfaces[2]; // top

        const bottomPositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            bottomSurface,
            mockGames,
            'front'
        );

        const middlePositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            middleSurface,
            mockGames,
            'front'
        );

        const topPositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            topSurface,
            mockGames,
            'front'
        );

        console.log('Bottom shelf Z:', bottomPositions[0].z);
        console.log('Middle shelf Z:', middlePositions[0].z);
        console.log('Top shelf Z:', topPositions[0].z);

        // Bottom shelf should have largest Z offset (0.3) - closer to camera (less negative)
        // Middle shelf should have medium Z offset (0.2) 
        // Top shelf should have smallest Z offset (0.1) - further from camera (more negative)
        // For front side, games should be positioned in front of shelf (negative Z)
        expect(bottomPositions[0].z).toBeGreaterThan(middlePositions[0].z);
        expect(middlePositions[0].z).toBeGreaterThan(topPositions[0].z);
        
        // All should be negative for front side (in front of shelf)
        expect(bottomPositions[0].z).toBeLessThan(0);
        expect(middlePositions[0].z).toBeLessThan(0);
        expect(topPositions[0].z).toBeLessThan(0);
    });

    it('should use negative Z offsets for back side', () => {
        const shelfPosition = new THREE.Vector3(0, 0, 0);
        const surfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true);
        const middleSurface = surfaces[1]; // middle

        const frontPositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            middleSurface,
            mockGames,
            'front'
        );

        const backPositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            middleSurface,
            mockGames,
            'back'
        );

        console.log('Front side Z:', frontPositions[0].z);
        console.log('Back side Z:', backPositions[0].z);

        // Front should be negative (in front of shelf), back should be positive (behind shelf)
        expect(frontPositions[0].z).toBeLessThan(0);
        expect(backPositions[0].z).toBeGreaterThan(0);
        
        // Magnitudes should be equal (same shelf level)
        expect(Math.abs(frontPositions[0].z)).toBeCloseTo(Math.abs(backPositions[0].z), 3);
    });

    it('should maintain shelf-specific Z offsets across front and back sides', () => {
        const shelfPosition = new THREE.Vector3(0, 0, 0);
        const surfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true);
        const bottomSurface = surfaces[0]; // bottom
        const topSurface = surfaces[2]; // top
        
        // Test that shelf-specific offsets work for both sides
        const frontBottom = GameBoxUtils.calculateGamePositions(shelfPosition, bottomSurface, mockGames, 'front');
        const backBottom = GameBoxUtils.calculateGamePositions(shelfPosition, bottomSurface, mockGames, 'back');
        
        const frontTop = GameBoxUtils.calculateGamePositions(shelfPosition, topSurface, mockGames, 'front');
        const backTop = GameBoxUtils.calculateGamePositions(shelfPosition, topSurface, mockGames, 'back');

        // Bottom shelf should have smaller magnitude than top shelf (closer to user) for both sides
        expect(Math.abs(frontBottom[0].z)).toBeLessThan(Math.abs(frontTop[0].z));
        expect(Math.abs(backBottom[0].z)).toBeLessThan(Math.abs(backTop[0].z));
        
        // Front/back pairs should have equal magnitudes
        expect(Math.abs(frontBottom[0].z)).toBeCloseTo(Math.abs(backBottom[0].z), 3);
        expect(Math.abs(frontTop[0].z)).toBeCloseTo(Math.abs(backTop[0].z), 3);
    });
});