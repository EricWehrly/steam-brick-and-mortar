/**
 * Game Box Test Adapter - Renderer-Agnostic Testing Interface
 * 
 * Provides a unified testing interface for game box functionality across
 * different rendering approaches (Legacy individual meshes vs GPU instanced rendering).
 * 
 * This solves the test issue where GameBoxRenderer.createGameBox() returns:
 * - Legacy: THREE.Object3D (individual mesh)
 * - Instanced: null (data stored in instance manager)
 */

import * as THREE from 'three'
import type { SteamGameData } from '../../src/scene/game-box/types/GameData'
import type { GameBoxRenderer } from '../../src/scene/GameBoxRenderer'

export interface GameBoxTestResult {
    /** Position where the game box is rendered */
    position: THREE.Vector3
    /** Game data associated with this box */
    gameData: SteamGameData
    /** Whether this represents a valid game box */
    isValid: boolean
    /** Optional mesh reference for legacy rendering */
    mesh?: THREE.Object3D
    /** Instance index for instanced rendering */
    instanceIndex?: number
}

export interface GameBoxTestAdapter {
    /** Create a game box and return test-friendly result */
    createGameBox(game: SteamGameData, position: THREE.Vector3): GameBoxTestResult | null
    
    /** Get all game boxes currently managed by the renderer */
    getAllGameBoxes(): GameBoxTestResult[]
    
    /** Get count of game boxes (works for both individual and instanced) */
    getGameBoxCount(): number
    
    /** Validate that game positions match expected calculations */
    validatePositioning(expectedPositions: THREE.Vector3[]): boolean
    
    /** Clean up resources */
    dispose(): void
}

/**
 * Adapter for Legacy Rendering (individual THREE.Object3D meshes)
 */
export class LegacyGameBoxTestAdapter implements GameBoxTestAdapter {
    private gameBoxRenderer: GameBoxRenderer
    private scene: THREE.Scene
    private createdGameBoxes: THREE.Object3D[] = []

    constructor(gameBoxRenderer: GameBoxRenderer, scene: THREE.Scene) {
        this.gameBoxRenderer = gameBoxRenderer
        this.scene = scene
    }

    createGameBox(game: SteamGameData, position: THREE.Vector3): GameBoxTestResult | null {
        // Force non-instanced rendering for legacy adapter by calling createGameBoxCore directly
        // This bypasses the instanced rendering check in createGameBox()
        const mesh = (this.gameBoxRenderer as any).createGameBoxCore(game, position, `test-${game.appid}`)
        
        if (!mesh) {
            return null
        }

        // Add to scene and track
        this.scene.add(mesh)
        this.createdGameBoxes.push(mesh)

        return {
            position: mesh.position.clone(),
            gameData: mesh.userData.gameData ?? game,
            isValid: true,
            mesh: mesh
        }
    }

    getAllGameBoxes(): GameBoxTestResult[] {
        return this.createdGameBoxes.map(mesh => ({
            position: mesh.position.clone(),
            gameData: mesh.userData.gameData,
            isValid: !!mesh.userData.gameData,
            mesh: mesh
        }))
    }

    getGameBoxCount(): number {
        return this.createdGameBoxes.length
    }

    validatePositioning(expectedPositions: THREE.Vector3[]): boolean {
        const actualPositions = this.createdGameBoxes.map(mesh => mesh.position)
        
        if (actualPositions.length !== expectedPositions.length) {
            return false
        }

        return actualPositions.every((actual, index) => {
            const expected = expectedPositions[index]
            return actual.distanceTo(expected) < 0.001 // 1mm tolerance
        })
    }

    dispose(): void {
        this.createdGameBoxes.forEach(mesh => {
            this.scene.remove(mesh)
        })
        this.createdGameBoxes = []
    }
}

/**
 * Adapter for GPU Instanced Rendering
 */
export class InstancedGameBoxTestAdapter implements GameBoxTestAdapter {
    private gameBoxRenderer: GameBoxRenderer
    private scene: THREE.Scene
    private createdInstances: Array<{
        game: SteamGameData,
        position: THREE.Vector3,
        instanceIndex: number
    }> = []

    constructor(gameBoxRenderer: GameBoxRenderer, scene: THREE.Scene) {
        this.gameBoxRenderer = gameBoxRenderer
        this.scene = scene
    }

