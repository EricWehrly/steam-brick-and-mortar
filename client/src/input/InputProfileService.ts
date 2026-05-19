import { EventManager, EventSource } from '../core/EventManager'
import type { InputProfileChangedEvent } from '../types/InteractionEvents'
import { InputEventTypes } from '../types/InteractionEvents'
import type { InputActionId } from './InputActions'
import { InputProfileId, type InputBinding, type InputProfileDefinition, type InputProfileIdValue } from './InputProfile'
import { InputProfileStore } from './InputProfileStore'

export class InputProfileService {
    private readonly eventManager: EventManager
    private readonly profileStore: InputProfileStore
    private activeProfileId: InputProfileIdValue

    constructor(eventManager: EventManager, profileStore: InputProfileStore) {
        this.eventManager = eventManager
        this.profileStore = profileStore
        this.activeProfileId = this.profileStore.getActiveProfileId() ?? InputProfileId.MouseKeyboard
    }

    getProfiles(): ReadonlyArray<InputProfileDefinition> {
        return this.profileStore.getProfiles()
    }

    getEnabledProfiles(): ReadonlyArray<InputProfileDefinition> {
        return this.profileStore.getProfiles().filter(profile => profile.enabled)
    }

    getActiveProfile(): InputProfileDefinition {
        return this.profileStore.getProfile(this.activeProfileId)
    }

    getActiveProfileId(): InputProfileIdValue {
        return this.activeProfileId
    }

    setActiveProfile(profileId: InputProfileIdValue): void {
        if (this.activeProfileId === profileId) {
            return
        }

        this.activeProfileId = profileId
        this.profileStore.setActiveProfileId(profileId)
        this.emitProfileChanged(profileId)
    }

    setProfileEnabled(profileId: InputProfileIdValue, enabled: boolean): void {
        this.profileStore.setProfileEnabled(profileId, enabled)
        this.emitProfileChanged(profileId)
    }

    setActionBinding(actionId: InputActionId, binding: InputBinding): void {
        this.profileStore.setActionBindings(this.activeProfileId, actionId, [binding])
        this.emitProfileChanged(this.activeProfileId)
    }

    resetActiveProfileBindings(): void {
        this.profileStore.clearProfileOverrides(this.activeProfileId)
        this.emitProfileChanged(this.activeProfileId)
    }

    private emitProfileChanged(profileId: InputProfileIdValue): void {
        this.eventManager.emit<InputProfileChangedEvent>(
            InputEventTypes.ProfileChanged,
            { profileId },
            EventSource.UI
        )
    }
}
