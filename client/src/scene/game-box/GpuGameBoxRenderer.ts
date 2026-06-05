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
 * - PlacementResolved events → unified placement (artwork or label fallback)
 * - PlacementRunResetRequested → wipe all GPU instances before re-sort
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
import {
    GameEventTypes,
    GameRenderEventTypes,
    type PlacementRunResetRequestedEvent,
    type PlacementResolvedEvent,
} from '../../types/InteractionEvents'

export class GpuGameBoxRenderer {
    public static logger = Logger.createLogFunctions(GpuGameBoxRenderer.name)

    private readonly instancedLabelRenderer: InstancedLabelRenderer
    private readonly lodArtworkRenderer: IGameArtworkPipeline
    private readonly renderIntentCoordinator: RenderIntentCoordinator
    private readonly artworkPrefetchCoordinator: ArtworkPrefetchCoordinator
    private readonly boundHandleArtworkSettled: (event: CustomEvent<unknown>) => void
    private readonly boundHandlePlacementResolved: (event: CustomEvent<PlacementResolvedEvent>) => void
    private readonly boundHandlePlacementRunResetRequested: (event: CustomEvent<PlacementRunResetRequestedEvent>) => void
    private resolvedArtworkPlacements = 0
    private resolvedLabelPlacements = 0
    private failedLabelPlacements = 0

    constructor(
        textureCapacity: number,
        placementCapacity: number = textureCapacity,
        labelCapacity: number = placementCapacity
    ) {
        this.instancedLabelRenderer = new InstancedLabelRenderer({ maxInstances: labelCapacity })
        this.lodArtworkRenderer = LodArtworkOrchestratorDebug.fromAppSettings(textureCapacity, placementCapacity)
        this.renderIntentCoordinator = new RenderIntentCoordinator()
        this.artworkPrefetchCoordinator = new ArtworkPrefetchCoordinator({ renderer: this.lodArtworkRenderer })
        this.boundHandleArtworkSettled = this.handleArtworkSettled.bind(this)
        this.boundHandlePlacementResolved = this.handlePlacementResolved.bind(this)
        this.boundHandlePlacementRunResetRequested = this.handlePlacementRunResetRequested.bind(this)

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementResolved,
            this.boundHandlePlacementResolved
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandlePlacementRunResetRequested
        )

        GpuGameBoxRenderer.logger.lifecycle(
            `Initialized (textureCapacity=${textureCapacity}, placementCapacity=${placementCapacity}, ` +
            `labelCapacity=${labelCapacity})`
        )
    }

    private handlePlacementResolved(event: CustomEvent<PlacementResolvedEvent>): void {
        const { game, position, rotation } = event.detail
        this.placeResolvedGame(game, position, rotation)
    }

    private handleArtworkSettled(_event: CustomEvent<unknown>): void {
        this.logRunSummary()
    }

    private handlePlacementRunResetRequested(event: CustomEvent<PlacementRunResetRequestedEvent>): void {
        this.resolvedArtworkPlacements = 0
        this.resolvedLabelPlacements = 0
        this.failedLabelPlacements = 0
    }

    private placeResolvedGame(
        game: SteamGameData,
        position: THREE.Vector3,
        rotation: THREE.Quaternion
    ): void {
        const appid = typeof game.appid === 'number' ? game.appid : 0
        const instanceIndex = this.lodArtworkRenderer.placeInstance(appid, game.name, position, rotation)
        if (instanceIndex >= 0) {
            this.resolvedArtworkPlacements++
            return
        }

        // TODO(placement-resolved-refactor): if we later move placement-time artwork
        // loading directly into LodArtworkOrchestrator, preserve this label fallback
        // contract instead of bypassing GpuGameBoxRenderer entirely.
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
        if (success) {
            this.resolvedLabelPlacements++
        }
        if (!success) {
            this.failedLabelPlacements++
            GpuGameBoxRenderer.logger.warn(`Failed to add label box for "${game.name}" (label instance limit reached?)`)
        }
    }

    public dispose(): void {
        GpuGameBoxRenderer.logger.lifecycle('Disposing')
        EventManager.getInstance().deregisterEventHandler(
            GameEventTypes.ArtworkSettled,
            this.boundHandleArtworkSettled
        )
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementResolved,
            this.boundHandlePlacementResolved
        )
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandlePlacementRunResetRequested
        )
        this.renderIntentCoordinator.dispose()
        this.artworkPrefetchCoordinator.dispose()
        this.instancedLabelRenderer.dispose()
        this.lodArtworkRenderer.dispose()
        GpuGameBoxRenderer.logger.lifecycle('Disposed')
    }

    private logRunSummary(): void {
        const placed = this.resolvedArtworkPlacements + this.resolvedLabelPlacements
        if (placed === 0 && this.failedLabelPlacements === 0) {
            return
        }

        GpuGameBoxRenderer.logger.info(
            `Placement complete: placed=${placed}, artwork=${this.resolvedArtworkPlacements}, ` +
            `labels=${this.resolvedLabelPlacements}, labelFailures=${this.failedLabelPlacements}`
        )
    }
}




