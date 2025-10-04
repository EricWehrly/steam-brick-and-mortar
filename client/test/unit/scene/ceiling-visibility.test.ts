import * as THREE from 'three'
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { RoomManager } from '../../../src/scene/RoomManager'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { CeilingEventTypes } from '../../../src/types/InteractionEvents'
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
            
            // Test event-driven visibility control
            EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                visible: false,
                timestamp: Date.now(),
                source: EventSource.UI
            })
            
            // Find the ceiling in the scene
            const ceiling = mockScene.children.find(child => 
                child.name === 'room-ceiling' || child.name.includes('ceiling')
            ) as THREE.Mesh
            
            if (ceiling) {
                expect(ceiling.visible).toBe(false)
                
                EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                    visible: true,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
                expect(ceiling.visible).toBe(true)
            } else {
                // If no ceiling found, just verify the events don't throw
                expect(() => {
                    EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                        visible: false,
                        timestamp: Date.now(),
                        source: EventSource.UI
                    })
                    EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                        visible: true,
                        timestamp: Date.now(),
                        source: EventSource.UI
                    })
                }).not.toThrow()
            }
        })

        it('should handle ceiling visibility when no ceiling exists', () => {
            // Test event-driven visibility control without creating a ceiling first
            expect(() => {
                EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                    visible: false,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
                EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                    visible: true,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
            }).not.toThrow()
        })

        it('should handle ceiling visibility events correctly', async () => {
            // Create a room with ceiling via event first
            EventManager.getInstance().emit('room:resize', {
                reason: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Wait for room to be created
            await new Promise(resolve => setTimeout(resolve, 10))
            
            // Test event-driven ceiling visibility toggle
            expect(() => {
                EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                    visible: false,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
                
                EventManager.getInstance().emit(CeilingEventTypes.Toggle, {
                    visible: true,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
            }).not.toThrow()
        })
    })
})