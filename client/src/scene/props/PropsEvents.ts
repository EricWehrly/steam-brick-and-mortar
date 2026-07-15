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
 *                  →   SkyboxManager, SharedMaterialManager, LightingRenderer
 *   SetupCompleted ─→  SceneCoordinator, LightingRenderer
 *   LibraryReloadRequest  ──→  StorePropsCoordinator (override handler)
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

/**
 * Emitted before loading a different library/user profile.
 * Consumers should clear library-bound placement/prefetch state. GPU texture-array capacity
 * only needs disposing and rebuilding when the incoming library won't fit what's already
 * allocated — see incomingGameCount below and GameBoxSpawner's capacity-vs-no-capacity-change
 * reset split (docs/architecture/label-and-placement-reset-architecture-review.md, "Library
 * Reload Lifecycle").
 */
export interface StorePropsLibraryReloadRequestEvent extends BaseInteractionEvent {
    /**
     * Game count of the library about to be rendered, when known at emit time. Undefined when
     * the caller hasn't fetched the new library yet (e.g. an online reload that clears the scene
     * before the network call resolves) — treat undefined as "assume capacity may not fit."
     */
    readonly incomingGameCount?: number
    /**
     * Set only when the caller diffed the incoming library against what's currently rendered
     * (see LocalSteamLibraryLoader.computeLibraryDiff) and knows exactly which games are gone.
     * When present (even as an empty array — "nothing removed"), GameBoxSpawner can reconcile
     * instead of a blanket reset: keep unchanged games' GPU texture slots, free only these. When
     * absent, the caller doesn't have that information and a full soft/hard reset applies as
     * before — absent is not the same as "nothing removed."
     */
    readonly removedGameNames?: readonly string[]
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
    /** Global shelf index — unique identifier across all sections. */
    shelfIndex: number
    /** Which section this shelf belongs to. */
    sectionIndex: number
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
// USER PROP FOLDER EVENTS
// =============================================================================

/**
 * Emitted by ScenePropsPanel when a GLB file from the user's chosen folder is
 * ready to load. The url is a blob: URL created from a FileSystemFileHandle read;
 * the scene layer loads it via AssetLoader and places it in the store.
 *
 * See docs/features/user-prop-folder.md for full context.
 */
export interface UserPropGlbReadyEvent extends BaseInteractionEvent {
    readonly url: string
    readonly filename: string
}

// =============================================================================
// EVENT TYPE CONSTANTS
// =============================================================================

export const StorePropsEventTypes = {
    // Lifecycle
    SetupRequest:  'store-props:setup-request',
    SetupCompleted: 'store-props:setup-completed',
    LibraryReloadRequest: 'store-props:library-reload-request',

    // Batch → placement pipeline
    BatchReadyForPlacement: 'store-props:batch-ready-placement',
    ShelfReady:  'store-props:shelf-ready',
    GamesPlaced: 'store-props:games-placed',

    // Progress / telemetry
    Progress: 'store-props:progress',

    // Debug / settings
    EnableShelfIndices:  'store-props:enable-shelf-indices',
    DisableShelfIndices: 'store-props:disable-shelf-indices',

    // User prop folder (see docs/features/user-prop-folder.md)
    UserPropGlbReady: 'scene-props:user-glb-ready',
} as const

export type StorePropsEventType = typeof StorePropsEventTypes[keyof typeof StorePropsEventTypes]
