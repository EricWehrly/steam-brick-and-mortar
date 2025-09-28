import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { LightingControlsPanel } from '../../../src/ui/LightingControlsPanel'
import { LightingEventTypes } from '../../../src/types/InteractionEvents'
import { EventManager, EventSource } from '../../../src/core/EventManager'

describe('Lighting Panel Refresh Integration', () => {
    let panel: LightingControlsPanel
    let scene: THREE.Scene
    let eventManager: EventManager

    beforeEach(() => {
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        panel = new LightingControlsPanel()
    })

    it('should refresh when lighting system ready event is emitted', () => {
        // Add some lights to the scene
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
        ambientLight.name = 'test-ambient'
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
        directionalLight.name = 'test-directional'
        scene.add(directionalLight)

        // Initially panel should not have scene reference
        expect((panel as any).scene).toBeNull()

        // Emit the lighting system ready event
        eventManager.emit(LightingEventTypes.SystemReady, {
            scene: scene,
            quality: 'enhanced',
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Panel should now have the scene reference (indicating the event was processed)
        expect((panel as any).scene).toBe(scene)
    })

    it('should get scene reference from system ready event', () => {
        // Initially panel should not have scene
        expect((panel as any).scene).toBeNull()

        // Emit the lighting system ready event
        eventManager.emit(LightingEventTypes.SystemReady, {
            scene: scene,
            quality: 'enhanced',
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Panel should now have the scene reference
        expect((panel as any).scene).toBe(scene)
    })

    it('should handle both light created and system ready events', () => {
        // First emit a light created event (original functionality)
        const light = new THREE.PointLight(0xffffff, 1.0)
        eventManager.emit(LightingEventTypes.Created, {
            light: light,
            scene: scene,
            lightType: 'PointLight',
            lightName: 'test-point',
            timestamp: Date.now(),
            source: EventSource.ManagedLight
        })

        // Panel should have scene after first event
        expect((panel as any).scene).toBe(scene)

        // Then emit system ready event (new functionality)
        eventManager.emit(LightingEventTypes.SystemReady, {
            scene: scene,
            quality: 'enhanced',
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Panel should still have the scene reference
        expect((panel as any).scene).toBe(scene)
    })
})