/**
 * Store Props Events - Event definitions for the props rendering system
 * 
 * This module contains all event types and interfaces related to store props
 * (shelves, games, signage, and interactive objects) rendering and management.
 */

import type { BaseInteractionEvent } from '../../core/EventManager'
import { EventSource } from '../../core/EventManager'

// =============================================================================
// STORE PROPS EVENT INTERFACES
// =============================================================================

export interface StorePropsSetupRequestEvent extends BaseInteractionEvent {
    readonly config: {
        readonly enableShelves?: boolean
        readonly enableGameBoxes?: boolean
        readonly enableSignage?: boolean
        readonly enableTestObjects?: boolean
        readonly enableDebugObjects?: boolean
        readonly enableAtmosphericProps?: boolean
    }
}

export interface StorePropsSetupStartedEvent extends BaseInteractionEvent {
    // No additional data needed - start signal is sufficient
}

export interface StorePropsSetupCompletedEvent extends BaseInteractionEvent {
    // No additional data needed - completion is the signal itself
}

export interface StorePropsClearRequestEvent extends BaseInteractionEvent {
    // No additional data needed
}

export interface StorePropsAtmosphericRequestEvent extends BaseInteractionEvent {
    // No additional data needed
}

// =============================================================================
// STORE PROPS EVENT TYPES
// =============================================================================

export const StorePropsEventTypes = {
    SetupRequest: 'store-props:setup-request',
    SetupStarted: 'store-props:setup-started',
    SetupCompleted: 'store-props:setup-completed',
    ClearRequest: 'store-props:clear-request',
    AtmosphericRequest: 'store-props:atmospheric-request'
} as const

// =============================================================================
// TYPE EXPORTS FOR CONVENIENCE
// =============================================================================

export type { BaseInteractionEvent, EventSource }