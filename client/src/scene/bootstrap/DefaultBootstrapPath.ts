import type { BootstrapPath } from './BootstrapPath'
import { EventManager } from '../../core/EventManager'
import { StartupEventTracker, StartupPhase } from '../../utils/StartupEventTracker'
import { type StorePropsSetupRequestEvent, StorePropsEventTypes } from '../../types/InteractionEvents'
import { StorePropsCoordinator } from '../props/StorePropsCoordinator'
import { GameBoxSpawner } from '../spawning/GameBoxSpawner'
import { UserPropPlacer } from '../props/UserPropPlacer'
import { WallPosterPlacer } from '../props/wall-art/WallPosterPlacer'

export class DefaultBootstrapPath implements BootstrapPath {

    async execute(): Promise<void> {
        const eventManager = EventManager.getInstance()
        const tracker = StartupEventTracker.getInstance()

        StorePropsCoordinator.getInstance()
        GameBoxSpawner.getInstance()
        // Must run before requestPropsSetup(), same as GameBoxSpawner above: ShelfLayoutCoordinator
        // emits its ShelfReady wave in direct response to SetupRequest, and EventTarget doesn't
        // replay past events to late subscribers. UserPropPlacer used to be constructed lazily on
        // the first RoomEventTypes.Resized (itself fired only after that wave already completed),
        // so its ShelfReady listener always registered too late and every prop queued forever.
        UserPropPlacer.getInstance()
        WallPosterPlacer.getInstance()

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
