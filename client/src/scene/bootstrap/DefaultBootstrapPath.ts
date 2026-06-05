import type { BootstrapPath } from './BootstrapPath'
import { EventManager } from '../../core/EventManager'
import { StartupEventTracker, StartupPhase } from '../../utils/StartupEventTracker'
import { type StorePropsSetupRequestEvent, StorePropsEventTypes } from '../../types/InteractionEvents'
import { StorePropsCoordinator } from '../props/StorePropsCoordinator'
import { GameBoxSpawner } from '../spawning/GameBoxSpawner'

export class DefaultBootstrapPath implements BootstrapPath {

    async execute(): Promise<void> {
        const eventManager = EventManager.getInstance()
        const tracker = StartupEventTracker.getInstance()

        StorePropsCoordinator.getInstance()
        GameBoxSpawner.getInstance()

        // 🏪 Props (room, shelves, games — the heavy stuff)
        tracker.milestone(StartupPhase.WorldBuild, 'Building store')
        this.requestPropsSetup(eventManager)
    }

    private requestPropsSetup(eventManager: EventManager): void {
        // Simply emit the setup request - handlers will get dependencies themselves
        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, {
            config: {
                enableShelves: true,
                enableGameBoxes: true,
                enableSignage: true
            },
        })
    }
}
