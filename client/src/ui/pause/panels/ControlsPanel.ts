/**
 * ControlsPanel - Display controls/help information in pause menu
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { EventManager } from '../../../core/EventManager'
import { InputEventTypes } from '../../../types/InteractionEvents'
import { getInputActionDefinition, InputAction, InputActionType, INPUT_ACTION_ORDER, type InputActionId } from '../../../input/InputActions'
import { getDuplicateBindingWarnings, getLinkedInverseAssignment, isDerivedLinkedActionLocked } from '../../../input/InputBindingUtils'
import { InputManager } from '../../../input/InputManager'
import { formatBindingList, InputDeviceKind, InputProfileId, type AxisDirection, type InputBinding, type InputProfileDefinition, type InputProfileIdValue } from '../../../input/InputProfile'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import '../../../styles/pause-menu/controls-panel.css'

export class ControlsPanel extends PauseMenuPanel {
    readonly id = 'controls'
    readonly title = 'Input'
    readonly icon = '⌨️'
    private readonly eventManager = EventManager.getInstance()
    private deviceListenerRegistered = false
    private profileListenerRegistered = false
    private capturingActionId: InputActionId | null = null
    private capturingProfileId: InputProfileIdValue | null = null
    private captureGamepadPollTimer: number | null = null

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
                    <div class="pause-row control-item">
                        <span class="control-key pause-row-key">Active</span>
                        <div class="control-desc pause-row-text">
                            <label class="input-device-enabled-toggle">
                                <input id="input-device-enabled" type="checkbox" data-input-device-enabled />
                                <span>Enabled for runtime input</span>
                            </label>
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
                    Fast-follow: controller/touch/VR mappings for Interact, menu navigation, toggle UI/fullscreen, and roll are partially defined but not fully wired in runtime yet.
                </p>
            </div>
        `
    }

    attachEvents(): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        UIComponentUtils.setupSelect<InputProfileIdValue>(panel, {
            selectId: 'input-device-select',
            parseValue: (rawValue) => rawValue as InputProfileIdValue,
            onChange: this.handleProfileSelectionChange.bind(this)
        })

        UIComponentUtils.setupToggle(panel, {
            toggleId: 'input-device-enabled',
            onChange: this.handleProfileEnabledToggle.bind(this)
        })

        UIComponentUtils.setupButton(panel, {
            buttonId: 'input-reset-profile',
            onClick: this.handleResetProfileClick.bind(this)
        })

        UIComponentUtils.setupDelegatedDataButtons<string>(
            panel,
            '[data-input-edit-action]',
            'inputEditAction',
            (rawActionId) => this.handleEditActionClick(rawActionId as InputActionId)
        )

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
    }

    onHide(): void {
        this.stopCaptureListeners()
        this.capturingActionId = null
    }

    private handleDevicesChanged = (): void => {
        this.refreshUI()
    }

    private handleProfileChanged = (): void => {
        this.refreshUI()
    }

    private handleProfileSelectionChange(selectedProfileId: InputProfileIdValue): void {
        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        inputManager.profileService.setActiveProfile(selectedProfileId)
        this.renderMappingTable(inputManager.profileService.getActiveProfile())
    }

    private handleProfileEnabledToggle(checked: boolean): void {
        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        inputManager.profileService.setProfileEnabled(inputManager.profileService.getActiveProfileId(), checked)
    }

    private handleResetProfileClick(): void {
        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        inputManager.profileService.resetActiveProfileBindings()
        this.refreshUI()
    }

    private handleEditActionClick(actionId: InputActionId): void {
        if (!INPUT_ACTION_ORDER.includes(actionId)) {
            return
        }

        this.startCapture(actionId)
    }

    private startCapture(actionId: InputActionId): void {
        if (this.capturingActionId) {
            return
        }

        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        const activeProfile = inputManager.profileService.getActiveProfile()

        this.stopCaptureListeners()
        this.capturingActionId = actionId
        this.capturingProfileId = activeProfile.id
        const actionLabel = getInputActionDefinition(actionId).label

        if (activeProfile.deviceKind === InputDeviceKind.Gamepad) {
            this.updateCaptureStatus(`Move a stick or press a gamepad button for ${actionLabel}`)
            this.captureGamepadPollTimer = window.setInterval(() => this.pollGamepadCapture(), 50)
            return
        }

        if (activeProfile.deviceKind === InputDeviceKind.MouseKeyboard) {
            this.updateCaptureStatus(`Press a key, click a mouse button, or move mouse axis for ${actionLabel}`)
            document.addEventListener('keydown', this.handleCaptureKeyDown, { once: true })
            document.addEventListener('mousedown', this.handleCaptureMouseDown, { once: true })
            document.addEventListener('mousemove', this.handleCaptureMouseMove)
            return
        }

        this.updateCaptureStatus(`Editing ${activeProfile.name} bindings is not supported yet`)
        this.capturingActionId = null
        this.capturingProfileId = null
    }

    private finishCapture(binding: InputBinding): void {
        this.stopCaptureListeners()
        const actionId = this.capturingActionId
        this.capturingActionId = null
        const captureProfileId = this.capturingProfileId
        this.capturingProfileId = null

        if (!actionId) {
            return
        }

        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        if (captureProfileId && inputManager.profileService.getActiveProfileId() !== captureProfileId) {
            this.updateCaptureStatus('Capture cancelled because active profile changed')
            return
        }

        inputManager.profileService.setActionBinding(actionId, binding)
        const linkedAssignment = getLinkedInverseAssignment(actionId, binding)
        if (linkedAssignment) {
            inputManager.profileService.setActionBinding(linkedAssignment.actionId, linkedAssignment.binding)
            const linkedLabel = getInputActionDefinition(linkedAssignment.actionId).label
            this.updateCaptureStatus(`Binding updated; ${linkedLabel} assigned inverse`) 
        } else {
            this.updateCaptureStatus('Binding updated')
        }
        this.refreshUI()
    }

    private handleCaptureKeyDown = (event: KeyboardEvent): void => {
        event.preventDefault()
        const actionId = this.capturingActionId
        if (!actionId) {
            return
        }

        const direction = this.getButtonDirectionForAxisAction(actionId)
        if (direction === null) {
            this.stopCaptureListeners()
            this.capturingActionId = null
            this.capturingProfileId = null
            this.updateCaptureStatus('Capture cancelled')
            return
        }

        this.finishCapture({
            type: 'keyboard-button',
            code: event.code,
            direction,
            label: event.code
        })
    }

    private handleCaptureMouseDown = (event: MouseEvent): void => {
        event.preventDefault()
        const actionId = this.capturingActionId
        if (!actionId) {
            return
        }

        const direction = this.getButtonDirectionForAxisAction(actionId)
        if (direction === null) {
            this.stopCaptureListeners()
            this.capturingActionId = null
            this.capturingProfileId = null
            this.updateCaptureStatus('Capture cancelled')
            return
        }

        this.finishCapture({
            type: 'mouse-button',
            button: event.button,
            direction,
            label: event.button === 0 ? 'Left Click' : `Mouse ${event.button}`
        })
    }

    private handleCaptureMouseMove = (event: MouseEvent): void => {
        const actionId = this.capturingActionId
        if (!actionId || !this.isAxisAction(actionId)) {
            return
        }

        if (Math.abs(event.movementX) < 3 && Math.abs(event.movementY) < 3) {
            return
        }

        const axis = Math.abs(event.movementX) >= Math.abs(event.movementY) ? 'x' : 'y'
        this.finishCapture({
            type: 'mouse-axis',
            axis,
            sensitivity: 1,
            label: axis === 'x' ? 'Mouse X' : 'Mouse Y'
        })
    }

    private pollGamepadCapture(): void {
        const actionId = this.capturingActionId
        if (!actionId) {
            return
        }

        const gamepads = Array.from(navigator.getGamepads?.() ?? []).filter((gamepad): gamepad is Gamepad => Boolean(gamepad && gamepad.connected))
        if (gamepads.length === 0) {
            return
        }

        if (this.isAxisAction(actionId)) {
            let strongestAxis: { index: number; value: number } | null = null
            for (const gamepad of gamepads) {
                gamepad.axes.forEach((axisValue, axisIndex) => {
                    if (Math.abs(axisValue) < 0.5) {
                        return
                    }

                    if (!strongestAxis || Math.abs(axisValue) > Math.abs(strongestAxis.value)) {
                        strongestAxis = { index: axisIndex, value: axisValue }
                    }
                })
            }

            if (strongestAxis) {
                const direction = this.getGamepadAxisDirectionForAction(actionId, strongestAxis.value)
                this.finishCapture({
                    type: 'gamepad-axis',
                    axis: strongestAxis.index,
                    direction,
                    deadZone: 0.15,
                    label: `Gamepad Axis ${strongestAxis.index}`
                })
                return
            }
        }

        for (const gamepad of gamepads) {
            for (let buttonIndex = 0; buttonIndex < gamepad.buttons.length; buttonIndex += 1) {
                const button = gamepad.buttons[buttonIndex]
                if (!button || button.value < 0.5) {
                    continue
                }

                const direction = this.getButtonDirectionForAxisAction(actionId)
                if (direction === null) {
                    this.stopCaptureListeners()
                    this.capturingActionId = null
                    this.capturingProfileId = null
                    this.updateCaptureStatus('Capture cancelled')
                    return
                }

                this.finishCapture({
                    type: 'gamepad-button',
                    button: buttonIndex,
                    direction,
                    label: `Gamepad Button ${buttonIndex}`
                })
                return
            }
        }
    }

    private isAxisAction(actionId: InputActionId): boolean {
        return getInputActionDefinition(actionId).type === InputActionType.Axis
    }

    private getButtonDirectionForAxisAction(actionId: InputActionId): AxisDirection | undefined | null {
        if (!this.isAxisAction(actionId)) {
            return undefined
        }

        if (actionId !== InputAction.LookHorizontal && actionId !== InputAction.LookVertical) {
            return 'positive'
        }

        const response = window.prompt(
            'Bind as + or - direction? Type + for increase (right/up), - for decrease (left/down).',
            '+'
        )

        if (response === null) {
            return null
        }

        return response.trim().startsWith('-') ? 'negative' : 'positive'
    }

    private getGamepadAxisDirectionForAction(actionId: InputActionId, axisValue: number): 'positive' | 'negative' | 'both' {
        if (actionId === InputAction.LookHorizontal || actionId === InputAction.LookVertical) {
            return 'both'
        }

        return axisValue >= 0 ? 'positive' : 'negative'
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
        document.removeEventListener('mousemove', this.handleCaptureMouseMove)

        if (this.captureGamepadPollTimer !== null) {
            window.clearInterval(this.captureGamepadPollTimer)
            this.captureGamepadPollTimer = null
        }
    }



    private refreshUI(): void {
        const panel = this.getPanelElement()
        const inputManager = InputManager.getActiveInstance()

        if (!panel || !inputManager) {
            return
        }

        const devices = inputManager.actionResolver.getAvailableDevices()
        const profiles = inputManager.profileService.getProfiles()
        const activeProfileId = inputManager.profileService.getActiveProfileId()
        const activeProfile = inputManager.profileService.getActiveProfile()

        this.renderDeviceOptions(devices, profiles, activeProfileId)
        this.renderActiveToggle(activeProfile)
        this.renderMappingTable(activeProfile)
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
            if (!profile) {
                continue
            }

            if (!options.has(profile.id)) {
                options.set(profile.id, profile.enabled ? profile.name : `${profile.name} (Disabled)`)
            }
        }

        if (options.size === 0) {
            options.set(InputProfileId.MouseKeyboard, 'Mouse + Keyboard')
        }

        if (!options.has(activeProfileId)) {
            const activeProfile = profiles.find(candidate => candidate.id === activeProfileId)
            if (activeProfile) {
                options.set(activeProfile.id, activeProfile.enabled ? activeProfile.name : `${activeProfile.name} (Disabled)`)
            }
        }

        select.innerHTML = Array.from(options.entries())
            .map(([profileId, profileName]) => `<option value="${profileId}">${profileName}</option>`)
            .join('')

        if (options.has(activeProfileId)) {
            select.value = activeProfileId
        }
    }

    private renderActiveToggle(profile: InputProfileDefinition): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const toggle = panel.querySelector('#input-device-enabled') as HTMLInputElement | null
        if (!toggle) {
            return
        }

        toggle.checked = profile.enabled
    }

    private renderMappingTable(profile: InputProfileDefinition): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const duplicateWarnings = getDuplicateBindingWarnings(profile)

        const rows = INPUT_ACTION_ORDER.map((actionId) => {
            const action = getInputActionDefinition(actionId)
            const bindingText = formatBindingList(profile.bindings[actionId])
            const canEdit = this.isActionEditable(profile, actionId)
            const duplicateWarning = duplicateWarnings.get(actionId)

            return {
                actionId,
                label: action.label,
                bindingText,
                canEdit,
                duplicateWarning
            }
        })

        UIComponentUtils.renderTable(panel, {
            tbodyId: 'input-mapping-tbody',
            rows,
            rowClassName: (row) => row.duplicateWarning ? 'has-binding-warning' : undefined,
            columns: [
                {
                    key: 'action',
                    renderCell: (row) => row.label
                },
                {
                    key: 'binding',
                    renderCell: (row) => `
                        <div>${row.bindingText}</div>
                        ${row.duplicateWarning ? `<div class="input-binding-warning">Warning: ${row.duplicateWarning}</div>` : ''}
                    `
                },
                {
                    key: 'edit',
                    renderCell: (row) => row.canEdit
                        ? `<button type="button" data-input-edit-action="${row.actionId}">Edit</button>`
                        : '<span>Locked</span>'
                }
            ]
        })
    }

    private isActionEditable(profile: InputProfileDefinition, actionId: InputActionId): boolean {
        if (isDerivedLinkedActionLocked(profile, actionId)) {
            return false
        }

        const definition = getInputActionDefinition(actionId)
        return definition.type !== InputActionType.Axis
            || actionId === InputAction.MoveForward
            || actionId === InputAction.MoveBack
            || actionId === InputAction.MoveLeft
            || actionId === InputAction.MoveRight
            || actionId === InputAction.MoveUp
            || actionId === InputAction.MoveDown
            || actionId === InputAction.LookHorizontal
            || actionId === InputAction.LookVertical
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
        this.stopCaptureListeners()
        super.dispose()
    }
}
