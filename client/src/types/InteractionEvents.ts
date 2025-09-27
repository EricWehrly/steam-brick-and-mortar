/**
 * Interaction Event Types
 * 
 * Type definitions for all interaction events in the application.
 * Events are namespaced by system for clarity and organization.
 */

// I really don't like that we let this get imported ... YOLO
import type { LightingQuality } from '../core/AppSettings'
import * as THREE from 'three'
import type { BaseInteractionEvent } from '../core/EventManager'
import type { WebXRCapabilities } from '../webxr/WebXRManager'

// =============================================================================
// STEAM EVENTS
// =============================================================================

export interface SteamLoadGamesEvent extends BaseInteractionEvent {
    vanityUrl: string
}

export interface SteamLoadFromCacheEvent extends BaseInteractionEvent {
    vanityUrl: string
}

export interface SteamUseOfflineEvent extends BaseInteractionEvent {
    vanityUrl: string
}

export interface SteamCacheClearEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface SteamCacheRefreshEvent extends BaseInteractionEvent {
    // No additional data needed
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
    vanityUrl: string
    gameCount: number
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

export interface GameStartEvent extends BaseInteractionEvent {
    // Emitted when the application is ready and the game can start
    // This signals that the render loop is established and UI is operational
}

// =============================================================================
// LIGHTING EVENTS
// =============================================================================

export interface LightingToggleEvent extends BaseInteractionEvent {
    enabled: boolean
}

export interface LightingDebugToggleEvent extends BaseInteractionEvent {
    enabled: boolean
}

export interface LightingQualityChangedEvent extends BaseInteractionEvent {
    quality: LightingQuality
}

export interface CeilingToggleEvent extends BaseInteractionEvent {
    visible: boolean
}

// TODO: Can we do this without importing THREE?
export interface LightCreatedEvent extends BaseInteractionEvent {
    light: THREE.Light
    scene: THREE.Scene
    lightType: string
    lightName?: string
}

// =============================================================================
// EVENT TYPE CONSTANTS
// =============================================================================

export const SteamEventTypes = {
    LoadGames: 'steam:load-games',
    LoadFromCache: 'steam:load-from-cache',
    UseOffline: 'steam:use-offline', 
    CacheClear: 'steam:cache-clear',
    CacheRefresh: 'steam:cache-refresh',
    CacheStats: 'steam:cache-stats',
    ImageCacheClear: 'steam:image-cache-clear',
    DevModeToggle: 'steam:dev-mode-toggle',
    DataLoaded: 'steam:data-loaded'
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
    Resume: 'input:resume'
} as const

export const UIEventTypes = {
    MenuOpen: 'ui:menu-open',
    MenuClose: 'ui:menu-close',
    ImageCacheStatsRequest: 'ui:image-cache-stats-request'
} as const

export const GameEventTypes = {
    Start: 'game:start'
} as const

export const LightingEventTypes = {
    Toggle: 'lighting:toggle',
    DebugToggle: 'lighting:debug-toggle',
    QualityChanged: 'lighting:quality-changed',
    Created: 'lighting:created'
} as const

export const CeilingEventTypes = {
    Toggle: 'ceiling:toggle'
} as const

// =============================================================================
// EVENT TYPE MAPPINGS
// =============================================================================

/**
 * Map of event names to their corresponding event types
 * Used for type-safe event handling
 */
export interface InteractionEventMap {
    // Steam events
    [SteamEventTypes.LoadGames]: SteamLoadGamesEvent
    [SteamEventTypes.LoadFromCache]: SteamLoadFromCacheEvent
    [SteamEventTypes.UseOffline]: SteamUseOfflineEvent
    [SteamEventTypes.CacheClear]: SteamCacheClearEvent
    [SteamEventTypes.CacheRefresh]: SteamCacheRefreshEvent
    [SteamEventTypes.CacheStats]: SteamCacheStatsEvent
    [SteamEventTypes.ImageCacheClear]: SteamImageCacheClearEvent
    [SteamEventTypes.DevModeToggle]: SteamDevModeToggleEvent
    [SteamEventTypes.DataLoaded]: SteamDataLoadedEvent
    
    // WebXR events
    [WebXREventTypes.Toggle]: WebXRToggleEvent
    [WebXREventTypes.SessionStart]: WebXRSessionStartEvent
    [WebXREventTypes.SessionEnd]: WebXRSessionEndEvent
    [WebXREventTypes.Error]: WebXRErrorEvent
    [WebXREventTypes.SupportChange]: WebXRSupportChangeEvent
    
    // Input events
    [InputEventTypes.Pause]: InputPauseEvent
    [InputEventTypes.Resume]: InputResumeEvent
    
    // UI events
    [UIEventTypes.MenuOpen]: MenuOpenEvent
    [UIEventTypes.MenuClose]: MenuCloseEvent
    [UIEventTypes.ImageCacheStatsRequest]: ImageCacheStatsRequestEvent
    
    // Game events
    [GameEventTypes.Start]: GameStartEvent
    
    // Lighting events
    [LightingEventTypes.Toggle]: LightingToggleEvent
    [LightingEventTypes.DebugToggle]: LightingDebugToggleEvent
    [LightingEventTypes.QualityChanged]: LightingQualityChangedEvent
    [LightingEventTypes.Created]: LightCreatedEvent
}

/**
 * Union type of all event names for type checking
 */
export type InteractionEventName = keyof InteractionEventMap

/**
 * Utility type to get event detail type from event name
 */
export type InteractionEventDetail<T extends InteractionEventName> = InteractionEventMap[T]
