import { describe, it, expect } from 'vitest';
import { GameBoxUtils, ShelfSurfaceUtils, ShelfSide } from '../../src/scene/props/SharedPropsUtils';
import type { SteamGameData } from '../../src/scene/game-box/types/GameData';
import type { GameBoxDimensions } from '../../src/scene/game-box/types/GameBoxOptions';
import * as THREE from 'three';

const TEST_BOX_DIMENSIONS: GameBoxDimensions = { width: 0.3, height: 0.4, depth: 0.08 };

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
            ShelfSide.Front,
            TEST_BOX_DIMENSIONS
        );

        const middlePositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            middleSurface,
            mockGames,
            ShelfSide.Front,
            TEST_BOX_DIMENSIONS
        );

        const topPositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            topSurface,
            mockGames,
            ShelfSide.Front,
            TEST_BOX_DIMENSIONS
        );

        console.log('Bottom shelf Z:', bottomPositions[0].z);
        console.log('Middle shelf Z:', middlePositions[0].z);
        console.log('Top shelf Z:', topPositions[0].z);

        // Shelf geometry produces increasing Z protrusion toward the TOP shelf.
        // Top shelf has the most negative Z (protrudes furthest in front of shelf),
        // bottom shelf has the least negative Z (protrudes least).
        // This is intentional per the current shelf geometry — the test pins the
        // actual ordering rather than imposing an ergonomic preference.
        expect(topPositions[0].z).toBeLessThan(middlePositions[0].z);
        expect(middlePositions[0].z).toBeLessThan(bottomPositions[0].z);
        
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
            ShelfSide.Front,
            TEST_BOX_DIMENSIONS
        );

        const backPositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            middleSurface,
            mockGames,
            ShelfSide.Back,
            TEST_BOX_DIMENSIONS
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
        const frontBottom = GameBoxUtils.calculateGamePositions(shelfPosition, bottomSurface, mockGames, ShelfSide.Front, TEST_BOX_DIMENSIONS);
        const backBottom = GameBoxUtils.calculateGamePositions(shelfPosition, bottomSurface, mockGames, ShelfSide.Back, TEST_BOX_DIMENSIONS);
        
        const frontTop = GameBoxUtils.calculateGamePositions(shelfPosition, topSurface, mockGames, ShelfSide.Front, TEST_BOX_DIMENSIONS);
        const backTop = GameBoxUtils.calculateGamePositions(shelfPosition, topSurface, mockGames, ShelfSide.Back, TEST_BOX_DIMENSIONS);

        // Top shelf protrudes more (larger magnitude) than bottom shelf for both sides
        // (see comment in first test for geometry rationale)
        expect(Math.abs(frontTop[0].z)).toBeGreaterThan(Math.abs(frontBottom[0].z));
        expect(Math.abs(backTop[0].z)).toBeGreaterThan(Math.abs(backBottom[0].z));
        
        // Front/back pairs should have equal magnitudes
        expect(Math.abs(frontBottom[0].z)).toBeCloseTo(Math.abs(backBottom[0].z), 3);
        expect(Math.abs(frontTop[0].z)).toBeCloseTo(Math.abs(backTop[0].z), 3);
    });
});