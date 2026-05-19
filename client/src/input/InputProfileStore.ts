import { AppSettings, Setting } from '../core/AppSettings'
import { cloneProfile, type InputBinding, type InputProfileDefinition, type InputProfileIdValue, BUILTIN_INPUT_PROFILES, InputProfileId } from './InputProfile'
import type { InputActionId } from './InputActions'

type ProfileBindings = Partial<Record<InputActionId, ReadonlyArray<InputBinding>>>
type InputBindingsOverrideMap = Partial<Record<InputProfileIdValue, ProfileBindings>>
type DeviceEnabledMap = Record<string, boolean>

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function parseBindingsOverrides(value: string): InputBindingsOverrideMap {
    if (!value) {
        return {}
    }

    try {
        const parsed = JSON.parse(value)
        if (!isObject(parsed)) {
            return {}
        }
        return parsed as InputBindingsOverrideMap
    } catch {
        return {}
    }
}

function parseDeviceEnabledMap(value: string): DeviceEnabledMap {
    if (!value) {
        return {}
    }

    try {
        const parsed = JSON.parse(value)
        if (!isObject(parsed)) {
            return {}
        }
        return parsed as DeviceEnabledMap
    } catch {
        return {}
    }
}

export class InputProfileStore {
    private readonly appSettings: AppSettings

    constructor(appSettings: AppSettings = AppSettings.getInstance()) {
        this.appSettings = appSettings
    }

    getActiveProfileId(): InputProfileIdValue {
        const saved = this.appSettings.getSetting(Setting.InputProfile)
        if (!saved || !Object.values(InputProfileId).includes(saved as InputProfileIdValue)) {
            return InputProfileId.MouseKeyboard
        }

        return saved as InputProfileIdValue
    }

    setActiveProfileId(profileId: InputProfileIdValue): void {
        this.appSettings.setSetting(Setting.InputProfile, profileId)
    }

    getProfiles(): ReadonlyArray<InputProfileDefinition> {
        const overrides = parseBindingsOverrides(this.appSettings.getSetting(Setting.InputBindings))
        const enabledMap = parseDeviceEnabledMap(this.appSettings.getSetting(Setting.InputDevicesEnabled))

        return BUILTIN_INPUT_PROFILES.map(defaultProfile => {
            const merged = cloneProfile(defaultProfile)
            const profileOverride = overrides[defaultProfile.id]

            if (profileOverride) {
                for (const [actionId, bindings] of Object.entries(profileOverride) as Array<[InputActionId, ReadonlyArray<InputBinding>]>) {
                    merged.bindings[actionId] = bindings.map(binding => ({ ...binding }))
                }
            }

            const profileEnabledOverride = enabledMap[defaultProfile.id]
            if (typeof profileEnabledOverride === 'boolean') {
                merged.enabled = profileEnabledOverride
            }

            return merged
        })
    }

    getProfile(profileId: InputProfileIdValue): InputProfileDefinition {
        const profile = this.getProfiles().find(candidate => candidate.id === profileId)
        if (!profile) {
            throw new Error(`Unknown input profile: ${profileId}`)
        }

        return profile
    }

    setProfileBindings(profileId: InputProfileIdValue, bindings: ProfileBindings): void {
        const current = parseBindingsOverrides(this.appSettings.getSetting(Setting.InputBindings))
        current[profileId] = bindings
        this.appSettings.setSetting(Setting.InputBindings, JSON.stringify(current))
    }

    setActionBindings(profileId: InputProfileIdValue, actionId: InputActionId, bindings: ReadonlyArray<InputBinding>): void {
        const current = parseBindingsOverrides(this.appSettings.getSetting(Setting.InputBindings))
        const existingProfile = current[profileId] ?? {}

        current[profileId] = {
            ...existingProfile,
            [actionId]: bindings
        }

        this.appSettings.setSetting(Setting.InputBindings, JSON.stringify(current))
    }

    clearProfileOverrides(profileId: InputProfileIdValue): void {
        const current = parseBindingsOverrides(this.appSettings.getSetting(Setting.InputBindings))
        if (!current[profileId]) {
            return
        }

        delete current[profileId]
        this.appSettings.setSetting(Setting.InputBindings, JSON.stringify(current))
    }

    isProfileEnabled(profileId: InputProfileIdValue): boolean {
        const enabledMap = parseDeviceEnabledMap(this.appSettings.getSetting(Setting.InputDevicesEnabled))
        return enabledMap[profileId] ?? true
    }

    setProfileEnabled(profileId: InputProfileIdValue, enabled: boolean): void {
        const enabledMap = parseDeviceEnabledMap(this.appSettings.getSetting(Setting.InputDevicesEnabled))
        enabledMap[profileId] = enabled
        this.appSettings.setSetting(Setting.InputDevicesEnabled, JSON.stringify(enabledMap))
    }
}
