// TD: legacy-atlas-removal
/**
 * GpuGameBoxRenderer
 * 
 * ROLE: GPU-instanced rendering of game boxes with LOD (Level of Detail) support.
 * Creates and manages instanced meshes for game box geometry and artwork textures.
 * 
 * OWNS:
 * - Game box geometry and materials
 * - InstancedLabelRenderer for text labels
 * - LOD artwork orchestrator for texture management
 * - LOD distance manager for camera-based detail switching
 * - Box instance state (positions, orientations, LOD levels)
 * - ArtworkPrefetchCoordinator for batch-time artwork prewarm
 * 
 * RECEIVES:
 * - prefetchArtwork(appid, url, name) → Phase 1: load texture into atlas
 * - PlacementResolved events → unified placement (artwork or label fallback)
 * - clearPlacements() → wipe all GPU instances before re-sort
 * - addToScene(scene) → Attaches instanced meshes to scene
 * - updateLODForCamera(camera) → Adjusts detail levels based on distance
 * - dispose() → Cleans up GPU resources
 * 
 * EMITS:
 * - (none currently - pure rendering)
 * 
 * DELEGATES TO:
 * - InstancedLabelRenderer: Text label rendering on boxes
 * - LodArtworkOrchestratorDebug: Texture loading, LOD management, devtools console commands
 * - LodDistanceManagerDebug: Camera distance calculations, LOD distribution diagnostics
 * 
 * DOES NOT:
 * DOES NOT:
 * - Know about shelves or layout (receives positions)
 * - Decide which games to display (told what to render)
 * - Handle section/placement ordering (that's GameBoxSpawner)
 * 
 * RELATED:
 * - GameBoxSpawner: Coordinates game placement and calls this renderer
 * - SharedPropsUtils: Game box dimensions and layout constants
 */

import * as THREE from 'three'
import type { SteamGameData } from './types/GameData'
import { InstancedLabelRenderer } from './instancing/InstancedLabelRenderer'
import { LodArtworkOrchestratorDebug } from './instancing/LodArtworkOrchestratorDebug'
import type { IGameArtworkPipeline } from './instancing/IGameArtworkPipeline'
import { RenderIntentCoordinator } from './RenderIntentCoordinator'
import { ArtworkPrefetchCoordinator } from '../spawning/ArtworkPrefetchCoordinator'
import { Logger } from '../../utils/Logger'
import { EventManager } from '../../core/EventManager'
import { GameRenderEventTypes, type PlacementResolvedEvent } from '../../types/InteractionEvents'

export class GpuGameBoxRenderer {
    public static logger = Logger.createLogFunctions(GpuGameBoxRenderer.name)

    private readonly instancedLabelRenderer: InstancedLabelRenderer
    private readonly lodArtworkRenderer: IGameArtworkPipeline
    private readonly renderIntentCoordinator: RenderIntentCoordinator
    private readonly artworkPrefetchCoordinator: ArtworkPrefetchCoordinator
    private readonly boundHandlePlacementResolved: (event: CustomEvent<PlacementResolvedEvent>) => void

    constructor(textureCapacity: number = 2000, placementCapacity: number = textureCapacity) {
        this.instancedLabelRenderer = new InstancedLabelRenderer({ maxInstances: placementCapacity })
        this.lodArtworkRenderer = LodArtworkOrchestratorDebug.fromAppSettings(textureCapacity, placementCapacity)
        this.renderIntentCoordinator = new RenderIntentCoordinator()
        this.artworkPrefetchCoordinator = new ArtworkPrefetchCoordinator({ renderer: this })
        this.boundHandlePlacementResolved = this.handlePlacementResolved.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementResolved,
            this.boundHandlePlacementResolved
        )

        GpuGameBoxRenderer.logger.lifecycle(
            `Initialized (textureCapacity=${textureCapacity}, placementCapacity=${placementCapacity})`
        )
    }

    private handlePlacementResolved(event: CustomEvent<PlacementResolvedEvent>): void {
        const { game, position, rotation } = event.detail
        this.placeResolvedGame(game, position, rotation)
    }

    /**
     * Phase 1: fetch and cache artwork for a game without placing a GPU instance.
     * Call as batches arrive. Idempotent — calling again for the same game is a no-op.
     *
     * Callers are responsible for resolving the artwork URL and for deciding whether
     * this game should get artwork at all. Pass the resolved URL directly.
     */
    public async prefetchArtwork(
        appid: number,
        artworkUrl: string,
        gameName: string
    ): Promise<'prefetched' | 'cached' | 'permanent-failure' | 'error'> {
        return this.lodArtworkRenderer.prefetchArtwork(appid, artworkUrl, gameName)
    }

    private placeResolvedGame(
        game: SteamGameData,
        position: THREE.Vector3,
        rotation: THREE.Quaternion
    ): void {
        const appid = typeof game.appid === 'number' ? game.appid : 0
        const instanceIndex = this.lodArtworkRenderer.placeInstance(appid, game.name, position, rotation)
        if (instanceIndex >= 0) return
        // Atlas miss — fall through to label
        this.placeLabelBox(game, position, rotation)
    }

    /**
     * Place a text-label box at a world position.
     * No artwork fetch is triggered. This is a pure GPU-instancing call.
     *
     * rotation encodes both shelf orientation and front/back side.
     */
    public placeLabelBox(
        game: SteamGameData,
        position: THREE.Vector3,
        rotation: THREE.Quaternion
    ): void {
        const success = this.instancedLabelRenderer.addLabelInstance(
            position,
            game.name,
            typeof game.appid === 'number' ? game.appid : undefined,
            rotation
        )
        if (!success) {
            GpuGameBoxRenderer.logger.debug(`Failed to add label box for "${game.name}"`)
        }
    }

    /**
     * Clear all GPU instance placements without releasing texture atlas slots.
     * Call before re-sorting; follow with placeArtworkInstance()/placeLabelBox() for each game.
     */
    public clearPlacements(): void {
        this.resetPendingPlacementIntents()
        this.lodArtworkRenderer.clearPlacements()
        this.instancedLabelRenderer.clear()
    }

    /**
     * Drop unresolved placement intents at the start of a new placement run.
     * This prevents stale intents from resolving during a later run.
     */
    public resetPendingPlacementIntents(): void {
        this.renderIntentCoordinator.clearPendingPlacementIntents()
    }

    public dispose(): void {
        GpuGameBoxRenderer.logger.lifecycle('Disposing')
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementResolved,
            this.boundHandlePlacementResolved
        )
        this.renderIntentCoordinator.dispose()
        this.artworkPrefetchCoordinator.dispose()
        this.instancedLabelRenderer.dispose()
        this.lodArtworkRenderer.dispose()
        GpuGameBoxRenderer.logger.lifecycle('Disposed')
    }
}




