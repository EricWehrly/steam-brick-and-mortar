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
import { ANONYMOUS_STORE_USER } from '../../steam/fixtures/demo-games'
import { DEFAULT_SHELF_CONFIG } from '../props/shared/SharedPropsTypes'

export type ShowcaseTuningFamily = 'roughness' | 'fresnel' | 'shadowContact'

export interface ShowcaseComparisonSlot {
    readonly appid: number
    readonly x: number
    readonly y: number
    readonly z: number
    readonly presetName: 'baseline' | 'variant-a' | 'variant-b'
}

export const SHOWCASE_REFERENCE_GAMES = ANONYMOUS_STORE_USER.games.slice(0, 3).map((game) => game.appid)

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
        const comparisonSlots = buildShowcaseComparisonGrid('roughness')
        if (comparisonSlots.length === 0) {
            return
        }

        this.addShowcaseShelves(comparisonSlots)

        if (!this.showcaseGameBoxRenderer) {
            this.showcaseGameBoxRenderer = new GpuGameBoxRenderer(32, 32, 16)
        }

        const lookup = new Map(ANONYMOUS_STORE_USER.games.map((game) => [game.appid, game]))
        const showcaseGames = comparisonSlots.flatMap((slot) => {
            const game = lookup.get(slot.appid)
            return game ? [game] : []
        })

        // First trigger artwork prefetch
        const eventManager = EventManager.getInstance()
        eventManager.emit<BatchReadyForPlacementEvent>(StorePropsEventTypes.BatchReadyForPlacement, {
            games: showcaseGames,
            batchIndex: 0,
            totalBatches: 1,
        })

        const readyPlacements = comparisonSlots.flatMap((slot) => {
            const game = lookup.get(slot.appid)
            if (!game) {
                return []
            }

            return [{
                game: game as SteamGameData,
                position: new THREE.Vector3(
                    slot.x,
                    ShowcaseBootstrapPath.SHOWCASE_SHELF_Y + (ShowcaseBootstrapPath.SHOWCASE_GAME_HEIGHT / 2) + slot.y,
                    -1.6 + slot.z
                ),
                rotation: new THREE.Quaternion(),
            }]
        })

        GameBoxSpawner.emitPlacementIntents(readyPlacements)
        console.info(`Showcase spawned ${comparisonSlots.length} comparison boxes`)
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
