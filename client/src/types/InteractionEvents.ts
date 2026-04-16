/**
 * Interaction Event Types
 *
 * Type definitions for all interaction events in the application.
 * Events are namespaced by system for clarity and organization.
 *
 * TD: This file conflates user interaction events (input, game selection) with
 * system-to-system events (Steam loading, store props lifecycle, room events).
 * These are intentionally different concepts and should be disentangled into
 * separate files (e.g. InputEvents.ts, SteamEvents.ts, SceneEvents.ts).
 * LightingEvents.ts is the first step in that direction.
 *
 * TODO: Review all event interfaces for unnecessary properties (timestamp/source
 * default, many events may have cruft that's passed but never consumed).
 */

import * as THREE from 'three'
import type { BaseInteractionEvent } from '../core/EventManager'
import type { WebXRCapabilities } from '../webxr/WebXRManager'
import type { SteamGame } from '../steam'
import type { SteamGameData } from '../scene/game-box/types/GameData'

// =============================================================================
// STEAM EVENTS
// =============================================================================

export interface SteamLoadGamesEvent extends BaseInteractionEvent {
    userInput: string
}

export interface SteamLoadFromCacheEvent extends BaseInteractionEvent {
    userInput: string
}



export interface SteamCacheClearEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface SteamCacheRefreshEvent extends BaseInteractionEvent {
    /** If true, ignore local db and re-fetch from network */
    forceUpdate?: boolean
}

export interface SteamCacheStatsEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface SteamImageCacheClearEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface SteamDevModeToggleEvent extends BaseInteractionEvent {
    isEnabled: boolean
}

export interface SteamDataLoadedEvent extends BaseInteractionEvent {
    userInput: string
}

export interface SteamGameLoadedEvent extends BaseInteractionEvent {
    game: Readonly<SteamGame>
}

export interface SteamGamesBatchEvent extends BaseInteractionEvent {
    games: ReadonlyArray<Readonly<SteamGame>>
    batchIndex: number
    totalBatches: number
}

export interface SteamNetworkFetchProgressEvent extends BaseInteractionEvent {
    fetched: number
    total: number
}

// =============================================================================
// ROOM EVENTS
// =============================================================================

export interface RoomCreateEvent extends BaseInteractionEvent {
    width?: number
    depth?: number
    height?: number
    skyboxPreset?: string
    proceduralTextures?: boolean
}

export interface RoomResizeEvent extends BaseInteractionEvent {
    width: number
    depth: number
    height: number
    reason?: string
}

export interface RoomCreatedEvent extends BaseInteractionEvent {
    dimensions: { width: number; depth: number; height: number }
}

export interface RoomResizedEvent extends BaseInteractionEvent {
    dimensions: { width: number; depth: number; height: number }
    centerOffset?: { x: number; y: number; z: number }
    shelfLayout?: { rows: number; shelvesPerRow?: number }
}

// =============================================================================
// WEBXR EVENTS  
// =============================================================================

export interface WebXRToggleEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface WebXRSessionStartEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface WebXRSessionEndEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface WebXRErrorEvent extends BaseInteractionEvent {
    error: Error
}

export interface WebXRSupportChangeEvent extends BaseInteractionEvent {
    capabilities: WebXRCapabilities
}

// =============================================================================
// INPUT EVENTS
// =============================================================================

export interface InputPauseEvent extends BaseInteractionEvent {
    reason?: 'menu' | 'user' | 'system'
}

export interface InputResumeEvent extends BaseInteractionEvent {
    reason?: 'menu' | 'user' | 'system'
}

export interface SceneCanvasClickEvent extends BaseInteractionEvent {
    clientX: number
    clientY: number
    button: number
    ndcX: number
    ndcY: number
}

// =============================================================================
// UI EVENTS
// =============================================================================

export interface MenuOpenEvent extends BaseInteractionEvent {
    menuType: 'pause' | 'settings' | 'debug'
}

export interface MenuCloseEvent extends BaseInteractionEvent {
    menuType: 'pause' | 'settings' | 'debug'
}

export interface ImageCacheStatsRequestEvent extends BaseInteractionEvent {
    // No additional data needed
}

// =============================================================================
// GAME EVENTS
// =============================================================================

export interface SceneReadyEvent extends BaseInteractionEvent { }

