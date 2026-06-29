/**
 * Lighting system events — system-to-system events for the lighting subsystem.
 *
 * Separated from InteractionEvents.ts because these are not user interaction events.
 * InteractionEvents.ts re-exports everything here for backward compatibility during migration.
 */

import * as THREE from 'three'
import type { BaseInteractionEvent } from '../core/EventManager'
import type { LightingQuality } from '../core/AppSettings'

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

export interface LightCreatedEvent extends BaseInteractionEvent {
    light: THREE.Light
    scene: THREE.Scene
    lightType: string
    lightName?: string
}

/**
 * Request a point light be added to the scene via LightingRenderer.
 * Emitting this avoids adding lights directly to the scene (which causes
 * full shadow map recalculation outside the lighting system's control).
 */
export interface PointLightRequestEvent extends BaseInteractionEvent {
    color: number
    intensity: number
    distance: number
    position: THREE.Vector3
    name?: string
    /** Optional parent Object3D; if omitted, light is added to lighting group */
    parent?: THREE.Object3D
}

export interface LightingSystemReadyEvent extends BaseInteractionEvent {
    scene: THREE.Scene
    quality: string
}

export interface GroupBrightnessChangedEvent extends BaseInteractionEvent {
    readonly lightIds: readonly number[]
    readonly brightness: number
}

export const LightingEventTypes = {
    Toggle: 'lighting:toggle',
    DebugToggle: 'lighting:debug-toggle',
    QualityChanged: 'lighting:quality-changed',
    Created: 'lighting:created',
    SystemReady: 'lighting:system-ready',
    /** Request a point light be created by the lighting system (avoids direct scene add) */
    PointLightRequested: 'lighting:point-light-requested',
    GroupBrightnessChanged: 'lighting:group-brightness-changed',
} as const

export const ArtworkEventTypes = {
    TuningChanged: 'artwork:tuning-changed',
    ShadowContactTuningChanged: 'artwork:shadow-contact-tuning-changed',
} as const
