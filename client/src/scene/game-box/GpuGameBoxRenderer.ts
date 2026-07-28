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
    type PlacementCommittedEvent,
    type PlacementRepointRequestedEvent,
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
    private readonly boundHandlePlacementRepointRequested: (event: CustomEvent<PlacementRepointRequestedEvent>) => void
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
        this.boundHandlePlacementRepointRequested = this.handlePlacementRepointRequested.bind(this)

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
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementRepointRequested,
            this.boundHandlePlacementRepointRequested
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

    /**
     * Repoint an already-committed instance to a different game (liminal mode's
     * treadmill). kind is fixed at the caller's discretion — an artwork instance
     * can only be repointed via setInstanceArtwork (requires the new game to
     * already have prefetched artwork; fails otherwise) and a label instance
     * only via setInstanceLabel, since the two live in separate InstancedMeshes.
     */
    private handlePlacementRepointRequested(event: CustomEvent<PlacementRepointRequestedEvent>): void {
        const { instanceIndex, kind, appid, gameName, position, rotation } = event.detail

        const success = kind === 'artwork'
            ? this.lodArtworkRenderer.setInstanceArtwork(instanceIndex, appid, gameName, position, rotation)
            : this.instancedLabelRenderer.setInstanceLabel(instanceIndex, position, gameName, appid, rotation)

        if (!success) {
            GpuGameBoxRenderer.logger.warn(
                `Repoint failed for "${gameName}" (kind=${kind}, instanceIndex=${instanceIndex}) — leaving previous occupant in place`
            )
        }
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
            EventManager.getInstance().emit<PlacementCommittedEvent>(GameRenderEventTypes.PlacementCommitted, {
                appid, instanceIndex, position, rotation, kind: 'artwork',
            })
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
        const appid = typeof game.appid === 'number' ? game.appid : undefined
        const instanceIndex = this.instancedLabelRenderer.addLabelInstance(position, game.name, appid, rotation)
        if (instanceIndex >= 0) {
            this.resolvedLabelPlacements++
            EventManager.getInstance().emit<PlacementCommittedEvent>(GameRenderEventTypes.PlacementCommitted, {
                appid: appid ?? 0, instanceIndex, position, rotation, kind: 'label',
            })
            return
        }

        this.failedLabelPlacements++
        GpuGameBoxRenderer.logger.warn(`Failed to add label box for "${game.name}" (label instance limit reached?)`)
    }

    /**
     * Reconcile for a capacity-compatible library reload where the caller knows exactly which
     * games are gone (see GameBoxSpawner). Games not in removedGameNames keep their prefetched
     * texture slot entirely - prefetchArtwork() already treats an existing slot mapping as a
     * cache hit, so this is what actually avoids re-fetching artwork for a library that only
     * gained or lost a few games. Capacity-incompatible reloads go through GameBoxSpawner's
     * dispose+rebuild branch instead.
     */
    public reconcileForLibraryReload(removedGameNames: readonly string[]): void {
        this.artworkPrefetchCoordinator.reset()
        this.lodArtworkRenderer.reconcileForLibraryReload(removedGameNames)
        this.resolvedArtworkPlacements = 0
        this.resolvedLabelPlacements = 0
        this.failedLabelPlacements = 0
        GpuGameBoxRenderer.logger.lifecycle(`Reconciled for library reload (removed ${removedGameNames.length}, texture slots retained for the rest)`)
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
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementRepointRequested,
            this.boundHandlePlacementRepointRequested
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




