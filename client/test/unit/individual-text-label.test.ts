/**
 * Test to verify individual text label creation works
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

// Mock TextureManager
vi.mock('../../src/utils/TextureManager', async () => {
  const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock')
  return {
    TextureManager: {
      getInstance: () => MockTextureManager.getInstance()
    }
  }
})

import { LegacyGameBoxRenderer } from '../../src/scene/game-box/LegacyGameBoxRenderer'
import type { SteamGameData } from '../../src/scene/game-box/types/GameData'

describe('Individual Text Label Creation', () => {
    let gameBoxRenderer: LegacyGameBoxRenderer
    let scene: THREE.Scene

    const mockGame: SteamGameData = {
        appid: 12345,
        name: 'Test Game',
        playtime_forever: 120
    }

    beforeEach(() => {
        scene = new THREE.Scene()
        gameBoxRenderer = new LegacyGameBoxRenderer()
    })

    afterEach(() => {
        scene.clear()
    })

    it('should create game box with individual text label when instanced renderer not available', () => {
        const position = new THREE.Vector3(1, 2, 3)
        
        // Create game box - should use individual text labels since instanced renderer isn't initialized
        const gameBox = gameBoxRenderer.createGameBox(mockGame, position)
        
        expect(gameBox).not.toBeNull()
        expect(gameBox?.name).toContain('Test-Game')
        expect(gameBox?.position.x).toBeCloseTo(1, 3)
        expect(gameBox?.position.y).toBeCloseTo(2, 3)
        expect(gameBox?.position.z).toBeCloseTo(3, 3)
        
        // Check if text label was added as child
        const textLabel = gameBox?.children.find(child => child.name.includes('label'))
        expect(textLabel).toBeDefined()
        expect(textLabel).toBeInstanceOf(THREE.Mesh)
        
        if (textLabel instanceof THREE.Mesh) {
            expect(textLabel.geometry).toBeInstanceOf(THREE.PlaneGeometry)
            expect(textLabel.material).toBeInstanceOf(THREE.MeshBasicMaterial)
            
            const material = textLabel.material as THREE.MeshBasicMaterial
            expect(material.map).toBeInstanceOf(THREE.CanvasTexture)
            expect(material.transparent).toBe(true)
        }
        
        console.log('GameBox children:', gameBox?.children.map(c => c.name))
    })
})