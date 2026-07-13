import * as THREE from 'three'

import type { BootstrapPath } from './BootstrapPath'
import { EventManager } from '../../core/EventManager'
import { DataManager, DataKey } from '../../core/data'
import { StartupEventTracker, StartupPhase } from '../../utils/StartupEventTracker'
import {
    GameEventTypes,
    type BatchReadyForPlacementEvent,
    type StorePropsSetupRequestEvent,
    StorePropsEventTypes,
} from '../../types/InteractionEvents'
import type { SteamGameData } from '../game-box/types/GameData'
import { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import { GameBoxSpawner } from '../spawning/GameBoxSpawner'
import { DEFAULT_SHELF_CONFIG } from '../props/shared/SharedPropsTypes'

export type ShowcaseTuningFamily = 'roughness' | 'fresnel' | 'shadowContact'

export interface ShowcaseComparisonSlot {
    readonly appid: number
    readonly x: number
    readonly y: number
    readonly z: number
    readonly presetName: 'baseline' | 'variant-a' | 'variant-b'
}

// Fixed appids only - just needs 3 known-valid ids for grid layout, not full game data.
// The full SteamGameData (name/artwork/genres) this used to borrow from demo-games.ts's
// hardcoded fixture no longer has a synchronous source - see spawnComparisonGrid() below.
export const SHOWCASE_REFERENCE_GAMES = [440, 570, 730]

export function buildShowcaseComparisonGrid(tuningFamily: ShowcaseTuningFamily): ReadonlyArray<ShowcaseComparisonSlot> {
    void tuningFamily
    const presetOrder: ReadonlyArray<ShowcaseComparisonSlot['presetName']> = ['baseline', 'variant-a', 'variant-b']

    return SHOWCASE_REFERENCE_GAMES.map((appid, index) => ({
        appid,
        x: -2 + index * 2,
        y: 0,
        z: 0,
        presetName: presetOrder[index],
    }))
}

export class ShowcaseBootstrapPath implements BootstrapPath {
    private static readonly SHOWCASE_SHELF_DEPTH = 0.45
    private static readonly SHOWCASE_SHELF_Y = 1.15
    private static readonly SHOWCASE_GAME_HEIGHT = 0.4

    private showcaseGameBoxRenderer: GpuGameBoxRenderer | null = null

    async execute(): Promise<void> {
        const eventManager = EventManager.getInstance()
        const tracker = StartupEventTracker.getInstance()

        tracker.milestone(StartupPhase.WorldBuild, 'Building showcase scene')

        eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, {
            config: {
                enableShelves: false,
                enableGameBoxes: false,
                enableSignage: false
            },
        })

        await this.spawnComparisonGrid()

        eventManager.emit(StorePropsEventTypes.SetupCompleted, {})
    }

    private async spawnComparisonGrid(): Promise<void> {
        // BROKEN, INTENTIONALLY: this used to source full SteamGameData (name/artwork/genres)
        // from demo-games.ts's hardcoded ANONYMOUS_STORE_USER fixture, which is gone - the
        // anonymous store now builds its game list asynchronously from AppDetailsCache (see
        // SteamIntegration.loadDemoGames), and this bootstrap path has no equivalent synchronous
        // source to borrow from. SHOWCASE_MODE_ENABLED is hardcoded false in SceneCoordinator,
        // so this is unreachable in practice. Wire this up to real demo-store data (await
        // SteamApiClient.getFreeToPlayGames(), or a small fixed lookup of its own) before
        // flipping that flag back on.
        alert('ShowcaseBootstrapPath is broken - wire it up to real demo-store data before using it (see spawnComparisonGrid in ShowcaseBootstrapPath.ts)')
    }

    private addShowcaseShelves(slots: ReadonlyArray<ShowcaseComparisonSlot>): void {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (!scene) {
            return
        }

        const shelfGeometry = new THREE.BoxGeometry(
            DEFAULT_SHELF_CONFIG.width,
            DEFAULT_SHELF_CONFIG.boardThickness,
            ShowcaseBootstrapPath.SHOWCASE_SHELF_DEPTH
        )
        const shelfMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d2d32,
            roughness: 0.85,
            metalness: 0.05,
        })

        for (const slot of slots) {
            const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial)
            shelf.name = `showcase-shelf-${slot.presetName}`
            shelf.position.set(slot.x, ShowcaseBootstrapPath.SHOWCASE_SHELF_Y, -1.6 + slot.z)
            shelf.castShadow = true
            shelf.receiveShadow = true
            scene.add(shelf)
        }
    }
}