export interface GameStartEvent extends BaseInteractionEvent {
    // Emitted when ALL prerequisites are ready and the game can start
    // Prerequisites: scene ready, render loop established, UI operational
    prerequisites: {
        sceneReady: boolean
        renderLoopReady: boolean
        uiReady: boolean
    }
}

export interface ShelfBounds {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
}

export interface ShelfLayoutDeterminedEvent extends BaseInteractionEvent {
    shelfBounds: ShelfBounds
    shelfLayout: { rows: number; shelvesPerRow?: number }
}

// Moved to EnvironmentEvents.ts: LayoutChangedEvent, SomeBatchesCompleteEvent, AllBatchesCompleteEvent, GamesSortEvent

export interface GameSelectedEvent extends BaseInteractionEvent {
    /** App ID of the selected game */
    appid: number | string
}

// =============================================================================
// STORE PROPS EVENTS
// =============================================================================

export enum BatchProcessingStatus {
    Queued = 'queued',
    Dispatched = 'dispatched',
    ShelfRequested = 'shelf-requested',
    ShelfCreated = 'shelf-created',
    GamesPlaced = 'games-placed',
    Failed = 'failed',
    Complete = 'complete'
}

export interface StorePropsProgressEvent extends BaseInteractionEvent {
    step: 'room' | 'shelves' | 'games'
    current?: number
    total?: number
    detail: string
}

export interface StorePropsSetupRequestEvent extends BaseInteractionEvent {
    config?: {
        enableShelves?: boolean
        enableGameBoxes?: boolean
        enableSignage?: boolean
    }
}

export interface StorePropsSetupCompletedEvent extends BaseInteractionEvent {
    // No additional data needed
}

// Phase 3: Event-driven batch-to-placement flow
export interface BatchReadyForPlacementEvent extends BaseInteractionEvent {
    games: ReadonlyArray<Readonly<SteamGame>>
    batchIndex: number
    totalBatches: number
}

/**
 * Authoritative shelf placement event emitted by ShelfLayoutCoordinator.
 * Carries everything both the renderer (InstancedShelfRenderer) and
 * game/sign placement subscribers (GameBoxSpawner, SceneSignManager) need.
 *
 * Replaces the old ShelfCreatedEvent. ShelfPlacementCoordinator is gone.
 */
export interface ShelfReadyEvent extends BaseInteractionEvent {
    /** Batch index this shelf maps to — used as unique shelf identifier. */
    batchIndex: number
    position: Readonly<THREE.Vector3>
    rotationY: number
}

export interface GameBoxSpawnedEvent extends BaseInteractionEvent {
    game: Readonly<SteamGameData>
    position: Readonly<THREE.Vector3>
    side: 'front' | 'back'
    rotation?: Readonly<THREE.Quaternion>
}

export interface GamesPlacedEvent extends BaseInteractionEvent {
    batchIndex: number
    status: BatchProcessingStatus
}

export interface RendererReadyEvent extends BaseInteractionEvent {
    rendererType: 'shelf' | 'gamebox'
}

// =============================================================================
// EVENT TYPE CONSTANTS
// =============================================================================

export const SteamEventTypes = {
    LoadGames: 'steam:load-games',
    LoadFromCache: 'steam:load-from-cache',
    CacheClear: 'steam:cache-clear',
    CacheRefresh: 'steam:cache-refresh',
    CacheStats: 'steam:cache-stats',
    ImageCacheClear: 'steam:image-cache-clear',
    DevModeToggle: 'steam:dev-mode-toggle',
    DataLoaded: 'steam:data-loaded',
    GameLoaded: 'steam:game-loaded',
    GamesBatchReady: 'steam:games-batch-ready',
    NetworkFetchProgress: 'steam:network-fetch-progress'
} as const

export const RoomEventTypes = {
    CreateInitial: 'room:create-initial',
    Resize: 'room:resize',
    Created: 'room:created',
    Resized: 'room:resized'
} as const

export const WebXREventTypes = {
    Toggle: 'webxr:toggle',
    SessionStart: 'webxr:session-start',
    SessionEnd: 'webxr:session-end',
    Error: 'webxr:error',
    SupportChange: 'webxr:support-change'
} as const

export const InputEventTypes = {
    Pause: 'input:pause',
    Resume: 'input:resume',
    SceneCanvasClick: 'input:scene-canvas-click'
} as const

