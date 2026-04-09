/**
 * Game Finder - Locate game objects in the Three.js scene
 *
 * TD: GameFinder belongs in src/utils/ (or src/scene/), not src/debug/.
 * It's used in production raycast resolution paths, not just debug tooling.
 * Deferred to avoid a disruptive move while the raycast path is actively changing.
 *
 * Singleton pattern (ES2022 private static field) — static methods are the
 * public API; no getInstance() call needed at call sites.
 *
 * Usage:
 *   GameFinder.findByIntersection(intersection)  // raycast hit → game
 *   GameFinder.find("UNLOVED")                   // by name or appid
 *   GameFinder.findAll()                          // all known games
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
    instanceIndex?: number
    rendererType: 'gpu' | 'legacy' | 'label'
}

export class GameFinder {
    static #instance: GameFinder | null = null
    private static readonly logger = Logger.createLogFunctions(GameFinder.name)

    static get #current(): GameFinder {
        return GameFinder.#instance ??= new GameFinder()
    }

    public static getScene(): THREE.Scene {
        return GameFinder.#current.scene
    }

    // Exposed for debug tools that need direct scene access (GameSpotlight etc.)
    readonly scene: THREE.Scene

    private constructor() {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (!scene) {
            throw new Error('GameFinder requires scene to be registered in DataManager')
        }
        this.scene = scene
    }

    /**
     * Resolve a raycaster intersection to a GameSceneObject.
     *
     * Mesh name is the discriminator between artwork and label InstancedMeshes —
     * instanceId is per-mesh (0..N), so the same number on two different meshes
     * means two different games. The metadata maps are keyed the same way.
     *
     * @param intersection  THREE.Intersection from raycaster.intersectObjects()
     */
    public static findByIntersection(intersection: THREE.Intersection): GameSceneObject | null {
        const { object, instanceId } = intersection
        if (instanceId === undefined) return null

        const meshName = object.name
        const isArtwork = meshName === INSTANCED_ARTWORK_MESH_NAME
        const isLabel = meshName === INSTANCED_LABEL_MESH_NAME
        if (!isArtwork && !isLabel) return null

        const dm = DataManager.getInstance()
        const metaKey = isArtwork ? DataKey.InstancedArtworkMetadata : DataKey.InstancedLabelMetadata
        const meta = dm.get<Map<number, InstanceMetadata>>(metaKey)?.get(instanceId)
        if (!meta?.appid) return null

        return {
            name: meta.name,
            appid: meta.appid,
            position: meta.position.clone(),
            mesh: object,
            instanceIndex: instanceId,
            rendererType: isArtwork ? 'gpu' : 'label',
        }
    }

    public static find(identifier: string | number): GameSceneObject | null {
        return typeof identifier === 'number'
            ? GameFinder.#current.findByAppId(identifier)
            : GameFinder.#current.findByName(identifier)
    }

    public static findAll(): GameSceneObject[] {
        return GameFinder.#current.findAllImpl()
    }

    public static listAllGameNames(): string[] {
        const games = GameFinder.findAll()
        const names = games.map(g => g.name || 'unnamed').sort()
        GameFinder.logger.info(`📋 All games in scene (${names.length}):`, names)
        return names
    }

    // ── Instance methods (accessed via #current) ──────────────────────────────

    private findByName(gameName: string): GameSceneObject | null {
        const searchTerm = gameName.toLowerCase()
        GameFinder.logger.debug(`🔍 Searching for game by name: "${gameName}"`)
        const result = this.findGame((child) =>
            child.userData?.name?.toLowerCase().includes(searchTerm) ||
            child.name?.toLowerCase().includes(searchTerm)
        )
        if (result) {
            GameFinder.logger.debug(`✅ Found: ${result.name} at (${result.position.x.toFixed(2)}, ${result.position.y.toFixed(2)}, ${result.position.z.toFixed(2)})`)
        } else {
            GameFinder.logger.warn(`❌ Not found: "${gameName}"`)
        }
        return result
    }

    private findByAppId(appid: number | string): GameSceneObject | null {
        GameFinder.logger.debug(`🔍 Searching for game by appid: ${appid}`)
        const result = this.findGame((child) => child.userData?.appid === appid)
        if (result) {
            GameFinder.logger.debug(`✅ Found: ${result.name} (${result.appid})`)
        } else {
            GameFinder.logger.warn(`❌ Not found: appid ${appid}`)
        }
        return result
    }

    private findAllImpl(): GameSceneObject[] {
        const games: GameSceneObject[] = []
        const instancedGames = this.findInstancedGames()
        games.push(...instancedGames)
        this.scene.traverse((child) => {
            const game = this.extractGameObject(child)
            if (game) games.push(game)
        })
        GameFinder.logger.debug(`🔍 Found ${games.length} game(s) in scene (${instancedGames.length} instanced, ${games.length - instancedGames.length} legacy)`)
        return games
    }

    private findInstancedGames(): GameSceneObject[] {
        const games: GameSceneObject[] = []
        const dm = DataManager.getInstance()
        try {
            const artworkMetadata = dm.get<Map<number, InstanceMetadata>>(DataKey.InstancedArtworkMetadata)
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
            const labelMetadata = dm.get<Map<number, InstanceMetadata>>(DataKey.InstancedLabelMetadata)
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
        } catch (error) {
            GameFinder.logger.debug('🔍 Instanced metadata not available:', error)
        }
        return games
    }

    private findGame(predicate: (child: THREE.Object3D) => boolean): GameSceneObject | null {
        const instancedGames = this.findInstancedGames()
        for (const game of instancedGames) {
            const mockChild = {
                userData: { name: game.name, appid: game.appid, isGameBox: true },
                name: game.name
            } as unknown as THREE.Object3D
            if (predicate(mockChild)) return game
        }
        let found: GameSceneObject | null = null
        this.scene.traverse((child) => {
            if (found) return
            if (predicate(child)) found = this.extractGameObject(child)
        })
        return found
    }

    private extractGameObject(child: THREE.Object3D): GameSceneObject | null {
        if (this.isInstancedMeshParent(child)) return null
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).findGame = (identifier: string | number) => GameFinder.find(identifier)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).findAllGames = () => GameFinder.findAll()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).nameAllGames = () => GameFinder.listAllGameNames()
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeGameFinderOnStart)
