import type * as THREE from 'three'
import type { BootstrapPath } from './BootstrapPath'
import { EventManager } from '../../core/EventManager'
import { StartupEventTracker, StartupPhase } from '../../utils/StartupEventTracker'
import { type StorePropsSetupRequestEvent, StorePropsEventTypes } from '../../types/InteractionEvents'
import { StorePropsCoordinator } from '../props/StorePropsCoordinator'
import { GameBoxSpawner } from '../spawning/GameBoxSpawner'
import { UserPropPlacer } from '../props/UserPropPlacer'
import { WallPosterPlacer } from '../props/wall-art/WallPosterPlacer'
import { DataManager } from '../../core/data'

export class DefaultBootstrapPath implements BootstrapPath {

    async execute(): Promise<void> {
        const eventManager = EventManager.getInstance()
        const tracker = StartupEventTracker.getInstance()

        StorePropsCoordinator.getInstance()
        GameBoxSpawner.getInstance()
        this.constructUserPropPlacer()
        this.constructWallPosterPlacer()

        // 🏪 Props (room, shelves, games — the heavy stuff)
        tracker.milestone(StartupPhase.WorldBuild, 'Building store')
        this.requestPropsSetup(eventManager)
    }

    // Must run before requestPropsSetup(), same as GameBoxSpawner above: ShelfLayoutCoordinator
    // emits its ShelfReady wave in direct response to SetupRequest, and EventTarget doesn't
    // replay past events to late subscribers. UserPropPlacer used to be constructed lazily on
    // the first RoomEventTypes.Resized (itself fired only after that wave already completed),
    // so its ShelfReady listener always registered too late and every prop queued forever.
    private constructUserPropPlacer(): void {
        const scene = DataManager.getInstance().get<THREE.Scene>('core.mainScene')
        if (!scene) return
        UserPropPlacer.getInstance(scene)
    }

    // Same ordering requirement as constructUserPropPlacer above: must be registered before
    // requestPropsSetup() so its RoomEventTypes.Resized listener is in place before RoomManager
    // fires it (downstream of the shelf-layout wave that setup request triggers).
    private constructWallPosterPlacer(): void {
        const scene = DataManager.getInstance().get<THREE.Scene>('core.mainScene')
        if (!scene) return
        WallPosterPlacer.getInstance(scene)
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
