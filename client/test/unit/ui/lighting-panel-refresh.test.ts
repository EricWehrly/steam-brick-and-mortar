import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { LightingControlsPanel } from '../../../src/ui/LightingControlsPanel'
import { LightRegistry } from '../../../src/lighting/LightRegistry'
import { LightingEventTypes } from '../../../src/types/LightingEvents'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'

describe('Lighting Panel Refresh Integration', () => {
    let panel: LightingControlsPanel
    let scene: THREE.Scene
    let eventManager: EventManager

    beforeEach(() => {
        LightRegistry.getInstance().clear()
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        const appSettings = AppSettings.getInstance()
        panel = new LightingControlsPanel(eventManager, appSettings)
    })

    it('should refresh when lighting system ready event is emitted', () => {
        // Add some lights to the scene
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
        ambientLight.name = 'test-ambient'
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
        directionalLight.name = 'test-directional'
        scene.add(directionalLight)

        expect((panel as any).initialScanPerformed).toBe(false)

        // Emit the lighting system ready event
        eventManager.emit(LightingEventTypes.SystemReady, {
            scene: scene,
            quality: 'enhanced',
            timestamp: Date.now(),
            source: EventSource.System
        })

        expect((panel as any).initialScanPerformed).toBe(true)
    })

    it('should get scene reference from system ready event', () => {
        expect((panel as any).initialScanPerformed).toBe(false)

        // Emit the lighting system ready event
        eventManager.emit(LightingEventTypes.SystemReady, {
            scene: scene,
            quality: 'enhanced',
            timestamp: Date.now(),
            source: EventSource.System
        })

        expect((panel as any).initialScanPerformed).toBe(true)
    })

    it('should handle both light created and system ready events', () => {
        // First emit a light created event (original functionality)
        const light = new THREE.PointLight(0xffffff, 1.0)
        LightRegistry.getInstance().registerLight(light, { source: 'test' })
        eventManager.emit(LightingEventTypes.Created, {
            light: light,
            scene: scene,
            lightType: 'PointLight',
            lightName: 'test-point',
            timestamp: Date.now(),
            source: EventSource.ManagedLight
        })

        expect((panel as any).initialScanPerformed).toBe(true)
        expect((panel as any).lightGroups.get('PointLight')?.lights).toContain(light)

        // Then emit system ready event (new functionality)
        eventManager.emit(LightingEventTypes.SystemReady, {
            scene: scene,
            quality: 'enhanced',
            timestamp: Date.now(),
            source: EventSource.System
        })

        expect((panel as any).initialScanPerformed).toBe(true)
        expect((panel as any).lightGroups.get('PointLight')?.lights).toContain(light)
    })
})