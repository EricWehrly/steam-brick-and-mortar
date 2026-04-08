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
import { Logger } from '../utils/Logger'

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
    rendererType: 'gpu' | 'legacy' | 'label'
}

export class GameFinder {
    private scene: THREE.Scene
    public static logger = Logger.createLogFunctions(GameFinder.name)
    
    constructor() {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (!scene) {
            throw new Error('GameFinder requires scene to be registered in DataManager')
        }
        this.scene = scene
    }

    public findByName(gameName: string): GameSceneObject | null {
        const searchTerm = gameName.toLowerCase()
        
        GameFinder.logger.debug(`🔍 Searching for game by name: "${gameName}"`)
        
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
            GameFinder.logger.debug(`✅ Found: ${result.name} at (${result.position.x.toFixed(2)}, ${result.position.y.toFixed(2)}, ${result.position.z.toFixed(2)})`)
        } else {
            GameFinder.logger.warn(`❌ Not found: "${gameName}"`)
        }
        
        return result
    }

    public findByAppId(appid: number | string): GameSceneObject | null {
        GameFinder.logger.debug(`🔍 Searching for game by appid: ${appid}`)
        
        const result = this.findGame((child) => {
            return child.userData?.appid === appid
        })
        
        if (result) {
            GameFinder.logger.debug(`✅ Found: ${result.name} (${result.appid})`)
        } else {
            GameFinder.logger.warn(`❌ Not found: appid ${appid}`)
        }
        
        return result
    }

    /**
     * Resolve a scene intersection object to a GameSceneObject using the
     * dumb instanceId→appId maps (DataKey.ArtworkInstanceIdToAppId /
     * DataKey.LabelInstanceIdToAppId).
     *
     * Prefer this over the metadata-map path in raycast resolution — it's
     * a direct lookup with no fallback guessing.
     *
     * @param object    The THREE.Object3D that was hit (from raycaster intersection)
     * @param instanceId The instanceId from the intersection (intersection.instanceId)
     * @returns GameSceneObject if the instanceId resolves to a known appId, null otherwise
     */
    public findByIntersection(object: THREE.Object3D, instanceId: number): GameSceneObject | null {
        const dm = DataManager.getInstance()
        const meshName = object.name

        const isArtwork = meshName === INSTANCED_ARTWORK_MESH_NAME
        const isLabel = meshName === INSTANCED_LABEL_MESH_NAME

        if (!isArtwork && !isLabel) return null

        const mapKey = isArtwork
            ? DataKey.ArtworkInstanceIdToAppId
            : DataKey.LabelInstanceIdToAppId

        const idMap = dm.get<Map<number, number | string>>(mapKey)
        const appid = idMap?.get(instanceId)
        if (appid === undefined) return null

        // Resolve richer metadata from the existing full-metadata maps if available
        const metaKey = isArtwork ? DataKey.InstancedArtworkMetadata : DataKey.InstancedLabelMetadata
        const metadata = dm.get<Map<number, InstanceMetadata>>(metaKey)
        const meta = metadata?.get(instanceId)

        return {
            name: meta?.name,
            appid,
            position: meta?.position.clone() ?? new THREE.Vector3(),
            mesh: object,
            instanceIndex: instanceId,
            rendererType: isArtwork ? 'gpu' : 'label',
        }
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
        
        GameFinder.logger.debug(`🔍 Found ${games.length} game(s) in scene (${instancedGames.length} instanced, ${games.length - instancedGames.length} legacy)`)
        return games
    }

    public listAllGameNames(): string[] {
        const games = this.findAll()
        const names = games.map(g => g.name || 'unnamed').sort()
        GameFinder.logger.info(`📋 All games in scene (${names.length}):`, names)
        return names
    }

    private findInstancedGames(): GameSceneObject[] {
        const games: GameSceneObject[] = []
        
        try {
            const artworkMetadata = DataManager.getInstance().get<Map<number, InstanceMetadata>>(DataKey.InstancedArtworkMetadata)
            if (artworkMetadata) {
                GameFinder.logger.debug(`🔍 Instanced artwork metadata contains ${artworkMetadata.size} game(s)`)
                for (const [instanceIndex, data] of artworkMetadata.entries()) {
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
            
            const labelMetadata = DataManager.getInstance().get<Map<number, { name: string; position: THREE.Vector3 }>>(DataKey.InstancedLabelMetadata)
            if (labelMetadata) {
                GameFinder.logger.debug(`🔍 Instanced label metadata contains ${labelMetadata.size} game(s)`)
                for (const [instanceIndex, data] of labelMetadata.entries()) {
                    games.push({
                        name: data.name,
                        position: data.position.clone(),
                        mesh: this.scene,
                        instanceIndex,
                        rendererType: 'label'
                    })
                }
            }
            
            if (!artworkMetadata && !labelMetadata) {
                GameFinder.logger.debug(`🔍 No instanced metadata available`)
            }
        } catch (error) {
            // Metadata not available or not initialized yet
            GameFinder.logger.debug('🔍 Instanced artwork metadata not available:', error)
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
        
        // Check for legacy game meshes (artwork boxes)
        if (child.name?.includes('game-')) {
            return {
                name: child.userData?.name ?? child.name,
                appid: child.userData?.appid,
                position: child.position.clone(),
                mesh: child,
                rendererType: 'legacy'
            }
        }
        
        // Check for label meshes (fallback games without artwork)
        if (child.userData?.isLabel && child.userData?.name) {
            return {
                name: child.userData.name,
                appid: child.userData.appid,
                position: child.position.clone(),
                mesh: child,
                rendererType: 'label'
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

    // @ts-ignore - Intentionally adding to window for debugging
    window.nameAllGames = () => {
        return finder.listAllGameNames()
    }
    
    GameFinder.logger.debug('🔍 Game finder functions exposed to window:')
    GameFinder.logger.debug('  window.findGame("UNLOVED")    - Find game by name')
    GameFinder.logger.debug('  window.findGame(611500)       - Find game by appid')
    GameFinder.logger.debug('  window.findAllGames()         - Get all games')
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeGameFinderOnStart)
