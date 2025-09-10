/**
 * Interaction Event Types
 * 
 * Type definitions for all interaction events in the application.
 * Events are namespaced by system for clarity and organization.
 */

import type { BaseInteractionEvent } from '../core/EventManager'
import type { WebXRCapabilities } from '../webxr/WebXRManager'

// =============================================================================
// STEAM EVENTS
// =============================================================================

export interface SteamLoadGamesEvent extends BaseInteractionEvent {
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

export interface DebugStatsRequestEvent extends BaseInteractionEvent {
    // No additional data needed
}

// =============================================================================
// EVENT TYPE CONSTANTS
// =============================================================================

export const SteamEventTypes = {
    LoadGames: 'steam:load-games',
    UseOffline: 'steam:use-offline', 
    CacheClear: 'steam:cache-clear',
    CacheRefresh: 'steam:cache-refresh',
    CacheStats: 'steam:cache-stats',
    ImageCacheClear: 'steam:image-cache-clear'
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
    DebugStatsRequest: 'ui:debug-stats-request'
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
    [SteamEventTypes.UseOffline]: SteamUseOfflineEvent
    [SteamEventTypes.CacheClear]: SteamCacheClearEvent
    [SteamEventTypes.CacheRefresh]: SteamCacheRefreshEvent
    [SteamEventTypes.CacheStats]: SteamCacheStatsEvent
    [SteamEventTypes.ImageCacheClear]: SteamImageCacheClearEvent
    
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
    [UIEventTypes.DebugStatsRequest]: DebugStatsRequestEvent
}

/**
 * Union type of all event names for type checking
 */
export type InteractionEventName = keyof InteractionEventMap

/**
 * Utility type to get event detail type from event name
 */
export type InteractionEventDetail<T extends InteractionEventName> = InteractionEventMap[T]