export const UIEventTypes = {
    MenuOpen: 'ui:menu-open',
    MenuClose: 'ui:menu-close',
    ImageCacheStatsRequest: 'ui:image-cache-stats-request',
    SortRequested: 'ui:sort-requested',
} as const

export const GameEventTypes = {
    SceneReady: 'game:scene-ready',
    Start: 'game:start',
    ShelfLayoutDetermined: 'game:shelf-layout-determined',
    /** Reserved seam: emitted when an existing layout changes at runtime. No emitters yet. */
    LayoutChanged: 'game:layout-changed',
    SomeBatchesComplete: 'game:some-batches-complete',
    AllBatchesComplete: 'game:all-batches-complete',
    /** Fired when a game is selected (e.g. clicked in scene) — opens detail panel */
    Selected: 'game:selected',
    /** Fired after all batches complete; carries the sorted game list and bucket map. */
    GamesSort: 'game:games-sort'
} as const

export const CeilingEventTypes = {
    Toggle: 'ceiling:toggle'
} as const

export const AppSettingsEventTypes = {
    Changed: 'app-settings:changed'
} as const

export const StorePropsEventTypes = {
    Progress: 'store-props:progress',
    SetupRequest: 'store-props:setup-request',
    SetupCompleted: 'store-props:setup-completed',
    EnableShelfIndices: 'store-props:enable-shelf-indices',
    DisableShelfIndices: 'store-props:disable-shelf-indices',
    // Phase 3: Event-driven batch-to-placement flow
    BatchReadyForPlacement: 'store-props:batch-ready-placement',
    ShelfReady: 'store-props:shelf-ready',
    GameBoxSpawned: 'store-props:game-box-spawned',
    GamesPlaced: 'store-props:games-placed',
    // Renderer initialization
    RendererReady: 'store-props:renderer-ready'
} as const

// =============================================================================
// APP / STARTUP EVENTS
// =============================================================================

export const AppEventTypes = {
    /** Fired when a startup phase begins */
    PhaseStarted:          'app:phase-started',
    /** Fired when a startup phase completes (with duration) */
    PhaseCompleted:        'app:phase-completed',
    /** Fired for named milestones within a phase */
    Milestone:             'app:milestone',
    /** Fired when a detail string should be shown in the progress UI */
    DetailUpdate:          'app:detail-update',
    /** Fired when game loading kicks off (PostSetupEncore) */
    GameLoadingStarted:    'app:game-loading-started',
    /** Fired when the loading sub-phase changes (cache / fetch) */
    GameLoadingPhaseChanged: 'app:game-loading-phase-changed',
    /** Fired with current/total games progress */
    GameLoadingProgress:   'app:game-loading-progress',
    /** Fired when startup is fully complete and UI should fade out */
    StartupComplete:       'app:startup-complete',
    /**
     * Fired when off-thread procedural texture generation finishes and materials
     * have been applied to the scene — the world now has full surface detail.
     *
     * TD: system-events-split — this is a system lifecycle event, not an app/UI event.
     * Should live in a dedicated SystemEvents.ts alongside StoreFirstContentReady
     * and StoreFullyPopulated once that split happens.
     */
    WorldDetailEnhanced:   'app:world-detail-enhanced',
    /**
     * Fired when the first meaningful batch of game boxes is placed in the store.
     * TD: system-events-split
     */
    StoreFirstContentReady: 'app:store-first-content-ready',
    /**
     * Fired when all game boxes are placed and the store is fully populated.
     * TD: system-events-split
     */
    StoreFullyPopulated:   'app:store-fully-populated',
} as const

export interface PhaseCompletedEvent extends BaseInteractionEvent {
    /** StartupPhase value (string enum) */
    phase: string
    timestamp: number
    duration: number
}

export interface MilestoneEvent extends BaseInteractionEvent {
    description: string
}

export interface DetailUpdateEvent extends BaseInteractionEvent {
    detail: string
}

export interface GameLoadingStartedEvent extends BaseInteractionEvent {
    totalGames: number
    /** StartupPhase value (string enum) */
    phase: string
}

export interface GameLoadingPhaseChangedEvent extends BaseInteractionEvent {
    loadingPhase: 'cache' | 'fetch' | 'batch'
    detail: string
}

export interface GameLoadingProgressEvent extends BaseInteractionEvent {
    current: number
    total: number
}

// EVENT TYPE MAPPINGS
// Import from EventTypeMap.ts directly — not re-exported from here.
