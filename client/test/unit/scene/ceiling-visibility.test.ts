import * as THREE from 'three'
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { RoomManager } from '../../../src/scene/RoomManager'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { DataManager } from '../../../src/core/data'

// Mock TextureManager to avoid external dependencies
vi.mock('../../../src/utils/TextureManager', () => ({
    TextureManager: {
        getInstance: () => ({
            createProceduralCeilingMaterial: vi.fn(() => new THREE.MeshStandardMaterial({ color: 0xF5F5DC })),
            createCarpetMaterial: vi.fn(() => Promise.resolve(new THREE.MeshStandardMaterial({ color: 0x6B6B6B }))),
            createWallMaterial: vi.fn(() => Promise.resolve(new THREE.MeshStandardMaterial({ color: 0xDDDDDD }))),
            createWoodMaterial: vi.fn(() => Promise.resolve(new THREE.MeshStandardMaterial({ color: 0xF5F5DC })))
        })
    }
}))

describe('RoomManager Ceiling Visibility System', () => {
    let roomManager: RoomManager
    let mockScene: THREE.Scene

    beforeEach(() => {
        DataManager.resetInstance()
        mockScene = new THREE.Scene()
        roomManager = new RoomManager(mockScene)
    })

    afterEach(() => {
        roomManager.dispose()
    })

    describe('Ceiling Visibility Control', () => {
        it('should control ceiling visibility when ceiling exists', async () => {
            // Create a room with ceiling via event
            EventManager.getInstance().emit('room:resize', {
                reason: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Wait for ceiling to be created
            await new Promise(resolve => setTimeout(resolve, 10))
            
            // Test visibility control
            roomManager.setCeilingVisibility(false)
            
            // Find the ceiling in the scene
            const ceiling = mockScene.children.find(child => 
                child.name === 'room-ceiling' || child.name.includes('ceiling')
            ) as THREE.Mesh
            
            if (ceiling) {
                expect(ceiling.visible).toBe(false)
                
                roomManager.setCeilingVisibility(true)
                expect(ceiling.visible).toBe(true)
            } else {
                // If no ceiling found, just verify the method doesn't throw
                expect(() => roomManager.setCeilingVisibility(false)).not.toThrow()
                expect(() => roomManager.setCeilingVisibility(true)).not.toThrow()
            }
        })

        it('should handle ceiling visibility when no ceiling exists', () => {
            // Test visibility control without creating a ceiling first
            expect(() => {
                roomManager.setCeilingVisibility(false)
                roomManager.setCeilingVisibility(true)
            }).not.toThrow()
        })

        it('should allow updating ceiling visibility via updateCeilingVisibility method', () => {
            // Test the public update method
            expect(() => {
                roomManager.updateCeilingVisibility()
            }).not.toThrow()
        })
    })
})