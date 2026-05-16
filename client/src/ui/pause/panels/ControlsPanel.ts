/**
 * ControlsPanel - Display controls/help information in pause menu
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { EventManager } from '../../../core/EventManager'
import { InputEventTypes } from '../../../types/InteractionEvents'
import { getInputActionDefinition, InputAction, InputActionType, INPUT_ACTION_ORDER, type InputActionId } from '../../../input/InputActions'
import { InputManager } from '../../../input/InputManager'
import { formatBindingList, InputProfileId, type InputBinding, type InputProfileDefinition, type InputProfileIdValue } from '../../../input/InputProfile'
import '../../../styles/pause-menu/controls-panel.css'

export class ControlsPanel extends PauseMenuPanel {
    readonly id = 'controls'
    readonly title = 'Input'
    readonly icon = '⌨️'
    private readonly eventManager = EventManager.getInstance()
    private deviceListenerRegistered = false
    private profileListenerRegistered = false
    private capturingActionId: InputActionId | null = null
    private analogRefreshTimer: number | null = null

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
    }

    render(): string {
        return `
            <div class="app-section panel-card pause-section">
                <h4>Input Devices</h4>
                <div class="pause-row-list">
                    <div class="pause-row control-item">
                        <label for="input-device-select" class="control-key pause-row-key">Configure Device</label>
                        <div class="control-desc pause-row-text">
                            <select id="input-device-select" aria-label="Active input device"></select>
                        </div>
                    </div>
                </div>
                <div id="input-profile-toggles" class="input-profile-toggles"></div>
            </div>

            <div class="app-section panel-card pause-section">
                <h4>Analog Inputs</h4>
                <div class="pause-row-list">
                    <div class="pause-row control-item">
                        <label for="input-analog-select" class="control-key pause-row-key">Detected Axis</label>
                        <div class="control-desc pause-row-text">
                            <select id="input-analog-select" aria-label="Detected analog axes"></select>
                        </div>
                    </div>
                </div>
            </div>

            <div class="app-section panel-card pause-section">
                <h4>Current Mappings</h4>
                <div id="input-capture-status" class="input-capture-status" aria-live="polite"></div>
                <div class="input-mapping-table-wrap">
                    <table class="input-mapping-table">
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Binding</th>
                                <th>Edit</th>
                            </tr>
                        </thead>
                        <tbody id="input-mapping-tbody"></tbody>
                    </table>
                </div>
                <div class="input-mapping-actions">
                    <button id="input-reset-profile" type="button" class="input-reset-button">Reset Active Profile</button>
                </div>
                <p class="input-fast-follow-note">
                    Fast-follow: controller/touch/VR mappings for Interact, menu navigation, toggle UI/fullscreen, roll, and vertical look are partially defined but not fully wired in runtime yet.
                </p>
            </div>
        `
    }

    attachEvents(): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const select = panel.querySelector('#input-device-select') as HTMLSelectElement | null
        if (select) {
            select.addEventListener('change', () => {
                const selectedProfileId = select.value as InputProfileIdValue
                const inputManager = InputManager.getActiveInstance()
                if (!inputManager) {
                    return
                }

                inputManager.setActiveProfile(selectedProfileId)
                this.renderMappingTable(inputManager.getActiveProfile())
            })
        }

        const resetButton = panel.querySelector('#input-reset-profile') as HTMLButtonElement | null
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                const inputManager = InputManager.getActiveInstance()
                if (!inputManager) {
                    return
                }

                inputManager.resetActiveProfileBindings()
                this.refreshUI()
            })
        }

        panel.addEventListener('click', this.handlePanelClick)
        panel.addEventListener('change', this.handlePanelChange)

        if (!this.deviceListenerRegistered) {
            this.eventManager.registerEventHandler(InputEventTypes.DevicesChanged, this.handleDevicesChanged)
            this.deviceListenerRegistered = true
        }

        if (!this.profileListenerRegistered) {
            this.eventManager.registerEventHandler(InputEventTypes.ProfileChanged, this.handleProfileChanged)
            this.profileListenerRegistered = true
        }

        this.refreshUI()
    }

    onShow(): void {
        this.refreshUI()
        if (this.analogRefreshTimer === null) {
            this.analogRefreshTimer = window.setInterval(() => this.refreshUI(), 250)
        }
    }

    onHide(): void {
        this.stopAnalogRefreshTimer()
        this.stopCaptureListeners()
        this.capturingActionId = null
    }

    private handleDevicesChanged = (): void => {
        this.refreshUI()
    }

    private handleProfileChanged = (): void => {
        this.refreshUI()
    }

    private handlePanelClick = (event: Event): void => {
        const target = event.target as HTMLElement
        const actionButton = target.closest('[data-input-edit-action]') as HTMLButtonElement | null
        if (!actionButton) {
            return
        }

        const actionId = actionButton.dataset.inputEditAction as InputActionId | undefined
        if (!actionId) {
            return
        }

        this.startCapture(actionId)
    }

    private handlePanelChange = (event: Event): void => {
        const target = event.target as HTMLElement
        const toggle = target.closest('[data-input-profile-toggle]') as HTMLInputElement | null
        if (!toggle) {
            return
        }

        const profileId = toggle.dataset.inputProfileToggle as InputProfileIdValue | undefined
        if (!profileId) {
            return
        }

        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        inputManager.setProfileEnabled(profileId, toggle.checked)
    }

    private startCapture(actionId: InputActionId): void {
        if (this.capturingActionId) {
            return
        }

        this.stopCaptureListeners()
        this.capturingActionId = actionId
        this.updateCaptureStatus(`Press a key or mouse button for ${getInputActionDefinition(actionId).label}`)

        document.addEventListener('keydown', this.handleCaptureKeyDown, { once: true })
        document.addEventListener('mousedown', this.handleCaptureMouseDown, { once: true })
    }

    private finishCapture(binding: InputBinding): void {
        this.stopCaptureListeners()
        const actionId = this.capturingActionId
        this.capturingActionId = null

        if (!actionId) {
            return
        }

        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        inputManager.setActionBinding(actionId, binding)
        this.updateCaptureStatus('Binding updated')
        this.refreshUI()
    }

    private handleCaptureKeyDown = (event: KeyboardEvent): void => {
        event.preventDefault()
        this.finishCapture({
            type: 'keyboard-button',
            code: event.code,
            label: event.code
        })
    }

    private handleCaptureMouseDown = (event: MouseEvent): void => {
        event.preventDefault()
        this.finishCapture({
            type: 'mouse-button',
            button: event.button,
            label: event.button === 0 ? 'Left Click' : `Mouse ${event.button}`
        })
    }

    private updateCaptureStatus(message: string): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const status = panel.querySelector('#input-capture-status') as HTMLElement | null
        if (!status) {
            return
        }

        status.textContent = message
    }

    private stopCaptureListeners(): void {
        document.removeEventListener('keydown', this.handleCaptureKeyDown)
        document.removeEventListener('mousedown', this.handleCaptureMouseDown)
    }

    private stopAnalogRefreshTimer(): void {
        if (this.analogRefreshTimer !== null) {
            window.clearInterval(this.analogRefreshTimer)
            this.analogRefreshTimer = null
        }
    }

    private refreshUI(): void {
        const panel = this.getPanelElement()
        const inputManager = InputManager.getActiveInstance()

        if (!panel || !inputManager) {
            return
        }

        const devices = inputManager.getAvailableDevices()
        const profiles = inputManager.getProfiles()
        const activeProfileId = inputManager.getActiveProfileId()

        this.renderDeviceOptions(devices, profiles, activeProfileId)
        this.renderProfileToggles(profiles)
        this.renderAnalogSnapshot(inputManager.getConnectedGamepadAxisSnapshot())
        this.renderMappingTable(inputManager.getActiveProfile())
    }

    private renderDeviceOptions(
        devices: ReadonlyArray<{ name: string; profileId: string }>,
        profiles: ReadonlyArray<InputProfileDefinition>,
        activeProfileId: InputProfileIdValue
    ): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const select = panel.querySelector('#input-device-select') as HTMLSelectElement | null
        if (!select) {
            return
        }

        const options = new Map<InputProfileIdValue, string>()
        for (const device of devices) {
            const profile = profiles.find(candidate => candidate.id === device.profileId)
            if (!profile || !profile.enabled) {
                continue
            }

            if (!options.has(profile.id)) {
                options.set(profile.id, profile.name)
            }
        }

        if (options.size === 0) {
            options.set(InputProfileId.MouseKeyboard, 'Mouse + Keyboard')
        }

        select.innerHTML = Array.from(options.entries())
            .map(([profileId, profileName]) => `<option value="${profileId}">${profileName}</option>`)
            .join('')

        if (options.has(activeProfileId)) {
            select.value = activeProfileId
        }
    }

    private renderProfileToggles(profiles: ReadonlyArray<InputProfileDefinition>): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const container = panel.querySelector('#input-profile-toggles') as HTMLElement | null
        if (!container) {
            return
        }

        container.innerHTML = profiles
            .map(profile => `
                <label class="input-profile-toggle-item">
                    <input type="checkbox" data-input-profile-toggle="${profile.id}" ${profile.enabled ? 'checked' : ''} />
                    <span>${profile.name} Active</span>
                </label>
            `)
            .join('')
    }

    private renderAnalogSnapshot(axes: ReadonlyArray<{ label: string; value: number }>): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const select = panel.querySelector('#input-analog-select') as HTMLSelectElement | null
        if (!select) {
            return
        }

        if (axes.length === 0) {
            select.innerHTML = '<option value="">No connected gamepad axes detected</option>'
            return
        }

        select.innerHTML = axes
            .map(axis => `<option value="${axis.label}">${axis.label}: ${axis.value.toFixed(3)}</option>`)
            .join('')
    }

    private renderMappingTable(profile: InputProfileDefinition): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const tbody = panel.querySelector('#input-mapping-tbody') as HTMLElement | null
        if (!tbody) {
            return
        }

        tbody.innerHTML = INPUT_ACTION_ORDER
            .map(actionId => {
                const action = getInputActionDefinition(actionId)
                const bindingText = formatBindingList(profile.bindings[actionId])
                const canEdit = this.isActionEditable(actionId)
                return `
                    <tr>
                        <td>${action.label}</td>
                        <td>${bindingText}</td>
                        <td>
                            ${canEdit ? `<button type="button" data-input-edit-action="${actionId}">Edit</button>` : '<span>Locked</span>'}
                        </td>
                    </tr>
                `
            })
            .join('')
    }

    private isActionEditable(actionId: InputActionId): boolean {
        if (actionId === InputAction.LookHorizontal || actionId === InputAction.LookVertical) {
            return false
        }

        const definition = getInputActionDefinition(actionId)
        return definition.type !== InputActionType.Axis || actionId === InputAction.MoveForward || actionId === InputAction.MoveBack || actionId === InputAction.MoveLeft || actionId === InputAction.MoveRight || actionId === InputAction.MoveUp || actionId === InputAction.MoveDown
    }

    dispose(): void {
        if (this.deviceListenerRegistered) {
            this.eventManager.deregisterEventHandler(InputEventTypes.DevicesChanged, this.handleDevicesChanged)
            this.deviceListenerRegistered = false
        }
        if (this.profileListenerRegistered) {
            this.eventManager.deregisterEventHandler(InputEventTypes.ProfileChanged, this.handleProfileChanged)
            this.profileListenerRegistered = false
        }
        this.stopAnalogRefreshTimer()
        this.stopCaptureListeners()
        const panel = this.getPanelElement()
        panel?.removeEventListener('click', this.handlePanelClick)
        panel?.removeEventListener('change', this.handlePanelChange)
        super.dispose()
    }
}
