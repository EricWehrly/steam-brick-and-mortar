import { describe, it, expect, beforeEach } from 'vitest'
import { WebXRUIPanel } from '../../../src/ui/WebXRUIPanel'
import { EventManager } from '../../../src/core/EventManager'
import { InputEventTypes, type InputDevicesChangedEvent } from '../../../src/types/InteractionEvents'

function emitDevices(devices: InputDevicesChangedEvent['devices']): void {
    EventManager.getInstance().emit<InputDevicesChangedEvent>(InputEventTypes.DevicesChanged, { devices })
}

describe('WebXRUIPanel VR headset status', () => {
    let panel: WebXRUIPanel
    let statusEl: HTMLElement

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="controls-help" class="hidden"></div>
            <div id="vr-headset-status" class="hidden"></div>
            <button id="webxr-button" class="hidden">Enter VR</button>
        `
        statusEl = document.getElementById('vr-headset-status') as HTMLElement

        panel = new WebXRUIPanel()
        panel.init()
    })

    it('shows the detected VR device name when DevicesChanged reports a VR-kind device', () => {
        emitDevices([
            { id: 'mouse-keyboard', name: 'Mouse + Keyboard', kind: 'mouse-keyboard', connected: true, profileId: 'mouse-keyboard' },
            { id: 'vr-session', name: 'VR: PICO 4', kind: 'vr', connected: true, profileId: 'vr' },
        ])

        expect(statusEl.classList.contains('hidden')).toBe(false)
        expect(statusEl.textContent).toContain('PICO 4')
    })

    it('hides the status element when no VR-kind device is present', () => {
        emitDevices([
            { id: 'vr-session', name: 'VR: PICO 4', kind: 'vr', connected: true, profileId: 'vr' },
        ])
        expect(statusEl.classList.contains('hidden')).toBe(false)

        emitDevices([
            { id: 'mouse-keyboard', name: 'Mouse + Keyboard', kind: 'mouse-keyboard', connected: true, profileId: 'mouse-keyboard' },
        ])
        expect(statusEl.classList.contains('hidden')).toBe(true)
    })

    it('stays hidden when the element is absent from the DOM (no crash)', () => {
        document.body.innerHTML = `
            <div id="controls-help" class="hidden"></div>
            <button id="webxr-button" class="hidden">Enter VR</button>
        `
        const panelWithoutStatusEl = new WebXRUIPanel()
        panelWithoutStatusEl.init()

        expect(() => emitDevices([
            { id: 'vr-session', name: 'VR: PICO 4', kind: 'vr', connected: true, profileId: 'vr' },
        ])).not.toThrow()
    })
})
