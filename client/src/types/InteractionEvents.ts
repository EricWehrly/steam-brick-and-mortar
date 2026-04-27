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
import type { IStockStrategy } from '../scene/props/shared/StockStrategy'

// =============================================================================
// STEAM EVENTS
// =============================================================================

export interface SteamLoadLibraryEvent extends BaseInteractionEvent {
    /** Vanity URL, SteamID, or profile URL. Optional if reloading the current user. */
    userInput?: string
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

/**
 * Integration/session-level Steam load signal.
 *
 * Semantics: SteamIntegration has finished persisting the current user/library
 * session state (e.g. `steam.games`, optional `steam.userInput`).
 *
 * This event is intentionally NOT the canonical arrangement trigger. Use:
 * - `SteamEventTypes.LibraryManifestReady` for immutable membership counts/appids
 * - `GameEventTypes.GameDataReady` for definitions-ready grouping/sorting
 */
export interface SteamDataLoadedEvent extends BaseInteractionEvent {
    userInput?: string
}

/**
 * Emitted when library membership is fixed for a load run.
 *
 * This is the immutable manifest signal (appid list + totals), emitted before
 * progressive batch processing begins so systems can pre-size resources.
 */
export interface SteamLibraryManifestReadyEvent extends BaseInteractionEvent {
    userInput?: string
    totalGames: number
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
    stockStrategy: IStockStrategy
}

// Moved to EnvironmentEvents.ts: LayoutChangedEvent, SomeBatchesCompleteEvent, AllBatchesCompleteEvent, GamesSortEvent

export interface GameSelectedEvent extends BaseInteractionEvent {
    /** App ID of the selected game */
    appid: number | string
}

export interface ArtworkIntentSettledEvent extends BaseInteractionEvent {
    appid: number
    gameName: string
}

export interface PlacementIntentReadyEvent extends BaseInteractionEvent {
    appid: number
    game: SteamGameData
    position: THREE.Vector3
    rotation: THREE.Quaternion
}

export interface PlacementResolvedEvent extends BaseInteractionEvent {
    appid: number
    game: SteamGameData
    position: THREE.Vector3
    rotation: THREE.Quaternion
}

// =============================================================================
// STORE PROPS EVENTS
// =============================================================================
// Interfaces, enums, and StorePropsEventTypes now live in PropsEvents.ts.
// Re-exported below for backward-compatible imports from InteractionEvents.

// Store props event interfaces and StorePropsEventTypes live in PropsEvents.ts.
// Re-exported here so existing imports from InteractionEvents continue to work.
export type {
    StorePropsSetupRequestEvent,
    StorePropsSetupCompletedEvent,
    StorePropsLibraryReloadRequestEvent,
    BatchReadyForPlacementEvent,
    ShelfReadyEvent,
    GamesPlacedEvent,
    StorePropsProgressEvent,
} from '../scene/props/PropsEvents'
export { StorePropsEventTypes, BatchProcessingStatus } from '../scene/props/PropsEvents'

// =============================================================================
// EVENT TYPE CONSTANTS
// =============================================================================

export interface SteamCacheClearEvent extends BaseInteractionEvent {
    // No additional data needed
}

export const SteamEventTypes = {
    LoadLibrary: 'steam:load-library',
    CacheClear: 'steam:cache-clear',
    CacheStats: 'steam:cache-stats',
    ImageCacheClear: 'steam:image-cache-clear',
    DevModeToggle: 'steam:dev-mode-toggle',
    /** Session/integration signal (UI/cache panels), not pipeline readiness. */
    DataLoaded: 'steam:data-loaded',
    /** Immutable membership signal for a load run (appid set + counts). */
    LibraryManifestReady: 'steam:library-manifest-ready',
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
    SortRequested: 'ui:sort-requested',  // TD: remove when LayoutControlPanel migration is complete
    ArrangementRequested: 'ui:arrangement-requested',
    LayoutRequested: 'ui:layout-requested',
} as const

export const GameEventTypes = {
    SceneReady: 'game:scene-ready',
    Start: 'game:start',
    ShelfLayoutDetermined: 'game:shelf-layout-determined',
    /** Reserved seam: emitted when an existing layout changes at runtime. No emitters yet. */
    LayoutChanged: 'game:layout-changed',
    SomeBatchesComplete: 'game:some-batches-complete',
    AllBatchesComplete: 'game:all-batches-complete',
    /** Definitions-ready seam (steam.games committed), emitted by SteamIntegration. */
    GameDataReady: 'game:game-data-ready',
    /**
     * Fired by LodArtworkOrchestrator when all in-flight artwork fetches have resolved
     * (success or permanent failure). Signals that label compaction can safely run,
     * since no further label-creating failures are expected.
     */
    ArtworkSettled: 'game:artwork-settled',
    /** Fired when a game is selected (e.g. clicked in scene) - opens detail panel */
    Selected: 'game:selected',
    /** Fired after all batches complete; carries the sorted game list and bucket map. */
    GamesSort: 'game:games-sort',
    /** Fired after grouping + sorting; carries sections ready for placement. */
    SectionsReady: 'game:sections-ready'
} as const

export const GameRenderEventTypes = {
    ArtworkIntentSettled: 'game-render:artwork-intent-settled',
    PlacementIntentReady: 'game-render:placement-intent-ready',
    PlacementResolved: 'game-render:placement-resolved',
} as const

export const CeilingEventTypes = {
    Toggle: 'ceiling:toggle'
} as const

export const AppSettingsEventTypes = {
    Changed: 'app-settings:changed'
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
     * have been applied to the scene - the world now has full surface detail.
     *
     * TD: system-events-split - this is a system lifecycle event, not an app/UI event.
     * Should live in a dedicated SystemEvents.ts alongside StoreFullyPopulated once that split happens.
     */
    WorldDetailEnhanced:   'app:world-detail-enhanced',
    /**
     * Fired when all game boxes are placed and the store is fully populated.
     * TD: system-events-split
     */
    StoreFullyPopulated:   'app:store-fully-populated',
    /**
     * Fired when the browser tab gains or loses visibility.
     * Subscribers use this to throttle the render loop or drop LOD when hidden.
     */
    VisibilityChanged:     'app:visibility-changed',
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

export interface VisibilityChangedEvent extends BaseInteractionEvent {
    /** true = tab visible / focused; false = tab hidden / blurred */
    visible: boolean
    /** Which browser event triggered the change */
    visibilitySource: 'visibilitychange' | 'window-focus' | 'window-blur'
}

// EVENT TYPE MAPPINGS
// Import from EventTypeMap.ts directly - not re-exported from here.
