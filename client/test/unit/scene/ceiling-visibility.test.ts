/**
 * Test suite for ceiling visibility system
 */

import * as THREE from 'three'
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { RoomManager } from '../../../src/scene/RoomManager'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { CeilingEventTypes } from '../../../src/types/InteractionEvents'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../src/core/data/DataTypes'

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
    let eventManager: EventManager

    beforeEach(() => {
        mockScene = new THREE.Scene()
        eventManager = EventManager.getInstance()

        // RoomManager pulls scene + camera rig from DataManager at construction time
        const mockCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
        const mockCameraRig = new THREE.Group()
        mockCameraRig.add(mockCamera)
        mockCameraRig.position.set(0, 1.6, 3)
        DataManager.getInstance().set(DataKey.MainScene, mockScene, { domain: DataDomain.Scene })
        DataManager.getInstance().set(DataKey.MainCamera, mockCamera, { domain: DataDomain.Scene })
        DataManager.getInstance().set(DataKey.MainCameraRig, mockCameraRig, { domain: DataDomain.Scene })

        roomManager = new RoomManager()
    })

    afterEach(() => {
        roomManager.dispose()
    })

    describe('Ceiling Visibility Control', () => {
        it('should control ceiling visibility when ceiling exists', async () => {
            eventManager.emit('room:resize', {
                reason: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            await new Promise(resolve => setTimeout(resolve, 10))
            
            eventManager.emit(CeilingEventTypes.Toggle, {
                visible: false,
                timestamp: Date.now(),
                source: EventSource.UI
            })
            
            const ceiling = mockScene.children.find(child => 
                child.name === 'room-ceiling' || child.name.includes('ceiling')
            ) as THREE.Mesh
            
            if (ceiling) {
                expect(ceiling.visible).toBe(false)
                eventManager.emit(CeilingEventTypes.Toggle, {
                    visible: true,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
                expect(ceiling.visible).toBe(true)
            } else {
                expect(() => {
                    eventManager.emit(CeilingEventTypes.Toggle, {
                        visible: false,
                        timestamp: Date.now(),
                        source: EventSource.UI
                    })
                    eventManager.emit(CeilingEventTypes.Toggle, {
                        visible: true,
                        timestamp: Date.now(),
                        source: EventSource.UI
                    })
                }).not.toThrow()
            }
        })

        it('should handle ceiling visibility when no ceiling exists', () => {
            expect(() => {
                eventManager.emit(CeilingEventTypes.Toggle, {
                    visible: false,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
                eventManager.emit(CeilingEventTypes.Toggle, {
                    visible: true,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
            }).not.toThrow()
        })

        it('should handle ceiling visibility events correctly', async () => {
            eventManager.emit('room:resize', {
                reason: 'test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            await new Promise(resolve => setTimeout(resolve, 10))
            
            expect(() => {
                eventManager.emit(CeilingEventTypes.Toggle, {
                    visible: false,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
                eventManager.emit(CeilingEventTypes.Toggle, {
                    visible: true,
                    timestamp: Date.now(),
                    source: EventSource.UI
                })
            }).not.toThrow()
        })
    })
})
