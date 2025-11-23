/**
 * Game Finder - Locate game objects in the Three.js scene
 * 
 * Reusable utility for finding games by name, appid, or other identifiers.
 * Works with both GPU instanced renderer and legacy renderer.
 * 
 * Usage:
 *   const finder = new GameFinder(scene)
 *   const game = finder.findByName("UNLOVED")
 *   const games = finder.findAll()
 *   const game = finder.findByAppId(611500)
 */

import * as THREE from 'three'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { INSTANCED_LABEL_MESH_NAME } from '../scene/game-box/instancing/InstancedLabelRenderer'
import { INSTANCED_ARTWORK_MESH_NAME } from '../scene/game-box/instancing/InstancedArtworkRenderer'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'

export interface InstanceMetadata {
    name: string
    appid?: number | string
    position: THREE.Vector3
}

export interface GameSceneObject {
    name?: string
    appid?: number | string
    position: THREE.Vector3
    mesh: THREE.Object3D
    instanceIndex?: number  // For instanced meshes
    rendererType: 'gpu' | 'legacy'
}

export class GameFinder {
    private scene: THREE.Scene
    
    constructor() {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (!scene) {
            throw new Error('GameFinder requires scene to be registered in DataManager')
        }
        this.scene = scene
    }

    public findByName(gameName: string): GameSceneObject | null {
        const searchTerm = gameName.toLowerCase()
        
        console.debug(`🔍 [GameFinder] Searching for game by name: "${gameName}"`)
        
        const result = this.findGame((child) => {
            if (child.userData?.name?.toLowerCase().includes(searchTerm)) {
                return true
            }
            
            if (child.name?.toLowerCase().includes(searchTerm)) {
                return true
            }
            
            return false
        })
        
        if (result) {
            console.debug(`✅ [GameFinder] Found: ${result.name} at (${result.position.x.toFixed(2)}, ${result.position.y.toFixed(2)}, ${result.position.z.toFixed(2)})`)
        } else {
            console.warn(`❌ [GameFinder] Not found: "${gameName}"`)
        }
        
        return result
    }

    public findByAppId(appid: number | string): GameSceneObject | null {
        console.debug(`🔍 [GameFinder] Searching for game by appid: ${appid}`)
        
        const result = this.findGame((child) => {
            return child.userData?.appid === appid
        })
        
        if (result) {
            console.debug(`✅ [GameFinder] Found: ${result.name} (${result.appid})`)
        } else {
            console.warn(`❌ [GameFinder] Not found: appid ${appid}`)
        }
        
        return result
    }

    public find(identifier: string | number): GameSceneObject | null {
        if (typeof identifier === 'number') {
            return this.findByAppId(identifier)
        } else {
            return this.findByName(identifier)
        }
    }

    public findAll(): GameSceneObject[] {
        const games: GameSceneObject[] = []
        
        // Check instanced renderer first (GPU rendering)
        const instancedGames = this.findInstancedGames()
        games.push(...instancedGames)
        
        // Then check scene for legacy meshes
        this.scene.traverse((child) => {
            const game = this.extractGameObject(child)
            if (game) {
                games.push(game)
            }
        })
        
        console.debug(`🔍 [GameFinder] Found ${games.length} game(s) in scene (${instancedGames.length} instanced, ${games.length - instancedGames.length} legacy)`)
        return games
    }

    private findInstancedGames(): GameSceneObject[] {
        const games: GameSceneObject[] = []
        
        try {
            const metadata = DataManager.getInstance().get<Map<number, InstanceMetadata>>(DataKey.InstancedArtworkMetadata)
            if (metadata) {
                for (const [instanceIndex, data] of metadata.entries()) {
                    games.push({
                        name: data.name,
                        appid: data.appid,
                        position: data.position.clone(),
                        mesh: this.scene,
                        instanceIndex,
                        rendererType: 'gpu'
                    })
                }
            }
        } catch (error) {
            // Metadata not available or not initialized yet
            console.debug('🔍 [GameFinder] Instanced artwork metadata not available:', error)
        }
        
        return games
    }
    
    private findGame(predicate: (child: THREE.Object3D) => boolean): GameSceneObject | null {
        // Check instanced games first
        const instancedGames = this.findInstancedGames()
        for (const game of instancedGames) {
            // Simulate child object for predicate
            const mockChild = {
                userData: { name: game.name, appid: game.appid, isGameBox: true },
                name: game.name
            } as unknown as THREE.Object3D
            
            if (predicate(mockChild)) {
                return game
            }
        }
        
        // Then check scene traverse for legacy
        let found: GameSceneObject | null = null
        
        this.scene.traverse((child) => {
            if (found) return // Already found
            
            if (predicate(child)) {
                found = this.extractGameObject(child)
            }
        })
        
        return found
    }

    private extractGameObject(child: THREE.Object3D): GameSceneObject | null {
        if (this.isInstancedMeshParent(child)) {
            return null
        }
        
        if (child.userData?.isGameBox) {
            return {
                name: child.userData.name,
                appid: child.userData.appid,
                position: child.position.clone(),
                mesh: child,
                rendererType: 'gpu'
            }
        }
        
        if (child.name?.includes('game-')) {
            return {
                name: child.userData?.name ?? child.name,
                appid: child.userData?.appid,
                position: child.position.clone(),
                mesh: child,
                rendererType: 'legacy'
            }
        }
        
        return null
    }
    
    private isInstancedMeshParent(child: THREE.Object3D): boolean {
        return child.name === INSTANCED_LABEL_MESH_NAME || 
               child.name === INSTANCED_ARTWORK_MESH_NAME
    }
}

export function initializeGameFinderOnStart(): void {
    const finder = new GameFinder()
    
    // @ts-ignore - Intentionally adding to window for debugging
    window.findGame = (identifier: string | number) => {
        return finder.find(identifier)
    }
    
    // @ts-ignore - Intentionally adding to window for debugging
    window.findAllGames = () => {
        return finder.findAll()
    }
    
    console.debug('🔍 [GameFinder] Game finder functions exposed to window:')
    console.debug('  window.findGame("UNLOVED")    - Find game by name')
    console.debug('  window.findGame(611500)       - Find game by appid')
    console.debug('  window.findAllGames()         - Get all games')
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeGameFinderOnStart)
