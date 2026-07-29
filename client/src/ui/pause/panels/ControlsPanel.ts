/**
 * ControlsPanel - Display controls/help information in pause menu
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { EventManager, EventSource } from '../../../core/EventManager'
import { AppSettings } from '../../../core/AppSettings'
import { InputEventTypes } from '../../../types/InteractionEvents'
import { getInputActionDefinition, InputAction, InputActionType, INPUT_ACTION_ORDER, type InputActionId } from '../../../input/InputActions'
import { getDuplicateBindingWarnings, getLinkedInverseAssignment, isDerivedLinkedActionLocked } from '../../../input/InputBindingUtils'
import { InputBindingCapture } from '../../../input/InputBindingCapture'
import { InputManager } from '../../../input/InputManager'
import { formatBindingList, InputDeviceKind, InputProfileId, type InputBinding, type InputProfileDefinition, type InputProfileIdValue } from '../../../input/InputProfile'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import controlsPanelTemplate from '../templates/controls-panel.html?raw'
import '../../../styles/pause-menu/controls-panel.css'

export class ControlsPanel extends PauseMenuPanel {
    readonly id = 'controls'
    readonly title = 'Input'
    readonly icon = '⌨️'
    private readonly eventManager = EventManager.getInstance()
    private readonly appSettings = AppSettings.getInstance()
    private deviceListenerRegistered = false
    private profileListenerRegistered = false
    private readonly bindingCapture: InputBindingCapture

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
        this.bindingCapture = new InputBindingCapture({
            getActiveProfile: () => InputManager.getActiveInstance()?.profileService.getActiveProfile() ?? null,
            onCaptured: this.handleBindingCaptured.bind(this),
            onStatusUpdate: this.updateCaptureStatus.bind(this)
        })
    }

    render(): string {
        return controlsPanelTemplate
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

        UIComponentUtils.setupToggle(panel, {
            toggleId: 'input-mouse-lock-enabled',
            onChange: this.handleMouseLockEnabledToggle.bind(this)
        })

        UIComponentUtils.setupToggle(panel, {
            toggleId: 'input-gamepad-reticle-enabled',
            onChange: this.handleGamepadReticleEnabledToggle.bind(this)
        })

        UIComponentUtils.setupToggle(panel, {
            toggleId: 'input-look-invert-mouse',
            onChange: (checked) => this.appSettings.setSetting('inputLookInvertMouse', checked, EventSource.UI)
        })

        UIComponentUtils.setupToggle(panel, {
            toggleId: 'input-look-invert-gamepad',
            onChange: (checked) => this.appSettings.setSetting('inputLookInvertGamepad', checked, EventSource.UI)
        })

        UIComponentUtils.setupSliders(panel, [
            {
                sliderId: 'input-look-sensitivity-mouse',
                valueDisplayId: 'input-look-sensitivity-mouse-value',
                formatDisplay: (v) => `${v.toFixed(1)}x`,
                onInput: (value) => this.appSettings.setSetting('inputLookSensitivityMouse', value, EventSource.UI)
            },
            {
                sliderId: 'input-look-sensitivity-gamepad',
                valueDisplayId: 'input-look-sensitivity-gamepad-value',
                formatDisplay: (v) => `${v.toFixed(1)}x`,
                onInput: (value) => this.appSettings.setSetting('inputLookSensitivityGamepad', value, EventSource.UI)
            }
        ])

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
        this.bindingCapture.stop()
    }

    private handleDevicesChanged = (): void => {
        this.refreshUI()
    }

    private handleProfileChanged = (): void => {
        this.refreshUI()
    }

    private handleProfileSelectionChange(selectedProfileId: InputProfileIdValue): void {
        // setActiveProfile() emits ProfileChanged, which this panel already listens for
        // (handleProfileChanged -> refreshUI()) - no need to re-render anything here directly.
        InputManager.getActiveInstance()?.profileService.setActiveProfile(selectedProfileId)
    }

    private handleProfileEnabledToggle(checked: boolean): void {
        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
            return
        }

        inputManager.profileService.setProfileEnabled(inputManager.profileService.getActiveProfileId(), checked)
    }

    private handleMouseLockEnabledToggle(checked: boolean): void {
        this.appSettings.setSetting('inputMouseLockEnabled', checked, EventSource.UI)
    }

    private handleGamepadReticleEnabledToggle(checked: boolean): void {
        this.appSettings.setSetting('inputGamepadReticleEnabled', checked, EventSource.UI)
    }

    private handleResetProfileClick(): void {
        // resetActiveProfileBindings() emits ProfileChanged, which triggers refreshUI() already.
        InputManager.getActiveInstance()?.profileService.resetActiveProfileBindings()
    }

    private handleEditActionClick(actionId: InputActionId): void {
        if (!INPUT_ACTION_ORDER.includes(actionId)) {
            return
        }

        this.bindingCapture.start(actionId)
    }

    // setActionBinding() emits ProfileChanged, which triggers refreshUI() already (including for
    // the linked-inverse assignment below, if any) - nothing left to refresh here.
    private handleBindingCaptured(actionId: InputActionId, binding: InputBinding): void {
        const inputManager = InputManager.getActiveInstance()
        if (!inputManager) {
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

        this.renderDeviceOptions(panel, devices, profiles, activeProfileId)
        this.syncCheckbox(panel, '#input-device-enabled', activeProfile.enabled)
        this.syncCheckbox(panel, '#input-mouse-lock-enabled', this.appSettings.getSetting('inputMouseLockEnabled'))
        this.syncCheckbox(panel, '#input-gamepad-reticle-enabled', this.appSettings.getSetting('inputGamepadReticleEnabled'))
        this.renderLookTuningControls(panel)
        this.updateDeviceSpecificSettingsVisibility(panel, activeProfile)
        this.renderMappingTable(panel, activeProfile)
    }

    private syncCheckbox(panel: HTMLElement, selector: string, checked: boolean): void {
        const checkbox = panel.querySelector(selector) as HTMLInputElement | null
        if (checkbox) {
            checkbox.checked = checked
        }
    }

    /**
     * Mouse Look / Invert / Sensitivity only make sense while a mouse-keyboard profile is
     * selected; Gamepad Reticle / Invert / Sensitivity only for the gamepad profile. Touch/VR
     * show neither group, since neither setting applies to those device kinds today.
     */
    private updateDeviceSpecificSettingsVisibility(panel: HTMLElement, activeProfile: InputProfileDefinition): void {
        const mouseGroup = panel.querySelector('#input-mouse-settings-group') as HTMLElement | null
        const gamepadGroup = panel.querySelector('#input-gamepad-settings-group') as HTMLElement | null

        if (mouseGroup) {
            mouseGroup.style.display = activeProfile.deviceKind === InputDeviceKind.MouseKeyboard ? '' : 'none'
        }
        if (gamepadGroup) {
            gamepadGroup.style.display = activeProfile.deviceKind === InputDeviceKind.Gamepad ? '' : 'none'
        }
    }

    private renderLookTuningControls(panel: HTMLElement): void {
        this.syncCheckbox(panel, '#input-look-invert-mouse', this.appSettings.getSetting('inputLookInvertMouse'))
        this.syncCheckbox(panel, '#input-look-invert-gamepad', this.appSettings.getSetting('inputLookInvertGamepad'))

        UIComponentUtils.updateSliderValue(
            panel, 'input-look-sensitivity-mouse', 'input-look-sensitivity-mouse-value',
            this.appSettings.getSetting('inputLookSensitivityMouse'),
            (v) => `${v.toFixed(1)}x`
        )

        UIComponentUtils.updateSliderValue(
            panel, 'input-look-sensitivity-gamepad', 'input-look-sensitivity-gamepad-value',
            this.appSettings.getSetting('inputLookSensitivityGamepad'),
            (v) => `${v.toFixed(1)}x`
        )
    }

    private renderDeviceOptions(
        panel: HTMLElement,
        devices: ReadonlyArray<{ name: string; profileId: string }>,
        profiles: ReadonlyArray<InputProfileDefinition>,
        activeProfileId: InputProfileIdValue
    ): void {
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

    private renderMappingTable(panel: HTMLElement, profile: InputProfileDefinition): void {
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

        // Joystick axis assignments (both movement and look) aren't remappable yet - force
        // locked for consistency rather than leaving some analog-stick actions editable and
        // others not, depending on whether they happen to have a linked inverse.
        const bindings = profile.bindings[actionId] ?? []
        if (bindings.some(binding => binding.type === 'gamepad-axis')) {
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
        this.bindingCapture.stop()
        super.dispose()
    }
}
