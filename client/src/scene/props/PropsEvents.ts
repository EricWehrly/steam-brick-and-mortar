/**
 * Store Props Events
 *
 * Single source of truth for all event types and interfaces related to store props
 * (shelves, game boxes, signage, room geometry). All emitters and subscribers import
 * from here (or from InteractionEvents.ts which re-exports this module).
 *
 * Event lifecycle overview:
 *
 *   SetupRequest  ──→  StorePropsCoordinator (override handler)
 *                  →   LightingRenderer, SharedMaterialManager (side-effect observers)
 *   SetupCompleted ─→  SceneCoordinator, LightingRenderer
 *   ClearRequest  ──→  StorePropsCoordinator (override handler)
 *
 *   [Steam API emits GamesBatchReady]
 *   BatchCoordinator serialises → BatchReadyForPlacement
 *   ShelfLayoutCoordinator + InstancedShelfRenderer react → ShelfReady
 *   GameBoxSpawner + SceneSignManager react to ShelfReady → GamesPlaced
 *   BatchCoordinator tallies GamesPlaced → AllBatchesComplete
 *
 *   Progress       ──→  StartupEventTracker (telemetry only)
 *   EnableShelfIndices / DisableShelfIndices  ←→  GameSettingsPanel ↔ ShelfStickerHandler
 */

import type { BaseInteractionEvent } from '../../core/EventManager'
import type { SteamGame } from '../../steam'
import type * as THREE from 'three'

// =============================================================================
// LIFECYCLE EVENTS  (store-level setup / teardown)
// =============================================================================

/** Emitted by SceneCoordinator to kick off store initialisation. */
export interface StorePropsSetupRequestEvent extends BaseInteractionEvent {
    readonly config?: {
        readonly enableShelves?: boolean
        readonly enableGameBoxes?: boolean
        readonly enableSignage?: boolean
    }
}

/** Emitted by StorePropsCoordinator when setup is complete. */
export interface StorePropsSetupCompletedEvent extends BaseInteractionEvent {
    // completion is the signal; no payload needed
}

/** Emitted by SteamIntegration to tear down the current store before a reload. */
export interface StorePropsClearRequestEvent extends BaseInteractionEvent {
    // no payload needed
}

// =============================================================================
// BATCH → PLACEMENT FLOW  (the runtime data pipeline)
// =============================================================================

/** Emitted by BatchCoordinator when a serialised batch is ready for rendering. */
export interface BatchReadyForPlacementEvent extends BaseInteractionEvent {
    games: ReadonlyArray<Readonly<SteamGame>>
    batchIndex: number
    totalBatches: number
}

/**
 * Emitted by ShelfLayoutCoordinator (and InstancedShelfRenderer) once a shelf's
 * position is finalised. Carries everything downstream subscribers need to place
 * game boxes and signs.
 *
 * Replaces the old ShelfCreatedEvent.
 */
export interface ShelfReadyEvent extends BaseInteractionEvent {
    /** Batch index this shelf maps to — used as unique shelf identifier. */
    batchIndex: number
    position: Readonly<THREE.Vector3>
    rotationY: number
}

/** Emitted by GameBoxSpawner after all games for a batch are placed. */
export interface GamesPlacedEvent extends BaseInteractionEvent {
    batchIndex: number
    status: BatchProcessingStatus
}

// =============================================================================
// PROGRESS / TELEMETRY
// =============================================================================

/**
 * Emitted by RoomManager and ShelfLayoutCoordinator during store construction.
 * Consumed by StartupEventTracker, which re-emits it as AppEventTypes.DetailUpdate.
 */
export interface StorePropsProgressEvent extends BaseInteractionEvent {
    step: 'room' | 'shelves' | 'games'
    current?: number
    total?: number
    detail: string
}

// =============================================================================
// STATUS ENUM  (shared by GamesPlacedEvent and BatchCoordinator)
// =============================================================================

export enum BatchProcessingStatus {
    // Internal BatchCoordinator tracking states
    Queued = 'queued',
    Dispatched = 'dispatched',
    ShelfRequested = 'shelf-requested',
    ShelfCreated = 'shelf-created',
    // Terminal states (used in GamesPlacedEvent)
    GamesPlaced = 'games-placed',
    Failed = 'failed',
    Complete = 'complete'
}

// =============================================================================
// EVENT TYPE CONSTANTS
// =============================================================================

export const StorePropsEventTypes = {
    // Lifecycle
    SetupRequest:  'store-props:setup-request',
    SetupCompleted: 'store-props:setup-completed',
    ClearRequest:  'store-props:clear-request',

    // Batch → placement pipeline
    BatchReadyForPlacement: 'store-props:batch-ready-placement',
    ShelfReady:  'store-props:shelf-ready',
    GamesPlaced: 'store-props:games-placed',

    // Progress / telemetry
    Progress: 'store-props:progress',

    // Debug / settings
    EnableShelfIndices:  'store-props:enable-shelf-indices',
    DisableShelfIndices: 'store-props:disable-shelf-indices',
} as const

export type StorePropsEventType = typeof StorePropsEventTypes[keyof typeof StorePropsEventTypes]