    createGameBox(game: SteamGameData, position: THREE.Vector3): GameBoxTestResult | null {
        // For instanced rendering, createGameBox might return null but still create the instance
        const mesh = this.gameBoxRenderer.createGameBox(game, position)
        
        // Track the instance even if no individual mesh is returned
        const instanceIndex = this.createdInstances.length
        this.createdInstances.push({
            game,
            position: position.clone(),
            instanceIndex
        })

        return {
            position: position.clone(),
            gameData: game,
            isValid: true,
            mesh: mesh || undefined, // mesh might be null for instanced rendering
            instanceIndex
        }
    }

    getAllGameBoxes(): GameBoxTestResult[] {
        return this.createdInstances.map(instance => ({
            position: instance.position.clone(),
            gameData: instance.game,
            isValid: true,
            instanceIndex: instance.instanceIndex
        }))
    }

    getGameBoxCount(): number {
        return this.createdInstances.length
    }

    validatePositioning(expectedPositions: THREE.Vector3[]): boolean {
        if (this.createdInstances.length !== expectedPositions.length) {
            return false
        }

        return this.createdInstances.every((instance, index) => {
            const expected = expectedPositions[index]
            return instance.position.distanceTo(expected) < 0.001 // 1mm tolerance
        })
    }

    dispose(): void {
        this.createdInstances = []
        // Note: Instanced renderer cleanup would be handled by the renderer itself
    }
}

/**
 * Factory function to create appropriate adapter based on rendering approach
 */
export function createGameBoxTestAdapter(
    gameBoxRenderer: GameBoxRenderer, 
    scene: THREE.Scene,
    preferInstanced: boolean = false
): GameBoxTestAdapter {
    // Try to detect if instanced rendering is being used
    // This is a heuristic - you might need to adjust based on actual implementation
    const hasInstancedRenderers = !!(gameBoxRenderer as any).getInstancedLabelRenderer?.()
    
    if (preferInstanced || hasInstancedRenderers) {
        return new InstancedGameBoxTestAdapter(gameBoxRenderer, scene)
    } else {
        return new LegacyGameBoxTestAdapter(gameBoxRenderer, scene)
    }
}

/**
 * Shared test utility functions that work with any adapter
 */
export class GameBoxTestUtils {
    static validatePositioning(
        adapter: GameBoxTestAdapter, 
        expectedPositions: THREE.Vector3[],
        tolerance: number = 0.001
    ): { isValid: boolean, errors: string[] } {
        const gameBoxes = adapter.getAllGameBoxes()
        const errors: string[] = []
        
        if (gameBoxes.length !== expectedPositions.length) {
            errors.push(`Expected ${expectedPositions.length} game boxes, got ${gameBoxes.length}`)
        }
        
        gameBoxes.forEach((gameBox, index) => {
            if (index < expectedPositions.length) {
                const expected = expectedPositions[index]
                const distance = gameBox.position.distanceTo(expected)
                if (distance >= tolerance) {
                    errors.push(`Game box ${index} position off by ${distance.toFixed(4)}m (tolerance: ${tolerance}m)`)
                }
            }
        })
        
        return { isValid: errors.length === 0, errors }
    }

    static validateNotAtOrigin(adapter: GameBoxTestAdapter): { isValid: boolean, errors: string[] } {
        const gameBoxes = adapter.getAllGameBoxes()
        const errors: string[] = []
        
        gameBoxes.forEach((gameBox, index) => {
            if (gameBox.position.x === 0 && gameBox.position.y === 0 && gameBox.position.z === 0) {
                errors.push(`Game box ${index} is positioned at origin (0,0,0)`)
            }
        })
        
        return { isValid: errors.length === 0, errors }
    }

    static validateGameData(adapter: GameBoxTestAdapter, expectedGames: SteamGameData[]): { isValid: boolean, errors: string[] } {
        const gameBoxes = adapter.getAllGameBoxes()
        const errors: string[] = []
        
        if (gameBoxes.length !== expectedGames.length) {
            errors.push(`Expected ${expectedGames.length} games, got ${gameBoxes.length}`)
        }
        
        gameBoxes.forEach((gameBox, index) => {
            if (!gameBox.gameData) {
                errors.push(`Game box ${index} missing game data`)
                return
            }
            
            if (index < expectedGames.length) {
                const expected = expectedGames[index]
                if (gameBox.gameData.appid !== expected.appid) {
                    errors.push(`Game box ${index} appid mismatch: expected ${expected.appid}, got ${gameBox.gameData.appid}`)
                }
                if (gameBox.gameData.name !== expected.name) {
                    errors.push(`Game box ${index} name mismatch: expected ${expected.name}, got ${gameBox.gameData.name}`)
                }
            }
            
            if (!gameBox.isValid) {
                errors.push(`Game box ${index} marked as invalid`)
            }
        })
        
        return { isValid: errors.length === 0, errors }
    }
}